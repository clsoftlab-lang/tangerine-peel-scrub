// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// cart.js — 장바구니/구독/업사이클 임팩트 계산 (순수 함수, 테스트 가능)
// -----------------------------------------------------------------------------
// 결제·배송은 모두 모의(데모)이며 실제로 이뤄지지 않는다.
// 구독 할인율: SUBSCRIPTION_RATE (기본 10%)
// 무료배송 임계: FREE_SHIP_THRESHOLD (기본 30,000원)
// -----------------------------------------------------------------------------

export const SUBSCRIPTION_RATE = 0.1;
export const FREE_SHIP_THRESHOLD = 30000;
export const SHIP_FEE = 3000;

/** cart 라인([{id, qty}])을 제품 정보와 결합 */
export function hydrate(cartLines = [], products = []) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return cartLines
    .map((l) => {
      const p = byId.get(l.id);
      if (!p) return null;
      const qty = Math.max(1, Number(l.qty) || 1);
      return { product: p, qty, lineTotal: p.price * qty };
    })
    .filter(Boolean);
}

/**
 * 장바구니 합계 계산.
 * @param {Array} cartLines [{id, qty}]
 * @param {Array} products
 * @param {object} [opts] { subscribe:boolean }
 * @returns {{items,count,subtotal,discount,shipping,total,peelGrams}}
 */
export function summarize(cartLines = [], products = [], opts = {}) {
  const items = hydrate(cartLines, products);
  const count = items.reduce((n, it) => n + it.qty, 0);
  const subtotal = items.reduce((n, it) => n + it.lineTotal, 0);
  const discount = opts.subscribe ? Math.round(subtotal * SUBSCRIPTION_RATE) : 0;
  const afterDiscount = subtotal - discount;
  const shipping = subtotal === 0 || afterDiscount >= FREE_SHIP_THRESHOLD ? 0 : SHIP_FEE;
  const total = afterDiscount + shipping;
  const peelGrams = items.reduce((n, it) => n + (Number(it.product.peelGrams) || 0) * it.qty, 0);
  return { items, count, subtotal, discount, shipping, total, peelGrams };
}

/** 장바구니에 제품 추가 (수량 증가) */
export function addToCart(cartLines = [], id, qty = 1) {
  const lines = cartLines.map((l) => ({ ...l }));
  const found = lines.find((l) => l.id === id);
  if (found) found.qty = Math.max(1, (Number(found.qty) || 1) + qty);
  else lines.push({ id, qty: Math.max(1, qty) });
  return lines;
}

/** 수량 변경 (0 이하 → 제거) */
export function setQty(cartLines = [], id, qty) {
  const q = Number(qty) || 0;
  if (q <= 0) return cartLines.filter((l) => l.id !== id);
  return cartLines.map((l) => (l.id === id ? { ...l, qty: q } : l));
}

/** 제품 제거 */
export function removeFromCart(cartLines = [], id) {
  return cartLines.filter((l) => l.id !== id);
}

/** 업사이클 임팩트: 되살린 껍질(g) → 감귤 개수 환산(약 82g/개 가정) */
export function peelToTangerines(grams) {
  return Math.round((Number(grams) || 0) / 82);
}

export default {
  SUBSCRIPTION_RATE, FREE_SHIP_THRESHOLD, SHIP_FEE,
  hydrate, summarize, addToCart, setQty, removeFromCart, peelToTangerines,
};
