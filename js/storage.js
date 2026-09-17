// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// storage.js — localStorage 래퍼 (try/catch + 손상 시 자동 리셋)
// -----------------------------------------------------------------------------
// 브라우저에서만 동작. localStorage 접근 불가/차단/손상 시에도 앱이 죽지 않도록
// 모든 읽기/쓰기를 try/catch 로 감싸고, 파싱 실패 시 기본값으로 초기화한다.
// 저장 데이터: 장바구니(cart), 찜(wishlist), 구독(subscriptions)
// -----------------------------------------------------------------------------

const KEY = "gyulgyeol.v1";

const DEFAULT_STATE = {
  cart: [],          // [{ id, qty }]
  wishlist: [],      // [id]
  subscriptions: [], // [{ id, cycle }]  cycle = weeks
};

function hasLS() {
  try {
    return typeof localStorage !== "undefined";
  } catch (_) {
    return false;
  }
}

/** 전체 상태 로드 (손상 시 기본값) */
export function loadState() {
  if (!hasLS()) return structuredCloneSafe(DEFAULT_STATE);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch (_) {
    // 손상된 데이터 → 리셋
    try { localStorage.removeItem(KEY); } catch (_) { /* noop */ }
    return structuredCloneSafe(DEFAULT_STATE);
  }
}

/** 전체 상태 저장 */
export function saveState(state) {
  if (!hasLS()) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(state)));
    return true;
  } catch (_) {
    return false;
  }
}

/** 저장소 초기화 */
export function resetState() {
  if (hasLS()) {
    try { localStorage.removeItem(KEY); } catch (_) { /* noop */ }
  }
  return structuredCloneSafe(DEFAULT_STATE);
}

/** 누락 필드 보강 + 타입 방어 */
export function normalize(state) {
  const s = state && typeof state === "object" ? state : {};
  return {
    cart: Array.isArray(s.cart)
      ? s.cart.filter((x) => x && x.id).map((x) => ({ id: String(x.id), qty: Math.max(1, Number(x.qty) || 1) }))
      : [],
    wishlist: Array.isArray(s.wishlist) ? [...new Set(s.wishlist.map(String))] : [],
    subscriptions: Array.isArray(s.subscriptions)
      ? s.subscriptions.filter((x) => x && x.id).map((x) => ({ id: String(x.id), cycle: Number(x.cycle) || 4 }))
      : [],
  };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export default { loadState, saveState, resetState, normalize };
