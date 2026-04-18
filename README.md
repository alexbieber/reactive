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

- **Wizard:** http://localhost:5173  
- **API:** http://localhost:8787/api/health  

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
