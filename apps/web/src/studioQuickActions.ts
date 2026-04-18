/**
 * One-tap prompts to keep Discovery → Build moving without blank-page friction.
 * Stack-prefs / JSON-heavy prompts mirror common external tooling patterns internally (no UI exposure).
 */
export const STUDIO_QUICK_PROMPTS = [
  {
    id: "problem",
    label: "Problem & user",
    text: "The app solves __ for __ (one sentence). Primary users: age range, device, and one daily habit we should respect.",
  },
  {
    id: "stack",
    label: "Stack prefs (v1)",
    text: "For v1 codegen we use a stock Expo template (tabs, no custom native modules). Still: preferred styling approach (StyleSheet vs utility-class style), any auth need (none / email later / OAuth later), and offline vs online-only — so Discovery can align with what we can ship.",
  },
  {
    id: "tabs",
    label: "Tabs & flows",
    text: "List the bottom tabs (or single stack) and the 2–3 must-do journeys in order. What’s out of scope for v1?",
  },
  {
    id: "data",
    label: "Data model",
    text: "What entities do we persist (e.g. habits, entries), and what’s read-only or computed? Any sync or offline needs?",
  },
  {
    id: "craft",
    label: "Look & feel",
    text: "Preferred vibe (calm / bold / playful), primary + accent colors if any, and tone of voice for empty states and errors.",
  },
  {
    id: "dashboards",
    label: "JSON-heavy UI",
    text: "Any screens that are mostly charts, metrics, or configurable widgets (dashboard-style)? Describe dimensions and refresh rules — we’ll keep structure in the App Spec even if advanced JSON-to-UI libraries are out of scope for v1.",
  },
  {
    id: "screens",
    label: "List / detail / settings",
    text: "For each main area: is it a list with rows, a detail view, a form, or settings? Any drill-in (list → detail) we must preserve? Call out search/filter if needed.",
  },
  {
    id: "integrations",
    label: "Device & integrations",
    text: "Do we need push notifications, maps, camera/photos, or payments in v1? If yes, which flows depend on them — we’ll record flags in the spec and stay within what the stock template can represent.",
  },
  {
    id: "onboarding",
    label: "Onboarding & auth gate",
    text: "First launch: guest mode, sign-up wall, or optional account later? Any profile fields required before using the app? Mention if minors or sensitive data apply.",
  },
  {
    id: "spec",
    label: "Draft App Spec JSON",
    text: "When ready, reply with a single ```json code block containing a complete App Spec that matches our schema — tabs, theme, screens, and navigation.",
  },
] as const;
