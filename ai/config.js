// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// config.js — AI 레이어 설정
// -----------------------------------------------------------------------------
// AI_ENDPOINT 가 빈 문자열이면 앱은 "데모(목업) 모드"로 동작합니다.
//   - 네트워크·API 키 없이 결정적(deterministic) 한국어 목업이 응답합니다.
// 실제 Claude 로 전환하려면 백엔드 프록시 URL 을 넣으세요.
//   예) export const AI_ENDPOINT = "http://localhost:8787/api/ai";
//
// ⚠️ 절대 규칙: 브라우저/레포에는 API 키를 두지 않습니다.
//    ANTHROPIC_API_KEY 는 오직 server/ 백엔드(.env)에만 존재합니다.
// -----------------------------------------------------------------------------

export const AI_ENDPOINT = "";

export default { AI_ENDPOINT };
