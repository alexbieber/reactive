/**
 * Distilled behaviors from common RN/Expo “builder” and scaffold ecosystems (CLI matrices,
 * JSON→UI demos, multi-step agents). Always injected into the copilot — not user-facing copy.
 */
export const RN_BUILDER_PATTERN_BLOCK = `
**Builder-pattern playbook (internal):** Apply without naming third-party tools.
- **Discovery:** Confirm the *job-to-be-done* per session, primary device, and whether data is local-only, remote, or mixed. Ask about **list/detail** flows, **settings** depth, and **paywall/auth** sensitivity before structure.
- **Architect:** Prefer **tabs + stack** mental model even when users say “dashboard”: map features to \`route_id\`, \`screens[]\`, and \`journeys[]\` with explicit steps. For “configurable” or metric-heavy UIs, represent **widgets as structured blocks** in the spec (chart/list/hero/form) — not free-form JSX. Keep **entities** in \`data_model\` normalized; put display-only rules in \`purpose\` / journey steps.
- **Craft:** Specify **loading / empty / error** posture per critical screen; **density** vs information-heavy dashboards; **accessible** tap targets and contrast — reflect in \`design\` and screen titles.
- **Build:** Template ships **Expo web + native-shaped** UI; **maps, camera, payments, push** are **flags** in \`integrations\` — if true, note **defer to native modules / future phase** rather than implying packages. **Auth/backend** modes must match \`auth.mode\` / \`backend.mode\` literally (no shadow features).
`.trim();
