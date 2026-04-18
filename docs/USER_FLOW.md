# REACTIVE — user flow (verified)

## Prerequisites

- **ZIP from the browser** needs **both** processes: `npm run dev:platform` (Vite + API).  
  Vite proxies **`/api/*`** → **`http://127.0.0.1:8788`** (REACTIVE API default port).

## Flow A — Landing → wizard → export

1. Open the URL Vite prints (e.g. `http://localhost:5173`).
2. **Product story** (landing) is default; `?wizard=1` skips to the wizard.
3. **Start the spec wizard** → steps 1–10: Project → … → **Review**.
4. **Review** shows JSON + validation state.
5. **Download App Spec JSON** — always works (client-only).
6. **Download Expo project (ZIP)** — `POST /api/generate` (proxied). First build can take **~30–90s** (codegen + `npm install` + zip).

## Flow B — Demo presets

1. On landing: **Demo: Habit app → Review** or **Recipe → Review**.
2. Jumps to **Review** with a valid spec; same export buttons as above.

## Flow C — CLI only

No browser: `npm run codegen -- <spec.json> <outDir>` then `npm install` in `outDir` (or use `--skip-install` and install yourself).

## Common issues

| Symptom | Cause | Fix |
|--------|--------|-----|
| ZIP button fails with “Failed to fetch” | API not running | `npm run dev:platform` or `npm run dev -w api` |
| Wrong port | 5173 in use | Use the port Vite prints; proxy still targets 8788 |
| Slow ZIP | `npm install` inside codegen | Expected; wait |

## Production (Docker / single server)

Build web, set `SERVE_STATIC=1`, run `node apps/api/src/server.mjs` — same origin, `/api` on one host, no Vite proxy.
