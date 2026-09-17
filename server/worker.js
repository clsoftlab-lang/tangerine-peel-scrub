// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// worker.js — 귤결 AI 프록시의 Cloudflare Workers 변형 (무료 티어, 무인 운영)
// -----------------------------------------------------------------------------
// index.mjs 와 동일한 태스크 라우팅·모델·캐싱 규칙으로 Anthropic REST 를 호출한다.
//   POST /api/ai  body: { task, payload }  → 생성된 어시스턴트 텍스트를 반환.
//
// 무단(autonomous): 관리할 서버가 없는 무료 호스팅. 키는 Worker 시크릿에만 존재.
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler deploy
// ⚠️ 키는 절대 브라우저/레포에 두지 않는다 (env.ANTHROPIC_API_KEY = Worker 시크릿).
// -----------------------------------------------------------------------------

const MODEL_DEFAULT = "claude-haiku-4-5"; // 비용 우선. env.AI_MODEL 로 상향 가능.
const MAX_TOKENS = 700;
const MONTHLY_TOKEN_CAP_DEFAULT = 2_000_000;
const RATE_PER_MIN = 20;

const BASE_SYSTEM =
  "당신은 친환경 업사이클 스크럽 브랜드 '귤결(GyulGyeol)'의 한국어 AI 어시스턴트입니다. " +
  "제주 귤껍질 업사이클과 미세플라스틱 프리·비건·저자극 가치를 강조하되, " +
  "의학적·피부과적 진단이나 치료를 제공하지 않습니다. " +
  "제공된 제품 데이터(payload)에 근거해 답하고 없는 사실을 지어내지 않습니다. " +
  "반드시 답변 끝에 '※ 규칙 기반/생성 데모이며 의학적·피부과적 진단이 아닙니다.'를 덧붙입니다.";

const SYSTEMS = {
  chat: BASE_SYSTEM + " 사용자의 피부 고민을 듣고 제공된 제품 목록에서 적절한 스크럽을 추천하고 사용법을 안내하세요.",
  explain: BASE_SYSTEM + " 사용자의 피부타입 특징과 케어 포인트, 추천 이유를 이해하기 쉽게 설명하세요.",
  copy: BASE_SYSTEM + " 업사이클·친환경 가치를 강조한 브랜드 스토리 또는 제품 마케팅 카피를 작성하세요.",
  digest: BASE_SYSTEM + " 계절 흐름을 고려해 오늘의 맞춤 스크럽 추천을 2~3줄로 짧고 친근하게 요약하세요.",
};

// 안정적(태스크별 고정) 시스템 프롬프트를 캐시 블록으로 → 반복 호출 비용 절감.
function systemBlocks(task) {
  const text = SYSTEMS[task] || SYSTEMS.chat;
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

function buildMessages(task, payload) {
  const content =
    `과제(task): ${task}\n` +
    `입력(payload) JSON:\n${JSON.stringify(payload ?? {}, null, 2)}\n\n` +
    "위 데이터에 근거해 한국어로 답변하세요.";
  return [{ role: "user", content }];
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 과금 가드레일(아이솔레이트 메모리 기준, 베스트에포트) --------------------------
let monthKey = new Date().toISOString().slice(0, 7);
let monthlyTokens = 0;
const rate = new Map(); // ip -> { count, resetAt }
function rollMonth() {
  const k = new Date().toISOString().slice(0, 7);
  if (k !== monthKey) { monthKey = k; monthlyTokens = 0; }
}
function rateLimited(ip) {
  const now = Date.now();
  const rec = rate.get(ip);
  if (!rec || now > rec.resetAt) { rate.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  rec.count += 1;
  return rec.count > RATE_PER_MIN;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.startsWith("/api/ai")) {
      return new Response("Not found", { status: 404, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });
    }

    const cap = Number(env.AI_MONTHLY_TOKEN_CAP) || MONTHLY_TOKEN_CAP_DEFAULT;
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    rollMonth();
    if (rateLimited(ip) || monthlyTokens >= cap) {
      // 초과 시 429 {fallback:true} → 프런트가 목업으로 자동 폴백(무단 안전).
      return new Response(JSON.stringify({ fallback: true }), {
        status: 429, headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
      });
    }

    try {
      const { task, payload } = await request.json();
      const model = env.AI_MODEL || MODEL_DEFAULT;

      const body = {
        model,
        max_tokens: MAX_TOKENS,
        system: systemBlocks(task),
        messages: buildMessages(task, payload),
      };
      // Haiku 4.5 는 adaptive thinking/effort 미지원(400 방지) → 미전송.
      if (!model.startsWith("claude-haiku")) {
        body.thinking = { type: "adaptive" };
        body.output_config = { effort: env.AI_EFFORT || "low" };
      }

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        // 원격 실패 → 프런트가 목업으로 폴백하도록 429 {fallback:true}.
        return new Response(JSON.stringify({ fallback: true }), {
          status: 429, headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
        });
      }

      const data = await r.json();
      const usage = data.usage || {};
      monthlyTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);

      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return new Response(text, { headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });
    } catch (_err) {
      return new Response(JSON.stringify({ fallback: true }), {
        status: 429, headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
      });
    }
  },
};
