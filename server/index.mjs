// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// index.mjs — 귤결 AI 백엔드 프록시 (브라우저에 키를 노출하지 않기 위한 서버)
// -----------------------------------------------------------------------------
// POST /api/ai  body: { task, payload }
//   → Claude 로 스트리밍 요청하고, 생성 텍스트를 그대로 응답 본문에 흘려보낸다.
//     프런트엔드 ai/ai.js 가 이 스트림을 읽어 화면에 렌더링한다.
//
// 고도화 — 무인·저비용 실 AI 연동:
//   · 비용 우선 기본 모델(claude-haiku-4-5, AI_MODEL 로 상향 가능)
//   · 프롬프트 캐싱(안정적 시스템 프롬프트를 ephemeral 캐시로 재사용)
//   · Haiku 는 thinking/effort 미지원 → 미전송(400 방지), 그 외엔 adaptive+effort
//   · 과금 가드레일: IP당 분당 레이트리밋 + 월 토큰 예산(초과 시 429 {fallback:true})
//
// 실행:  cp .env.example .env  → .env 에 실제 키 입력  → npm install  → npm start
// ⚠️ ANTHROPIC_API_KEY 는 이 서버(.env, git 제외)에만 존재한다. 절대 브라우저/레포 금지.
// -----------------------------------------------------------------------------

import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 8787;

// 비용 우선 기본값. 품질을 높이려면 AI_MODEL 을 claude-sonnet-5 또는 claude-opus-5 로.
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 700; // 태스크당 소박한 출력 상한
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP) || 2_000_000;
const RATE_PER_MIN = Number(process.env.AI_RATE_PER_MIN) || 20; // IP당 분당 요청 상한

// ANTHROPIC_API_KEY 환경변수에서 키를 읽는다(서버 사이드 전용).
const client = new Anthropic();

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

// 안정적(태스크별 고정) 시스템 프롬프트를 캐시 블록으로 보낸다 → 반복 호출 시 캐시 적중, 비용 절감.
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

// ---- 과금 가드레일: 월 토큰 예산 --------------------------------------------
let monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
let monthlyTokens = 0;
function rollMonth() {
  const k = new Date().toISOString().slice(0, 7);
  if (k !== monthKey) { monthKey = k; monthlyTokens = 0; }
}
function budgetExceeded() { rollMonth(); return monthlyTokens >= MONTHLY_TOKEN_CAP; }
function noteUsage(usage) {
  if (!usage) return;
  rollMonth();
  monthlyTokens +=
    (usage.input_tokens || 0) + (usage.output_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
}

// ---- 과금 가드레일: IP당 분당 레이트리밋 ------------------------------------
const rate = new Map(); // ip -> { count, resetAt }
function rateLimited(ip) {
  const now = Date.now();
  const rec = rate.get(ip);
  if (!rec || now > rec.resetAt) { rate.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  rec.count += 1;
  return rec.count > RATE_PER_MIN;
}
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy(); // 1MB 방어
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/api/ai")) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  // 가드레일: 초과 시 429 {fallback:true} → 프런트가 목업으로 자동 폴백(무단 안전)
  if (rateLimited(clientIp(req)) || budgetExceeded()) {
    res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ fallback: true }));
    return;
  }

  try {
    const body = await readBody(req);
    const { task, payload } = JSON.parse(body || "{}");
    const messages = buildMessages(task, payload);

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    });

    // Haiku 4.5 는 adaptive thinking/effort 를 받지 않는다(400 방지) → 미전송.
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks(task),
      messages,
    };
    if (!MODEL.startsWith("claude-haiku")) {
      params.thinking = { type: "adaptive" };
      params.output_config = { effort: process.env.AI_EFFORT || "low" };
    }

    const stream = client.messages.stream(params);
    stream.on("text", (t) => res.write(t));
    const final = await stream.finalMessage();
    noteUsage(final && final.usage); // 스트림 최종 메시지의 usage 를 월 예산에 누적
    res.end();
  } catch (err) {
    const msg = "AI 오류: " + (err && err.message ? err.message : String(err));
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end(msg);
  }
});

server.listen(PORT, () => {
  console.log(`귤결 AI 프록시가 http://localhost:${PORT}/api/ai 에서 실행 중입니다. (model=${MODEL})`);
});
