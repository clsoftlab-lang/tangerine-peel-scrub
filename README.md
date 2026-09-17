<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->

# 귤결 GyulGyeol — Jeju Tangerine-Peel Scrub Shop (Demo)

A working, no-build brand-commerce web app for an **upcycled Jeju tangerine-peel body/face scrub** — low-irritation, microplastic-free, made for sensitive skin. Runs as a static site (pure HTML + CSS + ES-module JS), deployable to GitHub Pages.

한국어 문서: **[README.ko.md](./README.ko.md)**

## 🍊 LIVE DEMO

**https://clsoftlab-lang.github.io/tangerine-peel-scrub/**

## What it is

귤결 (GyulGyeol) turns discarded Jeju tangerine and hallabong peels — normally waste — into biodegradable scrub grains that replace plastic microbeads. This repo is a **front-end demo store** showing the full brand-commerce experience:

- **Brand story** — Jeju peel upcycling, microplastic-free, vegan, circular packaging.
- **Product catalog** — filter by use (face/body), skin type, scent, price; free-text search; sort by recommended/price/rating/reviews.
- **Product detail** — ingredients, usage, vegan / microplastic-free / low-irritation badges, reviews.
- **1-minute skin-type quiz** → rule-based product recommendations with human-readable reasons.
- **Cart + simulated checkout**, **subscription** (정기구독, 10% off), **wishlist** (찜).
- **Sustainability section** — live upcycle-impact counter (grams of peel diverted, tangerine equivalent).

## How the skin-type recommender works

Pure, explainable, rule-based scoring in [`js/recommender.js`](./js/recommender.js) (no ML, no network). The 1-minute quiz collects: skin type, use area (face/body/both), scent/irritation sensitivity, scent preference, vegan preference, and per-item budget. Each product is scored:

1. **Skin-type match** — product lists your skin type → **+35**.
2. **Use area** — `both` → +8; matching category → +20; mismatch → −12.
3. **Sensitivity** — if *high*: unscented +14, low-irritation badge +10, microplastic-free +4, scented −8 (herb −4); if *low*: scented +4.
4. **Scent preference** — exact match → +12.
5. **Vegan preference** — vegan product → +6.
6. **Budget** — over budget → −20; comfortably under (≤55%) → +4.
7. **Rating** — small tie-break bonus (`rating × 0.7`).

When area = `both`, a greedy pass guarantees at least one face and one body product in the top picks. Each recommendation returns the reasons that raised its score, shown in the UI. Fully unit-tested in `check.mjs` (skin-type match, both-area coverage, sensitivity effects, scent/budget effects).

## 🤖 AI 기능 (API 연동)

An optional, pluggable **AI layer** lives in [`ai/`](./ai/). **By default it runs a deterministic Korean mock** (no network, no key) that reuses the app's products and the rule-based skin recommender, so all three AI features work offline out of the box. Open **AI 상담** in the nav to try them:

1. **AI 스킨케어 상담 챗봇** — recommends scrubs by skin type / concern using the recommender.
2. **피부타입 추천 설명** — explains a skin type's traits and why it gets certain picks.
3. **브랜드 스토리 / 제품 카피 생성** — upcycling- and eco-focused marketing copy.

All AI output is labelled **not medical/dermatological advice**.

### Enable real Claude (backend proxy)

The browser never sees a key. A tiny Node proxy in [`server/`](./server/) calls Claude with the official `@anthropic-ai/sdk`:

```bash
cd server
cp .env.example .env      # then put your real key in .env (git-ignored)
npm install
npm start                 # serves POST /api/ai on :8787
```

Then point the front-end at it by setting `AI_ENDPOINT` in [`ai/config.js`](./ai/config.js):

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

- Model: **`claude-haiku-4-5`** by default (cost-first; raise via `AI_MODEL`), streamed to the browser.
- With `AI_ENDPOINT` empty (the default, which `check.mjs` asserts), the app stays in mock mode.
- **Keys are server-side only.** `ANTHROPIC_API_KEY` lives in `server/.env` (git-ignored) — **never** in the browser or the repo. `check.mjs` scans the tree for real key formats.

## ⚙️ 고도화 — 무인·저비용 실 AI 연동

The AI layer is upgraded for **autonomous (무인), cost-efficient real Claude** while every prior
feature keeps working. Full details in [`server/README.md`](./server/README.md).

- **Cost model** — default **`claude-haiku-4-5`** (**$1 / $5 per MTok** in/out) with **prompt caching**
  (the stable per-task system prompt is sent as an `ephemeral` cache block, so repeated calls read
  cache and cost less), modest per-task output caps (~700 tokens), and a **monthly token budget**
  (`AI_MONTHLY_TOKEN_CAP`, default 2,000,000) plus a per-IP rate limit (20/min). Raise quality any
  time with `AI_MODEL=claude-sonnet-5` or `claude-opus-5`.
- **Rough cost** — a typical short task (~2K input + ~0.5K output) is about **$3–5 per 1,000 requests**,
  driven lower by prompt caching. When the monthly cap is hit the proxy returns HTTP 429
  `{fallback:true}`.
- **Free one-deploy (무인)** — a **Cloudflare Workers** variant [`server/worker.js`](./server/worker.js)
  (+ `wrangler.toml`) calls the Anthropic REST API with the same task routing / model / caching rules —
  no server to babysit: `wrangler secret put ANTHROPIC_API_KEY` then `wrangler deploy`.
- **Never breaks (무단 폴백)** — if the endpoint fails, returns 429 `{fallback:true}`, or the network
  is down, `ai/ai.js` **auto-falls back to the offline mock**, so the app always responds.
- **Autonomous feature** — the home page auto-generates a **"피부 맞춤 오늘의 추천 (계절 기반)"**
  digest on load, built from the rule-based recommender via `askAI("digest", …)`. It works offline via
  the mock and is labelled **not medical/dermatological advice**.

**API keys are server-side only — never in the browser or repo.**

## Run locally

No build step, no dependencies. Serve the folder over HTTP (ES modules need `http://`, not `file://`):

```bash
python -m http.server 9005
# then open http://localhost:9005/
```

Run the checks (JSON parse, `node --check` on all JS, index containers, data integrity, recommender + cart unit tests):

```bash
node check.mjs
```

## Files

```
index.html          # app shell + nav + required containers
styles.css          # mobile-first, light/dark via prefers-color-scheme
app.js              # router + views + interactions (ES module)
js/recommender.js   # rule-based skin-type recommender (unit-tested)
js/cart.js          # cart / subscription / upcycle-impact math (pure)
js/storage.js       # localStorage wrapper (try/catch + reset)
ai/config.js        # AI_ENDPOINT ("" = mock mode)
ai/ai.js            # askAI(): Korean mock (reuses recommender) or streaming proxy
server/index.mjs    # optional Node proxy → Claude (cost-first haiku, caching, budget), keys server-side
server/worker.js    # Cloudflare Workers variant (free, unmanned) → Anthropic REST
server/wrangler.toml / server/package.json / server/.env.example / server/README.md
data/products.json  # 24 fictional products
data/content.json   # brand story, survey, sustainability, FAQ
check.mjs           # dependency-free CI verifier (incl. AI key scan)
.github/workflows/ci.yml
README.md / README.ko.md / LICENSE / .gitignore
```

Demo counts: **24 products**, 2 categories (face/body), 5 skin types, 5 scents, 6-question quiz.

## ⚠️ DEMO-MODE boundaries

**This is a demonstration front-end only. Please read these boundaries:**

- **All products, brands, ingredients, prices, reviews, ratings, and certifications are FICTIONAL.** Nothing here is a real product or medical/cosmetic claim.
- **Payment and subscription are SIMULATED.** No money is charged, no order is placed, no shipment occurs.
- **State lives in `localStorage`, which is NOT a real database.** Cart, wishlist, and subscriptions stay in your browser only; there is a reset button (⟲).
- **No accounts, no login, no personal data (PII) is collected or transmitted.**
- **A real build would add** a backend, a real product catalog and inventory, real payment/subscription processing, authentication, and verified sustainability/vegan certifications.
- The skin-type quiz is a **rule-based demo suggestion, not medical or dermatological advice.**

## 아이디어 출처 / Idea origin

The seed idea came from the entrepreneurship class taught by **Dr. Lee Il-guk (이일국) at Yongin University (용인대학교)**. The students' startup ideas were exceptionally creative; this is one of the standout ideas from that class, finally brought to life as a working service — with admiration and gratitude to those students. **No student personal information is included.**

## Contributors

- Dr. Lee Il-guk (이일국)
- LWJ
- LMJ
- Claude

## License

- Code: **Apache-2.0** — see [LICENSE](./LICENSE).
- Documentation: **CC BY 4.0**.
- SPDX headers: `Apache-2.0`, `Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)`.

**Not an official Anthropic product.**
