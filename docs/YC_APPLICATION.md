# REACTIVE — YC application helper

Use this as **draft copy** for [Y Combinator](https://www.ycombinator.com/apply) (or similar). Replace bracketed items with your facts; numbers should become real as you ship.

---

## One-line description

**REACTIVE is a spec-first control plane for React Native:** teams define a **validated App Spec** (JSON), then get a **deterministic Expo codebase** they own — fixing the “chat-only AI builder” problem where nobody can review or regression-test what the model invented.

---

## Problem

- Over **half of businesses** still lack a credible mobile presence; shipping mobile is slow and expensive.
- **New wave:** “AI app builders” let anyone prompt a prototype — but output is **opaque**, **non-reviewable**, and **brittle** for production (especially React Native: navigation, permissions, stores).
- **Enterprises and serious founders** need a **contract** (spec) before code — the same shift OpenAPI brought to APIs, applied to **mobile UI delivery**.

---

## Solution

1. **Structured intake** (wizard) → canonical **App Spec** (JSON Schema).
2. **Validation** + **freeze** → no silent scope creep.
3. **Deterministic codegen** → Expo + TypeScript + Expo Router from a pinned template (same spec → same tree).
4. **Export** → JSON + ZIP (optional API + `npm run dev:platform`).
5. **Optional** LLM copy polish — same schema, not a free-form rewrite.

**Why not chat-only?** Chat-first tools optimize **time to first screen**; REACTIVE optimizes **time to safe merge** — a different buyer (teams, agencies, serious founders).

---

## Who’s it for?

- **Indie founders / PMs** who want an MVP they can hand to an engineer.
- **Agencies** building client apps with repeatable specs.
- **Dev-first teams** who want **AI under guardrails** (spec → codegen → CI), not “magic folder.”

---

## Why now?

- LLMs **lowered the floor** to generate code — noise went up; **need for structure** went up.
- **Expo** is the default RN on-ramp; **Expo Router** + **TypeScript** are teachable standards.
- Incumbents (e.g. chat-first mobile AI builders) proved demand — **spec-first** is the wedge for **quality, auditability, and enterprise**.

---

## Competition (be honest)

| Competitor angle | REACTIVE response |
|------------------|-------------------|
| Chat-first AI mobile builders (e.g. Fastshot-class) | They optimize **speed of first build**; we optimize **reviewability + repeatability**. Many use **managed backends** — we start **bring-your-own** + stubs. |
| No-code (Draftbit, etc.) | Strong visual + AI; we’re **spec-first + repo-first** for teams that want **JSON + CI**. |
| Cursor / Copilot | **Assist** in any repo; we **own the mobile scaffold from spec** for a narrow vertical. |

**Moat (to prove):** App Spec schema + templates + codegen **quality gates** + **distribution** (CLI, API, CI) — not one model pick.

---

## Traction (fill in)

- GitHub: `https://github.com/alexbieber/reactive`
- Metrics to track: **wizard completions**, **ZIP downloads**, **GitHub stars**, **time-to-first-expo-start** after unzip.

---

## Business model (ideas)

- **Free** open core (spec + CLI + local ZIP).
- **Pro:** hosted API, team seats, private templates, SSO, audit logs.
- **Enterprise:** on-prem codegen, custom App Spec extensions, SLA.

---

## 12-month vision

- **Default** path from “product intent” → **reviewable App Spec** → **Expo in CI** → App Store.
- **Optional** multi-pass LLM (layout, copy, wiring) **under** the same spec — never “replace the spec.”

---

## Demo script (2 minutes)

1. `npm run dev:platform` → open wizard.
2. Landing → **Demo: Habit app → Review** → **Download Expo project (ZIP)**.
3. Show **JSON App Spec** + **generatedSpec.ts** inside ZIP.
4. **Differentiation line:** “Same spec, same output — your team can review the spec in PR before any RN code ships.”

---

## Founders (fill in)

- **Name:**  
- **Background:**  
- **Why you:** obsession with **spec-driven delivery** + **mobile** + **AI under guardrails**.

---

*This file is internal — trim before sharing externally.*
