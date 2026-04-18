/**
 * Exactly four operators. Bracket tags `[Discovery]` … `[Build]` must match
 * `apps/api/src/copilotPrompt.mjs` (search for **[Discovery]** in the Operators section).
 */
export const AGENT_BRACKET_IDS = ["Discovery", "Architect", "Craft", "Build"] as const;

/** Mirrors server copilot — roster order matches prompt numbering */
export const STUDIO_AGENTS = [
  {
    id: "Discovery",
    label: "Discovery",
    codename: "Recon",
    blurb: "Who/what/when — fills audience & journeys so the spec isn’t hollow.",
  },
  {
    id: "Architect",
    label: "Architect",
    codename: "Ops",
    blurb: "Tabs, routes, screens, data_model — what Apply will codegen.",
  },
  {
    id: "Craft",
    label: "Craft",
    codename: "Comms",
    blurb: "Theme & tone — design.* and copy that preview will show.",
  },
  {
    id: "Build",
    label: "Build",
    codename: "Engineer",
    blurb: "Template truth — what ships in ZIP/preview; no fake packages.",
  },
] as const;

const PREFIX_RE = new RegExp(`^\\[(${AGENT_BRACKET_IDS.join("|")})\\]\\s*\\n?`);

export function parseAgentMessage(content: string): { agentId: string | null; body: string } {
  const m = content.match(PREFIX_RE);
  if (!m) return { agentId: null, body: content };
  return { agentId: m[1], body: content.slice(m[0].length) };
}
