// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai.js — 플러그러블 AI 레이어 (데모=목업 / 실연동=백엔드 프록시 스트리밍)
// -----------------------------------------------------------------------------
// askAI(task, payload, { onToken }) :
//   - AI_ENDPOINT 가 비어 있으면 결정적 한국어 MockProvider 로 응답.
//     앱의 제품 데이터(payload.products)와 규칙 기반 추천 엔진(recommender)을
//     그대로 재사용하여 근거 있는 답변을 만든다.
//   - AI_ENDPOINT 가 설정되어 있으면 { task, payload } 를 POST 하고 응답을
//     스트리밍으로 읽어 onToken 으로 흘려보낸다. (키는 서버에만 존재)
//
// task 종류
//   "chat"    : AI 스킨케어 상담 챗봇 (피부타입/고민 → 제품 추천)
//   "explain" : 피부타입 추천 설명
//   "copy"    : 브랜드 스토리 / 제품 카피 생성 (업사이클·친환경 강조)
//
// 모든 답변은 의학적 진단이 아님을 명시한다(라벨).
// -----------------------------------------------------------------------------

import { recommend } from "../js/recommender.js";
import { AI_ENDPOINT } from "./config.js";

const NOT_MEDICAL = "※ 규칙 기반/생성 데모이며 의학적·피부과적 진단이 아닙니다.";

/**
 * AI 요청 진입점.
 * @param {"chat"|"explain"|"copy"} task
 * @param {object} payload
 * @param {{onToken?:(t:string)=>void}} [opts]
 * @returns {Promise<string>} 전체 응답 텍스트
 */
export async function askAI(task, payload = {}, { onToken } = {}) {
  if (!AI_ENDPOINT) return mockProvider(task, payload, onToken);
  return remoteProvider(task, payload, onToken);
}

// ---- 실연동: 백엔드 프록시 스트리밍 -----------------------------------------
async function remoteProvider(task, payload, onToken) {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload }),
  });
  if (!res.ok) throw new Error(`AI 요청 실패 (HTTP ${res.status})`);
  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    if (typeof onToken === "function") onToken(text);
    return text;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    full += chunk;
    if (typeof onToken === "function") onToken(chunk);
  }
  return full;
}

// ---- 데모: 결정적 한국어 MockProvider ---------------------------------------
async function mockProvider(task, payload, onToken) {
  let text;
  switch (task) {
    case "explain": text = mockExplain(payload); break;
    case "copy": text = mockCopy(payload); break;
    case "chat":
    default: text = mockChat(payload); break;
  }
  return emit(text, onToken);
}

const won = (n) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
const getProducts = (p) => (Array.isArray(p.products) ? p.products : []);

function inferSkinType(msg = "") {
  const m = String(msg);
  if (/(민감|예민|붉|자극)/.test(m)) return "민감성";
  if (/(트러블|여드름|뾰루지|좁쌀)/.test(m)) return "트러블성";
  if (/(지성|번들|유분|기름)/.test(m)) return "지성";
  if (/(복합|T존|티존)/.test(m)) return "복합";
  if (/(건성|건조|당김|당겨)/.test(m)) return "건성";
  return "";
}

function inferConcerns(msg = "") {
  const m = String(msg);
  const out = [];
  if (/각질/.test(m)) out.push("각질");
  if (/(모공|피지|블랙헤드)/.test(m)) out.push("모공·피지");
  if (/(트러블|여드름)/.test(m)) out.push("트러블");
  if (/(건조|당김)/.test(m)) out.push("건조");
  if (/(칙칙|톤|미백|화사)/.test(m)) out.push("칙칙함·톤");
  return out;
}

const SKIN_PROFILE = {
  "건성": { desc: "피지 분비가 적어 쉽게 당기고 각질이 일어나는 타입", key: "보습 장벽 강화와 부드러운 각질 정돈", avoid: "거친 입자·과도한 세정" },
  "지성": { desc: "피지와 유분이 많아 번들거리고 모공이 도드라지는 타입", key: "피지·묵은 각질 정돈과 산뜻한 마무리", avoid: "지나친 유분 공급" },
  "복합": { desc: "T존은 유분, 볼은 건조한 두 얼굴의 타입", key: "부위별 균형 — 각질 정돈과 수분 공급의 조화", avoid: "한쪽에만 치우친 케어" },
  "민감성": { desc: "외부 자극에 쉽게 붉어지고 예민해지는 타입", key: "무향·저자극 처방과 진정", avoid: "강한 향료·거친 스크럽" },
  "트러블성": { desc: "피지와 각질이 모공을 막아 트러블이 잦은 타입", key: "부드러운 각질 관리와 진정 성분", avoid: "물리적 자극 과다" },
};

function mockChat(p) {
  const products = getProducts(p);
  const msg = p.message || "";
  const skinType = p.skinType || inferSkinType(msg) || "복합";
  const concerns = inferConcerns(msg);
  const survey = {
    skinType,
    area: p.area || "both",
    sensitivity: p.sensitivity || (skinType === "민감성" ? "high" : "med"),
    scent: p.scent || "무관",
    vegan: p.vegan != null ? !!p.vegan : true,
    budget: Number(p.budget) || 0,
  };
  const { picks } = recommend(survey, products, { max: 3 });
  const lines = [];
  lines.push("안녕하세요, 귤결 AI 스킨케어 상담입니다. 😊");
  lines.push(`말씀해 주신 내용을 ${skinType} 피부${concerns.length ? ` · ${concerns.join(", ")} 고민` : ""}으로 이해했어요.`);
  if (!products.length || !picks.length) {
    lines.push("");
    lines.push("지금은 추천할 제품 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  } else {
    lines.push("");
    lines.push(`추천 스크럽 ${picks.length}종을 골라봤어요:`);
    picks.forEach((x, i) => {
      const pr = x.product;
      lines.push(`${i + 1}. ${pr.name} (${won(pr.price)}) — ${pr.category === "face" ? "페이스" : "바디"} · 향: ${pr.scent}`);
      const rs = (x.reasons || []).slice(0, 3);
      if (rs.length) lines.push(`   추천 이유: ${rs.join(" / ")}`);
      if (pr.usage) lines.push(`   사용법: ${pr.usage}`);
    });
    lines.push("");
    const cadence = skinType === "민감성" || skinType === "건성" ? "주 1~2회부터 순하게 시작" : "주 2~3회 규칙적으로 사용";
    lines.push(`${skinType} 피부라면 ${cadence}하시길 권해요. 모든 제품은 제주 귤껍질을 업사이클한 미세플라스틱 프리 입자를 씁니다.`);
  }
  lines.push("");
  lines.push(NOT_MEDICAL);
  return lines.join("\n");
}

function mockExplain(p) {
  const products = getProducts(p);
  const skinType = p.skinType || "복합";
  const prof = SKIN_PROFILE[skinType] || SKIN_PROFILE["복합"];
  const survey = { skinType, area: "both", sensitivity: skinType === "민감성" ? "high" : "med", scent: "무관", vegan: true, budget: 0 };
  const { picks } = recommend(survey, products, { max: 2 });
  const out = [];
  out.push(`■ ${skinType} 피부란?`);
  out.push(`${prof.desc}입니다.`);
  out.push("");
  out.push("■ 케어 포인트");
  out.push(`- 핵심: ${prof.key}`);
  out.push(`- 피해야 할 것: ${prof.avoid}`);
  out.push("");
  if (picks.length) {
    out.push("■ 왜 이 제품을 추천했을까요");
    picks.forEach((x) => {
      const reasons = (x.reasons || []).slice(0, 3).join(", ") || "종합 점수 상위";
      out.push(`· ${x.product.name}: ${reasons}`);
    });
    out.push("");
  }
  out.push(`귤결의 귤피 입자는 미세플라스틱을 대신하는 생분해 스크럽으로, ${skinType} 피부의 각질 케어를 순하게 돕습니다.`);
  out.push("");
  out.push(NOT_MEDICAL);
  return out.join("\n");
}

function mockCopy(p) {
  if (p.kind === "brand") {
    const bs = p.brandStory || {};
    const out = [];
    out.push("[브랜드 스토리 — 귤결(GyulGyeol)]");
    out.push("");
    out.push(bs.title || "버려지던 제주 귤껍질, 피부를 위한 스크럽으로");
    out.push("");
    out.push("제주의 겨울이 남기는 것은 감귤의 단맛만이 아닙니다. 매년 수만 톤씩 버려지던 귤껍질 — 귤결은 그 폐기물을 저온 분쇄해 미세플라스틱 마이크로비드를 대신하는 생분해 스크럽 입자로 되살립니다.");
    out.push("바다에 플라스틱을 남기지 않는 각질 케어, 동물 실험 없는 비건 처방, 향에 예민한 피부까지 배려한 무향 라인. 귤결은 제주의 순환을 피부 위에서 완성합니다.");
    out.push("껍질 한 줌이 스크럽 한 통이 되는 여정 — 당신의 세안이 곧 업사이클입니다.");
    out.push("");
    out.push(NOT_MEDICAL);
    return out.join("\n");
  }
  const pr = p.product;
  if (!pr) return "카피를 생성할 제품을 찾지 못했습니다.\n\n" + NOT_MEDICAL;
  const scentPhrase = pr.scent === "무향" ? "향 없이 순하게" : `${pr.scent} 향으로`;
  const out = [];
  out.push(`[제품 카피 — ${pr.name}]`);
  out.push("");
  out.push("▶ 헤드라인");
  out.push(`"버려진 ${pr.grainSource || "제주 귤껍질"}, ${scentPhrase} 되살아난 ${pr.category === "face" ? "페이스" : "바디"} 스크럽"`);
  out.push("");
  out.push("▶ 서브카피");
  out.push(pr.description || "제주 귤껍질을 업사이클한 미세플라스틱 프리 스크럽입니다.");
  out.push("");
  out.push("▶ 세 줄 요약");
  out.push("· 미세플라스틱 프리: 플라스틱 대신 생분해 귤피 입자로 각질 케어");
  out.push(`· 업사이클 임팩트: 한 개당 약 ${pr.peelGrams}g의 제주 귤껍질을 되살립니다`);
  out.push(`· ${(pr.badges || []).join(" · ") || "비건 · 저자극"}`);
  out.push("");
  out.push(`지구를 위한 선택이 피부에게도 순한 선택이 되도록 — ${pr.name}.`);
  out.push("");
  out.push(NOT_MEDICAL);
  return out.join("\n");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 결정적 텍스트를 어절 단위로 흘려보내 스트리밍 UX 를 재현한다(내용은 불변).
async function emit(text, onToken) {
  if (typeof onToken !== "function") return text;
  const parts = text.match(/\S+\s*|\s+/g) || [text];
  for (const part of parts) {
    onToken(part);
    await sleep(10);
  }
  return text;
}

export default { askAI };
