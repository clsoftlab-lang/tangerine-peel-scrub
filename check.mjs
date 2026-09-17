// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — 의존성 없는 CI 검증기 (node check.mjs)
//   1) 모든 JSON 파싱
//   2) 모든 JS/MJS `node --check`
//   3) index.html 필수 컨테이너
//   4) 데이터 무결성
//   5) 피부타입 추천 엔진(recommender.js) 단위 테스트
//   6) 장바구니/임팩트(cart.js) 단위 테스트

import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { recommend, scoreProduct } from "./js/recommender.js";
import { summarize, addToCart, setQty, peelToTangerines } from "./js/cart.js";
import { AI_ENDPOINT } from "./ai/config.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, err) => { fail++; console.error(`  ✗ ${name}${err ? " — " + err : ""}`); };
const assert = (cond, name) => (cond ? ok(name) : bad(name));

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".git")) continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const rel = (f) => f.replace(ROOT, "").replace(/\\/g, "/");

// 1) JSON 파싱 ---------------------------------------------------------------
console.log("\n[1] JSON 파싱");
let productsData, content;
for (const f of files.filter((f) => extname(f) === ".json")) {
  try {
    const data = JSON.parse(readFileSync(f, "utf8"));
    if (f.endsWith("products.json")) productsData = data;
    if (f.endsWith("content.json")) content = data;
    ok(`파싱: ${rel(f)}`);
  } catch (e) { bad(`파싱: ${rel(f)}`, e.message); }
}

// 2) JS 문법 검사 ------------------------------------------------------------
console.log("\n[2] node --check (JS 문법)");
for (const f of files.filter((f) => [".js", ".mjs"].includes(extname(f)))) {
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
    ok(`문법: ${rel(f)}`);
  } catch (e) { bad(`문법: ${rel(f)}`, String(e.stderr || e.message).slice(0, 200)); }
}

// 3) index.html 필수 컨테이너 -------------------------------------------------
console.log("\n[3] index.html 필수 컨테이너");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
for (const needle of [
  'id="app"', 'id="view"', 'id="nav"', 'id="notice"',
  'id="cart-badge"', 'id="wish-badge"',
  'data-nav="home"', 'data-nav="catalog"', 'data-nav="survey"',
  'data-nav="sustainability"', 'data-nav="cart"', 'data-nav="wishlist"',
  'data-nav="ai"',
  './app.js',
]) {
  assert(html.includes(needle), `포함: ${needle}`);
}

// 4) 데이터 무결성 -----------------------------------------------------------
console.log("\n[4] 데이터 무결성");
const products = productsData?.products || [];
assert(products.length >= 20, `제품 20개 이상 (실제 ${products.length}개)`);
const ids = new Set();
let idOk = true, fieldOk = true;
for (const p of products) {
  if (ids.has(p.id)) idOk = false;
  ids.add(p.id);
  if (!p.name || !p.category || !Array.isArray(p.skinTypes) || !p.skinTypes.length ||
      !Array.isArray(p.ingredients) || !p.ingredients.length ||
      typeof p.price !== "number" || typeof p.peelGrams !== "number") fieldOk = false;
}
assert(idOk, "제품 id 중복 없음");
assert(fieldOk, "필수 필드(name/category/skinTypes/ingredients/price/peelGrams) 보유");
const cats = new Set(products.map((p) => p.category));
assert(cats.has("face") && cats.has("body"), "페이스·바디 카테고리 모두 존재");
const skinSet = new Set(products.flatMap((p) => p.skinTypes));
assert(["건성", "지성", "복합", "민감성", "트러블성"].every((s) => skinSet.has(s)), "5개 피부타입 모두 커버");
const scentSet = new Set(products.map((p) => p.scent));
assert(["무향", "시트러스", "허브", "플로럴", "우디"].every((s) => scentSet.has(s)), "5개 향 모두 존재");
assert(products.every((p) => p.microplasticFree === true), "전 제품 미세플라스틱 프리");
assert(content?.survey?.questions?.length >= 5, "설문 질문 5개 이상");

// 5) recommender.js 단위 테스트 ----------------------------------------------
console.log("\n[5] 피부타입 추천 엔진 단위 테스트");

// (a) 민감성 설문 → 최상위 추천이 민감성 커버
{
  const { picks } = recommend({ skinType: "민감성", area: "face", sensitivity: "high", scent: "무관", vegan: true, budget: 0 }, products, { max: 3 });
  assert(picks.length > 0, "추천 결과 존재");
  assert(picks[0].product.skinTypes.includes("민감성"), "민감성 설문 → 최상위 추천이 민감성 제품");
  assert(picks[0].reasons.length > 0, "추천에 이유(reasons) 포함");
}
// (b) area=both → 페이스·바디 모두 커버
{
  const { picks } = recommend({ skinType: "복합", area: "both", sensitivity: "med", scent: "무관", budget: 0 }, products, { max: 3 });
  const cats2 = new Set(picks.map((x) => x.product.category));
  assert(cats2.has("face") && cats2.has("body"), "둘 다 설문 → 페이스+바디 모두 추천");
}
// (c) 카테고리 일치 가산: 같은 제품이 face 설문에서 body 설문보다 높음
{
  const faceP = products.find((p) => p.category === "face");
  const asFace = scoreProduct(faceP, { skinType: faceP.skinTypes[0], area: "face", sensitivity: "med" }).score;
  const asBody = scoreProduct(faceP, { skinType: faceP.skinTypes[0], area: "body", sensitivity: "med" }).score;
  assert(asFace > asBody, "페이스 제품: 페이스 설문에서 가산, 바디 설문에서 감산");
}
// (d) 고민감도 → 무향 저자극 제품 점수 상승
{
  const unscented = products.find((p) => p.scent === "무향" && (p.badges || []).includes("저자극"));
  const low = scoreProduct(unscented, { skinType: unscented.skinTypes[0], area: unscented.category, sensitivity: "low" }).score;
  const high = scoreProduct(unscented, { skinType: unscented.skinTypes[0], area: unscented.category, sensitivity: "high" }).score;
  assert(high > low, "민감도 높음 → 무향·저자극 제품 가산");
}
// (e) 고민감도 → 향 있는 제품 감산 (동일 제품, 민감도 low 대비 high)
{
  const scented = products.find((p) => p.scent === "시트러스");
  const survey = { skinType: scented.skinTypes[0], area: scented.category, scent: "무관" };
  const low = scoreProduct(scented, { ...survey, sensitivity: "low" }).score;
  const high = scoreProduct(scented, { ...survey, sensitivity: "high" }).score;
  assert(high < low, "민감도 높음 → 향 있는 제품 감산(동일 제품 low>high)");
}
// (f) 향 선호 일치 가산
{
  const citrus = products.find((p) => p.scent === "시트러스");
  const base = scoreProduct(citrus, { skinType: citrus.skinTypes[0], area: citrus.category, scent: "무관" }).score;
  const match = scoreProduct(citrus, { skinType: citrus.skinTypes[0], area: citrus.category, scent: "시트러스" }).score;
  assert(match > base, "선호 향 일치 시 가산");
}
// (g) 예산 초과 감산
{
  const pricey = [...products].sort((a, b) => b.price - a.price)[0];
  const noBudget = scoreProduct(pricey, { skinType: pricey.skinTypes[0], area: pricey.category }).score;
  const overBudget = scoreProduct(pricey, { skinType: pricey.skinTypes[0], area: pricey.category, budget: pricey.price - 5000 }).score;
  assert(overBudget < noBudget, "예산 초과 시 감산");
}

// 6) cart.js 단위 테스트 -----------------------------------------------------
console.log("\n[6] 장바구니/임팩트 단위 테스트");
const id0 = products[0].id, id1 = products[1].id;
// (a) 담기 + 수량 증가
{
  let lines = addToCart([], id0, 1);
  lines = addToCart(lines, id0, 2);
  assert(lines.length === 1 && lines[0].qty === 3, "동일 제품 담기 → 수량 합산(3)");
}
// (b) 구독 할인 10%
{
  const lines = [{ id: id0, qty: 2 }];
  const plain = summarize(lines, products, { subscribe: false });
  const sub = summarize(lines, products, { subscribe: true });
  assert(sub.discount === Math.round(plain.subtotal * 0.1), "구독 시 10% 할인 적용");
  assert(sub.total < plain.total, "구독 총액 < 일반 총액");
}
// (c) 무료배송 임계
{
  const cheap = summarize([{ id: products.find((p) => p.price < 15000).id, qty: 1 }], products);
  assert(cheap.shipping > 0, "저가 단품 → 배송비 부과");
  const big = summarize([{ id: products.find((p) => p.price >= 30000)?.id || id0, qty: 3 }], products);
  assert(big.shipping === 0, "3만원 이상 → 무료배송");
}
// (d) 수량 0 → 제거
{
  const lines = setQty([{ id: id0, qty: 2 }, { id: id1, qty: 1 }], id0, 0);
  assert(lines.length === 1 && lines[0].id === id1, "수량 0 → 라인 제거");
}
// (e) 업사이클 임팩트 합산
{
  const lines = [{ id: id0, qty: 2 }];
  const s = summarize(lines, products);
  assert(s.peelGrams === products[0].peelGrams * 2, "peelGrams 수량 반영 합산");
  assert(peelToTangerines(820) === 10, "껍질 환산(820g → 감귤 10개)");
}

// 7) AI 레이어 검증 ----------------------------------------------------------
console.log("\n[7] AI 레이어 (보안 + 문법)");

// (a) ai/ + server/ node --check (명시적 재검증)
for (const sub of ["ai", "server"]) {
  const dir = join(ROOT, sub);
  let subFiles = [];
  try { subFiles = walk(dir); } catch { bad(`디렉터리 존재: ${sub}/`); continue; }
  for (const f of subFiles.filter((f) => [".js", ".mjs"].includes(extname(f)))) {
    try {
      execSync(`node --check "${f}"`, { stdio: "pipe" });
      ok(`AI 문법: ${rel(f)}`);
    } catch (e) { bad(`AI 문법: ${rel(f)}`, String(e.stderr || e.message).slice(0, 200)); }
  }
}

// (b) AI_ENDPOINT 는 데모(목업) 모드용 빈 문자열이어야 함
assert(AI_ENDPOINT === "", "AI_ENDPOINT 빈 문자열(데모=목업 모드)");

// (c) 실제 API 키 형식 유출 스캔 (sk-ant- + 20자 이상)
const keyRe = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
let keyLeak = "";
for (const f of files) {
  if ([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp"].includes(extname(f))) continue;
  let txt = "";
  try { txt = readFileSync(f, "utf8"); } catch { continue; }
  if (keyRe.test(txt)) { keyLeak = rel(f); break; }
}
assert(keyLeak === "", `실제 API 키 형식 미포함${keyLeak ? " — 발견: " + keyLeak : ""}`);

// 결과 -----------------------------------------------------------------------
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
if (fail > 0) process.exit(1);
console.log("✅ 모든 검증 통과");
