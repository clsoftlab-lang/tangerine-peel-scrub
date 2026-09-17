// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// recommender.js — 피부타입 진단 추천 엔진 (규칙 기반, 설명 가능)
// -----------------------------------------------------------------------------
// 입력: 설문(survey) + 제품 목록(products)
// 출력: 점수순 추천(picks) + 각 추천의 "이유(reasons)"
//
// 설문 필드
//   skinType    : "건성" | "지성" | "복합" | "민감성" | "트러블성"
//   area        : "face" | "body" | "both"
//   sensitivity : "low" | "med" | "high"   (향/자극 민감도)
//   scent       : "무관" | "무향" | "시트러스" | "허브" | "플로럴" | "우디"
//   vegan       : boolean  (비건 선호)
//   budget      : number   (제품당 예산, 0 = 무관)
//
// 점수 규칙(모두 문서화된 가산/감산):
//   1) 피부타입 일치 : product.skinTypes 에 survey.skinType 포함 → +35
//   2) 사용 부위     : area==="both" → +8, 아니면 카테고리 일치 +20 / 불일치 -12
//   3) 자극 민감도   : sensitivity==="high" → 무향 +14, 저자극 배지 +10,
//                      미세플라스틱프리 +4, 향 있으면 -8 (허브 제외 완화)
//                      sensitivity==="low" → 향 있는 제품 소폭 +4
//   4) 향 선호       : scent 지정 && product.scent 일치 → +12
//   5) 비건 선호     : vegan && product.vegan → +6
//   6) 예산          : 초과 -20 / 예산의 55% 이하로 저렴 +4
//   7) 평점 보정     : rating(0~5) 소수 가산으로 동점 정렬 안정화
// area==="both" 이면 페이스·바디를 고르게 커버하도록 그리디 선택한다.
// 본 로직은 의학적 진단이 아닌 규칙 기반 데모 추천이다.
// -----------------------------------------------------------------------------

/** 배열 교집합 */
export function intersect(a = [], b = []) {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

/** 향이 있는 제품인지 (무향이 아니면 향 있음) */
export function isScented(product) {
  return (product.scent || "무향") !== "무향";
}

/**
 * 단일 제품 점수 계산.
 * @returns {{score:number, reasons:string[]}}
 */
export function scoreProduct(product, survey = {}) {
  const reasons = [];
  let score = 0;

  // 1) 피부타입 일치
  if (survey.skinType && (product.skinTypes || []).includes(survey.skinType)) {
    score += 35;
    reasons.push(`${survey.skinType} 피부에 적합`);
  }

  // 2) 사용 부위
  const area = survey.area || "both";
  if (area === "both") {
    score += 8;
  } else if (product.category === area) {
    score += 20;
    reasons.push(area === "face" ? "페이스 전용" : "바디 전용");
  } else {
    score -= 12;
  }

  // 3) 자극 민감도
  const sens = survey.sensitivity || "med";
  const badges = product.badges || [];
  if (sens === "high") {
    if (product.scent === "무향") { score += 14; reasons.push("무향으로 향 자극 최소화"); }
    if (badges.includes("저자극")) { score += 10; reasons.push("저자극 처방"); }
    if (product.microplasticFree) score += 4;
    if (isScented(product)) score -= product.scent === "허브" ? 4 : 8;
  } else if (sens === "low") {
    if (isScented(product)) { score += 4; reasons.push("향을 즐기기 좋은 제품"); }
  }

  // 4) 향 선호
  if (survey.scent && survey.scent !== "무관" && product.scent === survey.scent) {
    score += 12;
    reasons.push(`선호하는 ${survey.scent} 향`);
  }

  // 5) 비건 선호
  if (survey.vegan && product.vegan) {
    score += 6;
    reasons.push("비건");
  }

  // 6) 예산
  const budget = Number(survey.budget) || 0;
  if (budget > 0) {
    if (product.price > budget) {
      score -= 20;
      reasons.push("예산 초과: 감산");
    } else if (product.price <= budget * 0.55) {
      score += 4;
      reasons.push("예산 대비 합리적 가격");
    }
  }

  // 7) 평점 보정
  score += (Number(product.rating) || 0) * 0.7;

  return { score: Math.round(score * 100) / 100, reasons };
}

/**
 * 추천 목록 생성.
 * @param {object} survey
 * @param {Array} products
 * @param {object} [opts] { max=3, minScore=1 }
 * @returns {{picks:Array<{product,score,reasons}>, scored:Array}}
 */
export function recommend(survey = {}, products = [], opts = {}) {
  const max = opts.max || 3;
  const minScore = opts.minScore != null ? opts.minScore : 1;

  const scored = products
    .map((p) => {
      const s = scoreProduct(p, survey);
      return { product: p, score: s.score, reasons: s.reasons };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const picks = [];
  const area = survey.area || "both";

  if (area === "both") {
    // 페이스·바디를 각각 최소 1개씩 커버
    const bestFace = scored.find((x) => x.product.category === "face");
    const bestBody = scored.find((x) => x.product.category === "body");
    if (bestFace) picks.push(bestFace);
    if (bestBody && !picks.includes(bestBody)) picks.push(bestBody);
  }
  // 남은 자리는 전체 점수순으로 채움
  for (const x of scored) {
    if (picks.length >= max) break;
    if (!picks.includes(x)) picks.push(x);
  }

  return { picks: picks.slice(0, max), scored };
}

export default { recommend, scoreProduct, intersect, isScented };
