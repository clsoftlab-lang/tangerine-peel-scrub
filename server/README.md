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
  - `task`: `"chat"` | `"explain"` | `"copy"`
  - 응답: `text/plain` 스트림(생성 텍스트를 그대로 흘려보냄)
- 모델: **`claude-opus-5`**, adaptive thinking, `max_tokens: 2048`
- CORS 허용(데모용 `*`).

## 보안 원칙

- **키는 서버 사이드에만.** `ANTHROPIC_API_KEY` 는 `server/.env`(git 제외)에서만 읽습니다.
- 브라우저·레포·프런트엔드 코드에는 절대 키를 두지 않습니다.
- 운영 배포 시 CORS 오리진을 실제 도메인으로 제한하고, 레이트리밋·인증을 추가하세요.

**Not an official Anthropic product.**
