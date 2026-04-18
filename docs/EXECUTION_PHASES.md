# REACTIVE — execution phases (build plan)

| Phase | Name | Status | Deliverables |
|-------|------|--------|--------------|
| **0** | Spec contract | Done | JSON Schema, examples, CLI validator, prompts, Expo template |
| **1** | Wizard web app | Done | `apps/web` — intake, review, JSON + **ZIP via API** |
| **2** | Codegen v1 | Done | `scripts/codegen.mjs` — tabs, theme, `generatedSpec.ts` |
| **3** | Quality gate | Done | `npm run check:artifact` |
| **4** | Integrations stub | Done | Supabase stub + `.env.example` when spec requests it |
| **5** | Visual live preview | Deferred | True RN preview needs device/simulator or hosted build farm |

**Also shipped:** `apps/api` (ZIP endpoint), `npm run dev:platform`, Docker, GitHub Actions CI, optional `scripts/llm-enrich-spec.mjs`.

**Still not in-repo (optional product layer):** OAuth Git push, cloud artifact storage, App Store automation, in-browser RN renderer.

Run locally:

1. `npm run dev:platform`  
2. Finish wizard → **Download Expo project (ZIP)**  

---

*Strategic detail lives in `PLAN.md`; this file tracks what the repo actually contains.*
