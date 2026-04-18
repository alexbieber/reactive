# REACTIVE

**Specify once. Ship React Native.**

REACTIVE is a **spec-first** product: you (or the AI copilot) produce a canonical **App Spec** (JSON, schema-validated), then the platform generates a real **Expo (React Native)** project from a **stock template**—with a browser **wizard**, optional **Studio** copilot, **web preview**, **ZIP export**, and **CLI** for automation. You keep normal source code—not a black box.

---

## Table of contents

1. [What you get](#what-you-get)
2. [Why it's powerful](#why-its-powerful)
3. [Architecture at a glance](#architecture-at-a-glance)
4. [Quick start](#quick-start)
5. [Web UI & branding](#web-ui--branding)
6. [Studio (copilot + preview)](#studio-copilot--preview)
7. [HTTP API](#http-api)
8. [Environment variables](#environment-variables)
9. [Production & Docker](#production--docker)
10. [CLI & scripts](#cli--scripts)
11. [Documentation](#documentation)
12. [Limits & honesty](#limits--honesty)
13. [License](#license)

---

## What you get

| Layer | What it is |
|--------|------------|
| **App Spec** | One JSON document: meta, audience, journeys, tabs/routes, screens (with **blocks** like list, detail, form, chart), data model, auth/backend modes, integrations flags, design tokens, non-goals. Validated against a JSON Schema. |
| **Web wizard** | Step-by-step intake (project, audience, journeys, tabs, screens, data, auth/cloud, design, non-goals, review). Deep-link: `?wizard=1` or `?build=1`. |
| **Codegen** | Deterministic generation from the spec into the bundled Expo template (`npm run codegen`). |
| **ZIP download** | Validated spec → API bundles a runnable Expo project (Review step). |
| **Studio** | Multi-operator **chat** (Discovery → Architect → Craft → Build), **Apply** valid spec JSON from the model, **Expo web preview** in an iframe, **QR** for opening the preview URL on a phone. Deep-link: `?studio=1`. |
| **LLM** | Server key and/or **BYOK** (OpenAI, Anthropic, Google, Groq, Mistral). Streaming (`/api/chat/stream`) or one-shot (`/api/chat`). |
| **GitHub context** | Optional: load public repo metadata (README, `package.json`, Expo config, tsconfig, EAS, Babel/Metro) into the copilot—**hints only**; codegen stays template-locked. |
| **Token estimates** | Per-request **input/output** token counts (gpt-tokenizer / GPT-4o-style) on chat and preview responses; session totals in the UI. |
| **Quality gates** | Spec validation, optional artifact checks, CI (build web, validate examples, codegen smoke). |
| **Branding** | Landing nav + headline-first hero; wizard/Studio logo lockups; `logo.png` → `npm run process:logo` → transparent PNG + favicons in `apps/web/public/`. |

---

## Why it's powerful

- **Frozen spec before code** — The model is constrained by a **schema**, not an open-ended prompt. That reduces hallucinated features and keeps exports **reviewable**.
- **Real Expo output** — Generated projects are standard **Expo + TypeScript** you can run, edit, and own. **Expo Go** works from the ZIP + `npx expo start`; **web preview** shows the same UI in the browser via Expo’s web export.
- **Multi-agent copilot** — Replies are tagged **Discovery / Architect / Craft / Build** so behavior stays structured; proposed App Spec JSON is **validated** before you Apply.
- **Cost visibility** — **Input** (prompt) and **output** (completion) token estimates per turn and summed for the session, plus **spec JSON token size** for preview builds—useful for budgeting next to provider dashboards.
- **Operator-friendly stack** — One command dev (`npm run dev:platform`), optional Docker, static + API single process (`SERVE_STATIC=1`).
- **No lock-in** — Export is a repo-shaped ZIP, not a proprietary runtime.

---

## Architecture at a glance

```
apps/web     → Vite + React (landing, wizard, Studio)
apps/api     → Express (validate, generate ZIP, preview build, chat, GitHub context)
template/    → Expo starter used by codegen
docs/        → Schema, examples, execution phases, user flow, YC draft, related OSS notes
```

- **Wizard** builds the spec in the browser; **Studio** refines it via chat and can **Apply** model output when it passes validation.
- **Preview** runs `materializeProject` + `expo export --platform web` on the server; iframe serves a short-lived session under `/api/preview-frame/:id`.

---

## Quick start

**Full platform** (API + web):

```bash
npm install
npm run dev:platform
```

- **Web:** Vite prints a URL (often `http://localhost:5173`; next free port if busy).
- **API:** `http://localhost:8787` — check `http://localhost:8787/api/health`.

Studio needs the API. The web app proxies `/api` to the API in dev (see `apps/web` Vite config).

**Phones and preview:** Devices cannot open `localhost`. Use your machine’s **LAN IP** in the browser, or set **`VITE_PUBLIC_PREVIEW_ORIGIN`** for deployed builds so QR codes and links point at a reachable host.

---

## Web UI & branding

- **Landing** — **Centered logo** at the top (large transparent PNG + tagline), then **Studio** / **Start building** in a row below inside the same sticky header. **Hero is headline-first** (no second hero logo).
- **Wizard & Studio** — Header **lockup**: logo + title + short subtitle (`BrandLogo` in `apps/web/src/BrandLogo.tsx`).
- **Logo asset pipeline** — Place your source raster at the repo root as **`logo.png`**, then:

```bash
npm run process:logo
```

This runs `scripts/strip-logo-bg.mjs` (**sharp**): removes a near-white background and writes:

| Output | Purpose |
|--------|---------|
| `apps/web/public/reactive-logo.png` | UI (transparent PNG) |
| `apps/web/public/favicon-32.png` | Small PNG favicon |
| `apps/web/public/apple-touch-icon.png` | iOS home-screen icon |
| `apps/web/public/favicon.svg` | Vector tab icon (custom mark; edit separately if needed) |

Commit updated files under `apps/web/public/` after regenerating.

---

## Studio (copilot + preview)

1. Open Studio (`?studio=1` or from the UI).
2. Set **`OPENAI_API_KEY`** on the API **or** use **Bring your own API key** (stored in the browser; forwarded through your API to the provider).
3. Chat follows the loop: **chat → valid App Spec JSON → Apply → Build preview**.
4. **Token consumption** shows **Input** / **Output** for the last reply and session totals (estimates via `gpt-tokenizer`).
5. Optional **GitHub context**: presets or manual `owner/repo` (+ monorepo **App path**). Set **`GITHUB_TOKEN`** (or `GH_TOKEN`) on the API for higher GitHub API rate limits.

---

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Service info, default model, capabilities (`codegen`, `preview`, `chat`, `chatStream`, `githubRepoContext`, `tokenEstimates`, `serverOpenAiKey`, `llmProviders`). |
| `POST` | `/api/validate` | Body: App Spec JSON → validate (AJV / schema pipeline). |
| `POST` | `/api/generate` | Body: App Spec → **ZIP** of generated Expo project. |
| `POST` | `/api/preview-build` | Body: App Spec → build Expo web export → `{ previewId, entry, tokenUsage }` (spec JSON size; no LLM). |
| `GET` | `/api/preview-frame/:id/*` | Static files for the preview iframe (session expires ~1h). |
| `POST` | `/api/chat` | Body: `{ messages, spec, llm?, githubContext? }` → `{ reply, proposedSpec?, specValidationError?, tokenUsage }`. |
| `POST` | `/api/chat/stream` | Same body; **SSE** with `delta` chunks and final `done` (includes `tokenUsage`). |
| `POST` | `/api/github/context` | Body: `{ repo, ref?, appPath? }` → README, manifests, configs (public repos). |

Request bodies are JSON (large specs allowed; limit is several MB).

---

## Environment variables

| Variable | Role |
|----------|------|
| `OPENAI_API_KEY` | Server-side chat when user does not BYOK. |
| `OPENAI_MODEL` | Default OpenAI model (e.g. `gpt-4o-mini`). |
| `GITHUB_TOKEN` / `GH_TOKEN` | Optional; raises GitHub API rate limits for `/api/github/context`. |
| `CORS_ORIGIN` | Comma-separated allowed origins (**set in production**). |
| `TRUST_PROXY` | `1` if behind a reverse proxy using `X-Forwarded-*`. |
| `NODE_ENV=production` | Sanitizes client-visible LLM errors. |
| `PORT` | API port (default `8787`). |
| `SERVE_STATIC` | `1` to serve `apps/web/dist` from the API (single-process deploy). |
| `VITE_PUBLIC_PREVIEW_ORIGIN` | **Build-time** (web): public origin for preview URLs/QR when not using localhost. |

---

## Production & Docker

**Build web + serve API + static UI:**

```bash
npm run build -w web
SERVE_STATIC=1 PORT=3000 node apps/api/src/server.mjs
```

Open `http://localhost:3000` — SPA + `/api` on one host.

**Docker:**

```bash
docker build -t reactive .
docker run --rm -p 3000:3000 reactive
```

**Hardening before scale:** rate limits on generate/preview, timeouts around long exports, WAF, auth for sensitive routes, audit logs—see existing notes in this file’s history / PLAN.

---

## CLI & scripts

```bash
npm run validate:spec -- path/to/spec.json
npm run codegen -- path/to/spec.json ./out/MyApp
npm run check:artifact -- ./out/MyApp
```

**Optional AI copy polish** (requires `OPENAI_API_KEY`; same schema, improved strings):

```bash
npm run enrich:spec -- docs/spec-schema/examples/habit-tracker.spec.json
```

**Regenerate web logos & favicons** from root `logo.png`:

```bash
npm run process:logo
```

---

## Documentation

| Doc | Contents |
|-----|----------|
| [PLAN.md](PLAN.md) | Product vision, scope, roadmap. |
| [docs/EXECUTION_PHASES.md](docs/EXECUTION_PHASES.md) | Delivery phases. |
| [docs/USER_FLOW.md](docs/USER_FLOW.md) | Landing → wizard → ZIP. |
| [docs/YC_APPLICATION.md](docs/YC_APPLICATION.md) | Pitch / YC-style draft. |
| [docs/related-open-source.md](docs/related-open-source.md) | Related tools (reference; not vendored code). |

---

## Limits & honesty

- **Template-bound codegen** — The generator emits what the **stock Expo template** supports. The copilot will not honestly add arbitrary npm packages or native modules unless you extend the template and codegen.
- **Token counts** — Shown numbers use **gpt-tokenizer** (GPT-4o–class encoding). Provider billing may differ slightly.
- **GitHub context** — Reference only; it does not change the ZIP’s dependency set by itself.
- **Preview** — Web export for quick visual checks; **native** behavior is still best verified with **Expo Go** + the downloaded project.

---

## License

[MIT](LICENSE) — see the `LICENSE` file in the repository root.
