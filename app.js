// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — 귤결(GyulGyeol) 브랜드 커머스 데모 컨트롤러
// -----------------------------------------------------------------------------
// 해시 기반 라우팅 + 뷰 렌더링. 상태는 storage.js 를 통해 localStorage 에 보관.
// 데모: 결제/배송/구독은 모의이며 실제로 이뤄지지 않는다. 계정/PII 없음.
// -----------------------------------------------------------------------------

import { recommend } from "./js/recommender.js";
import { loadState, saveState, resetState } from "./js/storage.js";
import { summarize, addToCart, setQty, removeFromCart, peelToTangerines } from "./js/cart.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const won = (n) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const state = {
  products: [],
  content: null,
  store: loadState(),
  filters: { q: "", category: "all", skinType: "all", scent: "all", price: "all", sort: "recommended" },
};

// ---- 인라인 SVG 아트 --------------------------------------------------------
const svgLogo = () => `
<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" class="logo-svg">
  <circle cx="20" cy="22" r="14" fill="var(--peel)"/>
  <circle cx="20" cy="22" r="14" fill="none" stroke="var(--peel-deep)" stroke-width="1.5"/>
  <path d="M20 9c1 -3 4 -4 6 -4c-1 3 -3 5 -6 5z" fill="var(--leaf)"/>
  <g stroke="var(--peel-deep)" stroke-width="1" opacity="0.5">
    <line x1="20" y1="22" x2="20" y2="9.5"/><line x1="20" y1="22" x2="31" y2="18"/>
    <line x1="20" y1="22" x2="31" y2="27"/><line x1="20" y1="22" x2="9" y2="27"/>
    <line x1="20" y1="22" x2="9" y2="18"/>
  </g>
</svg>`;

const svgTangerine = (seed = 0) => {
  const rot = (seed * 47) % 30 - 15;
  return `
<svg viewBox="0 0 120 120" class="prod-art" role="img" aria-label="귤껍질 스크럽 일러스트">
  <defs><radialGradient id="g${seed}" cx="40%" cy="35%">
    <stop offset="0%" stop-color="var(--peel-light)"/><stop offset="100%" stop-color="var(--peel)"/>
  </radialGradient></defs>
  <rect width="120" height="120" fill="var(--art-bg)"/>
  <g transform="rotate(${rot} 60 64)">
    <circle cx="60" cy="66" r="34" fill="url(#g${seed})" stroke="var(--peel-deep)" stroke-width="2"/>
    <path d="M60 34c2 -6 7 -8 12 -8c-2 6 -6 9 -12 9z" fill="var(--leaf)"/>
    <g fill="var(--peel-deep)" opacity="0.35">
      ${Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const x = 60 + Math.cos(a) * (12 + (i % 3) * 4);
        const y = 66 + Math.sin(a) * (12 + (i % 3) * 4);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6"/>`;
      }).join("")}
    </g>
  </g>
</svg>`;
};

const stars = (r) => {
  const full = Math.round(Number(r) || 0);
  return `<span class="stars" aria-label="평점 ${esc(r)}점">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
};

const badgePill = (b) => `<span class="pill ${b === "저자극" ? "pill-soft" : b.includes("업사이클") ? "pill-up" : "pill-eco"}">${esc(b)}</span>`;

// ---- 데이터 로드 ------------------------------------------------------------
async function loadData() {
  const [p, c] = await Promise.all([
    fetch("./data/products.json").then((r) => r.json()),
    fetch("./data/content.json").then((r) => r.json()),
  ]);
  state.products = p.products || [];
  state.content = c;
}

// ---- 저장 헬퍼 --------------------------------------------------------------
function persist() { saveState(state.store); updateBadges(); }
function inWishlist(id) { return state.store.wishlist.includes(id); }
function toggleWishlist(id) {
  const w = state.store.wishlist;
  const i = w.indexOf(id);
  if (i >= 0) w.splice(i, 1); else w.push(id);
  persist();
}
function isSubscribed(id) { return state.store.subscriptions.some((s) => s.id === id); }
function toggleSubscription(id, cycle = 4) {
  const subs = state.store.subscriptions;
  const i = subs.findIndex((s) => s.id === id);
  if (i >= 0) subs.splice(i, 1); else subs.push({ id, cycle });
  persist();
}

function updateBadges() {
  const cartCount = state.store.cart.reduce((n, l) => n + (Number(l.qty) || 0), 0);
  const wl = state.store.wishlist.length;
  const cb = $("#cart-badge"), wb = $("#wish-badge");
  if (cb) { cb.textContent = cartCount; cb.hidden = cartCount === 0; }
  if (wb) { wb.textContent = wl; wb.hidden = wl === 0; }
}

// ---- 라우터 -----------------------------------------------------------------
function router() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, param] = hash.split("/");
  const view = $("#view");
  const map = {
    "": renderHome, home: renderHome, catalog: renderCatalog, survey: renderSurvey,
    sustainability: renderSustainability, cart: renderCart, wishlist: renderWishlist,
    product: () => renderProduct(param),
  };
  const fn = map[route] || renderHome;
  view.innerHTML = fn();
  wireView(route);
  $$("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === (route || "home") ? "page" : "false"));
  window.scrollTo(0, 0);
}

// ---- 뷰: 홈/브랜드 스토리 ---------------------------------------------------
function renderHome() {
  const s = state.content.brandStory;
  const top = [...state.products].sort((a, b) => b.rating - a.rating).slice(0, 3);
  return `
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow">제주 귤껍질 업사이클 · 미세플라스틱 프리</p>
      <h1>${esc(s.title)}</h1>
      <p class="lead">${esc(s.lead)}</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#/survey">1분 피부 진단 받기</a>
        <a class="btn btn-ghost" href="#/catalog">제품 둘러보기</a>
      </div>
    </div>
    <div class="hero-art">${svgTangerine(7)}</div>
  </section>
  <section class="story-grid">
    ${s.sections.map((sec) => `
      <article class="story-card">
        <h3>${esc(sec.heading)}</h3>
        <p>${esc(sec.body)}</p>
      </article>`).join("")}
  </section>
  <section class="home-top">
    <div class="section-head"><h2>인기 스크럽</h2><a href="#/catalog">전체 보기 →</a></div>
    <div class="grid-cards">${top.map((p, i) => productCard(p, i)).join("")}</div>
  </section>`;
}

// ---- 제품 카드 --------------------------------------------------------------
function productCard(p, seed = 0) {
  return `
  <article class="card" data-id="${esc(p.id)}">
    <a class="card-media" href="#/product/${esc(p.id)}">${svgTangerine(seed + p.name.length)}
      <span class="cat-tag">${p.category === "face" ? "페이스" : "바디"}</span>
    </a>
    <button class="wish-btn ${inWishlist(p.id) ? "on" : ""}" data-wish="${esc(p.id)}"
      aria-label="찜 ${inWishlist(p.id) ? "해제" : "추가"}" aria-pressed="${inWishlist(p.id)}">♥</button>
    <div class="card-body">
      <a class="card-title" href="#/product/${esc(p.id)}">${esc(p.name)}</a>
      <div class="card-meta">${stars(p.rating)} <span class="muted">(${p.reviewCount})</span></div>
      <div class="card-badges">${(p.badges || []).slice(0, 2).map(badgePill).join("")}</div>
      <div class="card-foot">
        <strong class="price">${won(p.price)}</strong>
        <button class="btn btn-sm btn-primary" data-add="${esc(p.id)}">담기</button>
      </div>
    </div>
  </article>`;
}

// ---- 뷰: 카탈로그 -----------------------------------------------------------
function applyFilters() {
  const f = state.filters;
  let list = state.products.filter((p) => {
    if (f.category !== "all" && p.category !== f.category) return false;
    if (f.skinType !== "all" && !(p.skinTypes || []).includes(f.skinType)) return false;
    if (f.scent !== "all" && p.scent !== f.scent) return false;
    if (f.price === "u15" && p.price >= 15000) return false;
    if (f.price === "15to25" && (p.price < 15000 || p.price > 25000)) return false;
    if (f.price === "o25" && p.price <= 25000) return false;
    if (f.q) {
      const hay = (p.name + " " + p.line + " " + (p.concerns || []).join(" ") + " " + (p.ingredients || []).map((i) => i.name).join(" ")).toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
  const sort = f.sort;
  list = list.sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "reviews") return b.reviewCount - a.reviewCount;
    return b.rating * b.reviewCount - a.rating * a.reviewCount; // recommended
  });
  return list;
}

function renderCatalog() {
  const f = state.filters;
  const list = applyFilters();
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
  return `
  <section class="catalog">
    <div class="section-head"><h2>제품 카탈로그</h2><span class="muted">${list.length}개 제품</span></div>
    <div class="filters" role="search">
      <input id="f-q" type="search" placeholder="제품·성분·고민 검색" value="${esc(f.q)}" aria-label="검색">
      <select id="f-category" aria-label="용도">${opt("all", "용도 전체", f.category)}${opt("face", "페이스", f.category)}${opt("body", "바디", f.category)}</select>
      <select id="f-skin" aria-label="피부타입">${["all", "건성", "지성", "복합", "민감성", "트러블성"].map((v) => opt(v, v === "all" ? "피부타입 전체" : v, f.skinType)).join("")}</select>
      <select id="f-scent" aria-label="향">${["all", "무향", "시트러스", "허브", "플로럴", "우디"].map((v) => opt(v, v === "all" ? "향 전체" : v, f.scent)).join("")}</select>
      <select id="f-price" aria-label="가격">${opt("all", "가격 전체", f.price)}${opt("u15", "1.5만원 미만", f.price)}${opt("15to25", "1.5~2.5만원", f.price)}${opt("o25", "2.5만원 초과", f.price)}</select>
      <select id="f-sort" aria-label="정렬">${opt("recommended", "추천순", f.sort)}${opt("price-asc", "가격 낮은순", f.sort)}${opt("price-desc", "가격 높은순", f.sort)}${opt("rating", "평점순", f.sort)}${opt("reviews", "리뷰순", f.sort)}</select>
      <button id="f-reset" class="btn btn-ghost btn-sm">초기화</button>
    </div>
    <div class="grid-cards">${list.length ? list.map((p, i) => productCard(p, i)).join("") : `<p class="empty">조건에 맞는 제품이 없습니다.</p>`}</div>
  </section>`;
}

// ---- 뷰: 제품 상세 ----------------------------------------------------------
function renderProduct(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return `<p class="empty">제품을 찾을 수 없습니다. <a href="#/catalog">카탈로그로</a></p>`;
  const avg = p.reviews && p.reviews.length ? (p.reviews.reduce((n, r) => n + r.rating, 0) / p.reviews.length).toFixed(1) : p.rating;
  return `
  <article class="detail">
    <nav class="crumbs"><a href="#/catalog">카탈로그</a> / <span>${esc(p.name)}</span></nav>
    <div class="detail-top">
      <div class="detail-media">${svgTangerine(p.name.length)}</div>
      <div class="detail-info">
        <h1>${esc(p.name)}</h1>
        <div class="card-meta">${stars(p.rating)} <span class="muted">${avg} · 리뷰 ${p.reviewCount}</span></div>
        <div class="card-badges">${(p.badges || []).map(badgePill).join("")}</div>
        <p class="detail-desc">${esc(p.description)}</p>
        <ul class="spec">
          <li><span>용도</span><b>${p.category === "face" ? "페이스" : "바디"}</b></li>
          <li><span>피부타입</span><b>${(p.skinTypes || []).join(", ")}</b></li>
          <li><span>향</span><b>${esc(p.scent)}</b></li>
          <li><span>용량</span><b>${esc(p.size)}</b></li>
          <li><span>업사이클</span><b>${esc(p.grainSource)} · ${p.peelGrams}g/개</b></li>
        </ul>
        <div class="detail-price"><strong>${won(p.price)}</strong></div>
        <div class="detail-cta">
          <button class="btn btn-primary" data-add="${esc(p.id)}">장바구니 담기</button>
          <button class="btn btn-ghost ${inWishlist(p.id) ? "on" : ""}" data-wish="${esc(p.id)}">♥ 찜</button>
          <button class="btn btn-ghost ${isSubscribed(p.id) ? "on" : ""}" data-sub="${esc(p.id)}">${isSubscribed(p.id) ? "구독중 (10%)" : "정기구독 담기"}</button>
        </div>
      </div>
    </div>
    <div class="detail-cols">
      <section><h3>전성분(가상)</h3><ul class="ingredients">${(p.ingredients || []).map((i) => `<li><b>${esc(i.name)}</b> — ${esc(i.role)}</li>`).join("")}</ul></section>
      <section><h3>사용법</h3><p>${esc(p.usage)}</p>
        <div class="badge-row">${p.microplasticFree ? badgePill("미세플라스틱 프리") : ""}${p.vegan ? badgePill("비건") : ""}</div>
      </section>
    </div>
    <section class="reviews"><h3>사용 후기(가상)</h3>
      ${(p.reviews || []).map((r) => `<div class="review"><div class="card-meta">${stars(r.rating)} <span class="muted">${esc(r.user)}</span></div><p>${esc(r.text)}</p></div>`).join("") || "<p class='muted'>등록된 후기가 없습니다.</p>"}
    </section>
  </article>`;
}

// ---- 뷰: 피부타입 진단 설문 -------------------------------------------------
function renderSurvey() {
  const sv = state.content.survey;
  return `
  <section class="survey">
    <div class="section-head"><h2>${esc(sv.title)}</h2></div>
    <p class="lead">${esc(sv.intro)}</p>
    <form id="survey-form">
      ${sv.questions.map((q) => `
        <fieldset class="q">
          <legend>${esc(q.label)}</legend>
          <div class="options">
            ${q.options.map((o, i) => `
              <label class="opt">
                <input type="radio" name="${esc(q.id)}" value="${esc(o.value)}" ${i === 0 ? "required" : ""}>
                <span>${esc(o.label)}</span>
              </label>`).join("")}
          </div>
        </fieldset>`).join("")}
      <button type="submit" class="btn btn-primary">추천 받기</button>
    </form>
    <div id="survey-result" class="survey-result" hidden></div>
  </section>`;
}

function renderSurveyResult(survey) {
  const { picks } = recommend(survey, state.products, { max: 3 });
  if (!picks.length) return `<p class="empty">조건에 맞는 추천이 없습니다. 조건을 바꿔보세요.</p>`;
  return `
    <h3>${esc(survey.skinType)} 피부를 위한 추천</h3>
    <div class="grid-cards">
      ${picks.map((x, i) => `
        <article class="card rec">
          <a class="card-media" href="#/product/${esc(x.product.id)}">${svgTangerine(i + 3)}</a>
          <div class="card-body">
            <a class="card-title" href="#/product/${esc(x.product.id)}">${esc(x.product.name)}</a>
            <div class="card-meta">${stars(x.product.rating)}</div>
            <ul class="reasons">${x.reasons.slice(0, 3).map((r) => `<li>✓ ${esc(r)}</li>`).join("")}</ul>
            <div class="card-foot"><strong class="price">${won(x.product.price)}</strong>
              <button class="btn btn-sm btn-primary" data-add="${esc(x.product.id)}">담기</button></div>
          </div>
        </article>`).join("")}
    </div>
    <p class="muted small">※ 규칙 기반 데모 추천이며 의학적 진단이 아닙니다.</p>`;
}

// ---- 뷰: 지속가능성 ---------------------------------------------------------
function renderSustainability() {
  const s = state.content.sustainability;
  const sum = summarize(state.store.cart, state.products);
  return `
  <section class="sustain">
    <div class="section-head"><h2>${esc(s.title)}</h2></div>
    <p class="lead">${esc(s.intro)}</p>
    <div class="counters">
      <div class="counter"><span class="cnum" id="peel-count" data-target="${sum.peelGrams}">0</span><span class="clabel">내 장바구니가 되살린 귤껍질(g)</span></div>
      <div class="counter"><span class="cnum" id="tang-count" data-target="${peelToTangerines(sum.peelGrams)}">0</span><span class="clabel">감귤 환산(개)</span></div>
    </div>
    <div class="facts">
      ${s.facts.map((f) => `<div class="fact"><b>${esc(f.value)}</b><span>${esc(f.label)}</span><em>${esc(f.note)}</em></div>`).join("")}
    </div>
    <div class="impact-note">
      <p>${sum.peelGrams > 0 ? `현재 장바구니로 제주 감귤 약 <b>${peelToTangerines(sum.peelGrams)}개</b> 분량의 껍질을 되살립니다.` : "장바구니에 제품을 담으면 업사이클 임팩트가 합산됩니다."}</p>
    </div>
    <div class="faq"><h3>자주 묻는 질문</h3>
      ${state.content.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
    </div>
  </section>`;
}

// ---- 뷰: 장바구니 -----------------------------------------------------------
function renderCart() {
  const subscribeMode = $("#sub-toggle")?.checked || false;
  const sum = summarize(state.store.cart, state.products, { subscribe: subscribeMode });
  if (!sum.items.length) {
    return `<section class="cart"><div class="section-head"><h2>장바구니</h2></div>
      <p class="empty">장바구니가 비어 있습니다. <a href="#/catalog">쇼핑하러 가기</a></p></section>`;
  }
  return `
  <section class="cart">
    <div class="section-head"><h2>장바구니</h2><span class="muted">${sum.count}개</span></div>
    <div class="cart-lines">
      ${sum.items.map((it) => `
        <div class="cart-line" data-id="${esc(it.product.id)}">
          <div class="cl-media">${svgTangerine(it.product.name.length)}</div>
          <div class="cl-info">
            <a href="#/product/${esc(it.product.id)}">${esc(it.product.name)}</a>
            <span class="muted small">${it.product.category === "face" ? "페이스" : "바디"} · ${esc(it.product.scent)}</span>
          </div>
          <div class="qty">
            <button data-dec="${esc(it.product.id)}" aria-label="수량 감소">−</button>
            <span>${it.qty}</span>
            <button data-inc="${esc(it.product.id)}" aria-label="수량 증가">+</button>
          </div>
          <strong class="cl-total">${won(it.lineTotal)}</strong>
          <button class="cl-remove" data-remove="${esc(it.product.id)}" aria-label="삭제">✕</button>
        </div>`).join("")}
    </div>
    <div class="cart-summary">
      <label class="sub-opt"><input type="checkbox" id="sub-toggle" ${subscribeMode ? "checked" : ""}> 정기구독으로 받기 <b>(10% 할인)</b></label>
      <dl>
        <div><dt>상품 합계</dt><dd>${won(sum.subtotal)}</dd></div>
        ${sum.discount ? `<div class="disc"><dt>구독 할인</dt><dd>-${won(sum.discount)}</dd></div>` : ""}
        <div><dt>배송비</dt><dd>${sum.shipping ? won(sum.shipping) : "무료"}</dd></div>
        <div class="grand"><dt>결제 예정</dt><dd>${won(sum.total)}</dd></div>
      </dl>
      <p class="impact-line">이 주문은 귤껍질 <b>${sum.peelGrams}g</b>(감귤 약 ${peelToTangerines(sum.peelGrams)}개)을 되살립니다.</p>
      <button id="checkout" class="btn btn-primary btn-lg">모의 결제하기</button>
      <p class="muted small">※ 데모입니다. 실제 결제·배송은 이뤄지지 않습니다.</p>
    </div>
  </section>`;
}

// ---- 뷰: 찜 -----------------------------------------------------------------
function renderWishlist() {
  const items = state.store.wishlist.map((id) => state.products.find((p) => p.id === id)).filter(Boolean);
  return `
  <section class="wishlist">
    <div class="section-head"><h2>찜한 제품</h2><span class="muted">${items.length}개</span></div>
    ${items.length ? `<div class="grid-cards">${items.map((p, i) => productCard(p, i)).join("")}</div>`
      : `<p class="empty">찜한 제품이 없습니다. <a href="#/catalog">제품 보러 가기</a></p>`}
  </section>`;
}

// ---- 이벤트 배선 ------------------------------------------------------------
function wireView(route) {
  // 담기 / 찜 / 구독 (위임)
  $("#view").addEventListener("click", onViewClick);

  if (route === "catalog") wireCatalog();
  if (route === "survey") wireSurvey();
  if (route === "cart") wireCart();
  if (route === "sustainability") animateCounters();
}

function onViewClick(e) {
  const add = e.target.closest("[data-add]");
  if (add) {
    state.store.cart = addToCart(state.store.cart, add.dataset.add, 1);
    persist();
    flash("장바구니에 담았습니다");
    return;
  }
  const wish = e.target.closest("[data-wish]");
  if (wish) {
    toggleWishlist(wish.dataset.wish);
    wish.classList.toggle("on", inWishlist(wish.dataset.wish));
    if (wish.hasAttribute("aria-pressed")) wish.setAttribute("aria-pressed", inWishlist(wish.dataset.wish));
    return;
  }
  const sub = e.target.closest("[data-sub]");
  if (sub) {
    toggleSubscription(sub.dataset.sub);
    router();
    return;
  }
}

function wireCatalog() {
  const f = state.filters;
  const bind = (id, key) => { const el = $(id); if (el) el.addEventListener("change", () => { f[key] = el.value; router(); }); };
  const q = $("#f-q");
  if (q) q.addEventListener("input", debounce(() => { f.q = q.value; const list = applyFilters(); $(".grid-cards").innerHTML = list.length ? list.map((p, i) => productCard(p, i)).join("") : `<p class="empty">조건에 맞는 제품이 없습니다.</p>`; }, 200));
  bind("#f-category", "category"); bind("#f-skin", "skinType"); bind("#f-scent", "scent");
  bind("#f-price", "price"); bind("#f-sort", "sort");
  const reset = $("#f-reset");
  if (reset) reset.addEventListener("click", () => { state.filters = { q: "", category: "all", skinType: "all", scent: "all", price: "all", sort: "recommended" }; router(); });
}

function wireSurvey() {
  const form = $("#survey-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const survey = {
      skinType: fd.get("skinType"),
      area: fd.get("area"),
      sensitivity: fd.get("sensitivity"),
      scent: fd.get("scent"),
      vegan: fd.get("vegan") === "yes",
      budget: Number(fd.get("budget")) || 0,
    };
    const box = $("#survey-result");
    box.hidden = false;
    box.innerHTML = renderSurveyResult(survey);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function wireCart() {
  const dispatch = (attr, fn) => $$(`[data-${attr}]`).forEach((b) => b.addEventListener("click", () => { fn(b.dataset[attr]); persist(); router(); }));
  dispatch("inc", (id) => { const l = state.store.cart.find((x) => x.id === id); state.store.cart = setQty(state.store.cart, id, (l ? l.qty : 0) + 1); });
  dispatch("dec", (id) => { const l = state.store.cart.find((x) => x.id === id); state.store.cart = setQty(state.store.cart, id, (l ? l.qty : 1) - 1); });
  dispatch("remove", (id) => { state.store.cart = removeFromCart(state.store.cart, id); });
  const subT = $("#sub-toggle");
  if (subT) subT.addEventListener("change", router);
  const co = $("#checkout");
  if (co) co.addEventListener("click", () => {
    const sub = $("#sub-toggle")?.checked || false;
    const sum = summarize(state.store.cart, state.products, { subscribe: sub });
    state.store.cart = [];
    persist();
    $("#view").innerHTML = `
      <section class="done">
        <div class="done-art">${svgTangerine(9)}</div>
        <h2>모의 결제가 완료되었습니다</h2>
        <p>${won(sum.total)} · 귤껍질 ${sum.peelGrams}g(감귤 약 ${peelToTangerines(sum.peelGrams)}개)을 되살렸습니다.</p>
        <p class="muted small">※ 데모이므로 실제 결제·배송은 이뤄지지 않았습니다.</p>
        <a class="btn btn-primary" href="#/catalog">쇼핑 계속하기</a>
      </section>`;
    updateBadges();
  });
}

// ---- 유틸: 카운터 애니메이션 / 토스트 / 디바운스 ----------------------------
function animateCounters() {
  $$(".cnum").forEach((el) => {
    const target = Number(el.dataset.target) || 0;
    if (target === 0) { el.textContent = "0"; return; }
    const start = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString("ko-KR");
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

let flashTimer;
function flash(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

function debounce(fn, ms) {
  let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

// ---- 초기화 -----------------------------------------------------------------
async function init() {
  try {
    await loadData();
  } catch (e) {
    $("#view").innerHTML = `<p class="empty">데이터를 불러오지 못했습니다. 로컬 서버로 실행 중인지 확인하세요.</p>`;
    return;
  }
  const notice = $("#notice");
  if (notice) notice.textContent = state.content.demoNotice;
  const reset = $("#reset-store");
  if (reset) reset.addEventListener("click", () => { state.store = resetState(); persist(); router(); flash("저장 데이터를 초기화했습니다"); });
  updateBadges();
  window.addEventListener("hashchange", router);
  router();
}

init();

// 테스트/디버깅용 노출
export { applyFilters, state };
