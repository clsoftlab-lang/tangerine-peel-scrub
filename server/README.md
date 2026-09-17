<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->

# 귤결 AI 프록시 (server/)

브라우저에 API 키를 노출하지 않고 Claude 를 호출하기 위한 최소 Node 백엔드입니다.
프런트엔드(`ai/ai.js`)는 이 프록시로 `{ task, payload }` 를 POST 하고, 스트리밍 응답을 받아 화면에 렌더링합니다.

## 실행

```bash
cd server
cp .env.example .env      # .env 에 실제 ANTHROPIC_API_KEY 입력 (git 제외)
npm install               # @anthropic-ai/sdk 설치
npm start                 # POST /api/ai (기본 :8787)
```

그다음 프런트엔드에서 `ai/config.js` 의 엔드포인트를 지정합니다:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

`AI_ENDPOINT` 가 빈 문자열이면 앱은 키 없이 목업 모드로 동작합니다.

## 엔드포인트

- `POST /api/ai` — body `{ task, payload }`
  - `task`: `"chat"` | `"explain"` | `"copy"` | `"digest"`
  - 응답: `text/plain` 스트림(생성 텍스트를 그대로 흘려보냄)
- CORS 허용(데모용 `*`).

## 고도화 — 무인·저비용 실 AI 연동

### 비용 우선 모델 + 프롬프트 캐싱 (`index.mjs`)

- 기본 모델: **`claude-haiku-4-5`** (`$1/$5` per MTok). 품질을 높이려면
  `AI_MODEL=claude-sonnet-5` 또는 `AI_MODEL=claude-opus-5` 로 상향.
- **프롬프트 캐싱**: 태스크별 고정 시스템 프롬프트를 `cache_control:{type:'ephemeral'}`
  블록으로 전송 → 반복 호출 시 캐시 적중으로 비용 절감.
- **thinking/effort**: `claude-haiku*` 는 adaptive thinking/effort 를 받지 않으므로
  **미전송(400 방지)**. 그 외 모델은 `thinking:{type:'adaptive'}` +
  `output_config:{effort: AI_EFFORT|'low'}`.
- **출력 상한**: 태스크당 `max_tokens` 기본 `~700` (`AI_MAX_TOKENS` 로 조정).
- **과금 가드레일**: IP당 분당 `AI_RATE_PER_MIN`(기본 20) 레이트리밋 + 월 토큰 예산
  `AI_MONTHLY_TOKEN_CAP`(기본 2,000,000). 초과 시 **HTTP 429 `{fallback:true}`** →
  프런트가 목업으로 자동 폴백. 토큰 사용량은 스트림 최종 메시지 `usage` 에서 누적.

### 무료 무인 배포 — Cloudflare Workers (`worker.js`)

관리할 서버가 없는 무료 티어 변형입니다. Anthropic REST 를 직접 호출하며, 동일한
태스크 라우팅·모델·캐싱 규칙을 씁니다.

```bash
cd server
wrangler secret put ANTHROPIC_API_KEY   # 키는 시크릿에만 (레포/브라우저 금지)
wrangler deploy                          # wrangler.toml 사용
```

배포 후 프런트 `ai/config.js` 의 `AI_ENDPOINT` 를
`https://<worker-이름>.workers.dev/api/ai` 로 지정합니다. 모델은 `wrangler.toml`
`[vars] AI_MODEL` 로 조정합니다.

## 보안 원칙

- **키는 서버 사이드에만.** `ANTHROPIC_API_KEY` 는 `server/.env`(git 제외)에서만 읽습니다.
- 브라우저·레포·프런트엔드 코드에는 절대 키를 두지 않습니다.
- 운영 배포 시 CORS 오리진을 실제 도메인으로 제한하고, 레이트리밋·인증을 추가하세요.

**Not an official Anthropic product.**
