# REACTIVE — execution phases (build plan)

This is the **implementation checklist** for the platform (repo work). It maps to `PLAN.md` §8 and extends it with concrete deliverables.

| Phase | Name | Status | Deliverables |
|-------|------|--------|--------------|
| **0** | Spec contract | Done | JSON Schema, examples, CLI validator, prompts, Expo template skeleton |
| **1** | Wizard web app | Done | `apps/web` — intake steps, review, download JSON, Ajv validate |
| **2** | Codegen v1 | Done | `scripts/codegen.mjs` — copy template, theme + tabs + screens, `generatedSpec.ts`, optional `npm install` |
| **3** | Quality gate | Done | `npm run check:artifact -- <dir>` — `tsc --noEmit` on generated Expo project |
| **4** | Integrations stub | Done | Supabase stub + `.env.example` when `backend.mode` is `supabase-ready` (or REST placeholder) |
| **5** | Visual / preview | Deferred | Live RN preview in browser is out of scope; optional later: screenshot → spec |

**Not in this repo (you deploy separately):** hosted artifact storage, OAuth Git push, paid API workers, App Store submission bots.

Run the platform locally:

1. `npm install` (root)  
2. `npm run dev --workspace web` — wizard UI  
3. `npm run codegen -- <spec.json> <outDir>` — Expo project  

---

*Keeps `PLAN.md` strategic; this file tracks shipped vs pending code.*
