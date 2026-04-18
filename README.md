# REACTIVE

Guided **App Spec** → **Expo (React Native)** project: wizard UI, JSON Schema validation, deterministic codegen, optional AI copy polish, ZIP download via API, Docker, CI.

**YC / pitch:** problem/solution, demo script, and application draft → [docs/YC_APPLICATION.md](docs/YC_APPLICATION.md)

**End-to-end user flow** (landing → wizard → ZIP): [docs/USER_FLOW.md](docs/USER_FLOW.md)

Docs: [PLAN.md](PLAN.md) · [docs/EXECUTION_PHASES.md](docs/EXECUTION_PHASES.md)

## Full platform (browser → ZIP)

Terminal 1 + 2, or one command:

```bash
npm install
npm run dev:platform
```

- **Web:** Vite prints the URL (often `http://localhost:5173`; next free port if busy). **Studio** shows a **QR code** for the preview URL (open the web build on your phone). Phones can’t reach `localhost` — use your machine’s **LAN IP** in the address bar, or set **`VITE_PUBLIC_PREVIEW_ORIGIN`** for deployed builds. **Expo Go** (native) still uses the ZIP + `npx expo start` QR from the terminal.  
- **API:** http://localhost:8787/api/health  

Studio (chat + preview) needs the API. Chat is a **multi-agent** prompt (Discovery → Architect → Craft → Build): Discovery asks **idea-focused questions** before others ship full App Spec JSON. Uses **`POST /api/chat/stream`** (SSE) when `OPENAI_API_KEY` is set; falls back to **`POST /api/chat`**. Proposed JSON is **schema-validated** before “Apply”. **`GET /api/health`** → `capabilities.chat`.

### Production API hardening

| Env | Purpose |
|-----|---------|
| `CORS_ORIGIN` | Comma-separated allowed browser origins (omit in dev = allow all). **Set in production.** |
| `TRUST_PROXY` | `1` if behind `X-Forwarded-*` (e.g. nginx). |
| `NODE_ENV=production` | Hides raw upstream LLM errors from clients. |
| `OPENAI_API_KEY` | Required for `/api/chat`. |
| `OPENAI_MODEL` | Optional override (default `gpt-4o-mini`). |

**Not included yet (add before scale):** rate limits on `/api/generate` and `/api/preview-build`, request timeouts around long exports, WAF, auth on admin routes, audit logging, separate preview worker.

On the **Review** step, use **Download Expo project (ZIP)**. Unzip, then:

```bash
cd your-unzipped-folder
npx expo start
```

(`node_modules` is included in the ZIP — large but ready to run.)

### Production-style single server (built UI + API)

```bash
npm run build -w web
SERVE_STATIC=1 PORT=3000 node apps/api/src/server.mjs
```

Open http://localhost:3000 — wizard proxies `/api` to the same host.

### Docker

```bash
docker build -t reactive .
docker run --rm -p 3000:3000 reactive
```

## CLI-only workflow

```bash
npm run validate:spec -- path/to/spec.json
npm run codegen -- path/to/spec.json ./out/MyApp
npm run check:artifact -- ./out/MyApp
```

## Optional AI copy polish

Requires `OPENAI_API_KEY`:

```bash
npm run enrich:spec -- docs/spec-schema/examples/habit-tracker.spec.json
```

Writes `*.enriched.json` with clearer copy while keeping the same schema.

## License

Private / unlicensed until you add one.
