// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// index.mjs — 귤결 AI 백엔드 프록시 (브라우저에 키를 노출하지 않기 위한 서버)
// -----------------------------------------------------------------------------
// POST /api/ai  body: { task, payload }
//   → Claude(claude-opus-5)로 스트리밍 요청하고, 생성 텍스트를 그대로 응답 본문에
//     흘려보낸다. 프런트엔드 ai/ai.js 가 이 스트림을 읽어 화면에 렌더링한다.
//
// 실행:  cp .env.example .env  → .env 에 실제 키 입력  → npm install  → npm start
// ⚠️ ANTHROPIC_API_KEY 는 이 서버(.env, git 제외)에만 존재한다. 절대 브라우저/레포 금지.
// -----------------------------------------------------------------------------

import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 8787;

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
};

function buildMessages(task, payload) {
  const content =
    `과제(task): ${task}\n` +
    `입력(payload) JSON:\n${JSON.stringify(payload ?? {}, null, 2)}\n\n` +
    "위 데이터에 근거해 한국어로 답변하세요.";
  return [{ role: "user", content }];
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

  try {
    const body = await readBody(req);
    const { task, payload } = JSON.parse(body || "{}");
    const system = SYSTEMS[task] || SYSTEMS.chat;
    const messages = buildMessages(task, payload);

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    });

    const stream = client.messages.stream({
      model: "claude-opus-5",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system,
      messages,
    });

    stream.on("text", (t) => res.write(t));
    await stream.finalMessage();
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
  console.log(`귤결 AI 프록시가 http://localhost:${PORT}/api/ai 에서 실행 중입니다.`);
});
