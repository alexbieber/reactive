/**
 * Multi-agent roster (one model, many tagged roles). Bracket tags `[Discovery]` … must match
 * `apps/api/src/copilotPrompt.mjs`. Human names + titles show in the UI.
 */
export const AGENT_BRACKET_IDS = [
  "Discovery",
  "Architect",
  "Craft",
  "Build",
  "Security",
  "QA",
  "Docs",
  "Perf",
] as const;

export type AgentBracketId = (typeof AGENT_BRACKET_IDS)[number];

/** Used only for browser Web Speech API voice pick (client-side, no API cost) */
export type AgentTtsGender = "female" | "male";

/**
 * English read with a regional voice where the OS provides it (accent variety, not pitch tricks).
 * Falls back to generic `en-*` if unavailable.
 */
export type BrowserTtsAccent = "en-us" | "en-gb" | "en-in" | "en-cn" | "en-jp";

export type StudioAgent = {
  id: AgentBracketId;
  /** Full name — speaks for the user’s team */
  fullName: string;
  /** Job title as their employee role */
  title: string;
  /** Short label for compact UI */
  label: string;
  /** One-line what they own */
  blurb: string;
  /** How they come across — distinct human flavor (menu + prompt alignment) */
  personality: string;
  /**
   * Seed for illustrated portrait (DiceBear notionists — stable, human-style face per teammate).
   * Tuned to vibe with {@link personality}.
   */
  avatarSeed: string;
  /** Voice gender for local speech synthesis (distinct male voices per male teammate) */
  ttsGender: AgentTtsGender;
  /** Browser TTS: pick a regional English voice (American / UK / Indian / Chinese / Japanese English) */
  browserTtsAccent: BrowserTtsAccent;
};

/** Mirrors server copilot — roster order matches prompt */
export const STUDIO_AGENTS: readonly StudioAgent[] = [
  {
    id: "Discovery",
    fullName: "Maya Ortiz",
    title: "Product Discovery Lead",
    label: "Discovery",
    blurb: "Who it’s for, problems, scope — frames a plan before the team ships JSON.",
    personality:
      "Warm and direct — asks “who’s stuck without this?” and what v1 is *not*. Hates vague success metrics.",
    avatarSeed: "Maya Ortiz — warm, direct, curious smile, approachable product lead, open posture",
    ttsGender: "female",
    browserTtsAccent: "en-us",
  },
  {
    id: "Architect",
    fullName: "Jordan Park",
    title: "Solution Architect",
    label: "Architect",
    blurb: "Tabs, routes, screens, data — owns the IA plan the spec encodes.",
    personality:
      "Calm systems thinker — spells out structure and tradeoffs before JSON; dry one-liners when something’s over-engineered.",
    avatarSeed: "Jordan Park — calm, thoughtful, subtle glasses energy, composed systems architect",
    ttsGender: "male",
    browserTtsAccent: "en-gb",
  },
  {
    id: "Craft",
    fullName: "Sam Rivera",
    title: "Design & Content Lead",
    label: "Craft",
    blurb: "Visual language, tone, loading/empty/error — preview should feel intentional.",
    personality:
      "Sharp-eyed about tone and clutter — pushes professional UX defaults, not generic “SaaS blue.”",
    avatarSeed: "Sam Rivera — sharp, creative, confident designer, polished, detail-oriented gaze",
    ttsGender: "female",
    browserTtsAccent: "en-gb",
  },
  {
    id: "Build",
    fullName: "Alex Okonkwo",
    title: "Lead Engineer · Template Delivery",
    label: "Build",
    blurb: "Template truth and ship bar — what we can run in Expo today.",
    personality:
      "Grounded shipper — names tradeoffs in plain English; drives Apply → preview green, not slide decks.",
    avatarSeed: "Alex Okonkwo — grounded, friendly engineer, practical, relaxed confident shipper",
    ttsGender: "male",
    browserTtsAccent: "en-in",
  },
  {
    id: "Security",
    fullName: "Priya Nair",
    title: "Security & Trust Lead",
    label: "Security",
    blurb: "Auth modes, data handling, and “what could go wrong” before users trust the app.",
    personality:
      "Paranoid in a good way — asks about tokens, guest vs signed-in, and what never leaves the device.",
    avatarSeed: "Priya Nair — vigilant, trustworthy, composed security lead, attentive eyes, subtle intensity",
    ttsGender: "female",
    browserTtsAccent: "en-in",
  },
  {
    id: "QA",
    fullName: "Riley Chen",
    title: "QA & Reliability Lead",
    label: "QA",
    blurb: "Flows, edge cases, and acceptance — what “done” means for each journey.",
    personality:
      "Pretends to be the tired user at 11pm — empty lists, bad network, fat fingers on small screens.",
    avatarSeed: "Riley Chen — skeptical tester smirk, tired-but-sharp QA, slightly raised eyebrow",
    ttsGender: "male",
    browserTtsAccent: "en-us",
  },
  {
    id: "Docs",
    fullName: "Casey Brooks",
    title: "Technical Writing Lead",
    label: "Docs",
    blurb: "Names, empty states, and README-shaped clarity — the app should explain itself.",
    personality:
      "Picks fights with jargon — wants every screen title and error string to sound intentional.",
    avatarSeed: "Casey Brooks — clear-eyed writer, friendly, articulate, no-nonsense clarity",
    ttsGender: "female",
    browserTtsAccent: "en-cn",
  },
  {
    id: "Perf",
    fullName: "Morgan Lee",
    title: "Performance Lead",
    label: "Perf",
    blurb: "Lists, images, startup path — keeps v1 feeling fast on real phones.",
    personality:
      "Side-eyes giant hero images and unbounded lists — pushes lazy patterns that match the template.",
    avatarSeed: "Morgan Lee — focused, analytical performance nerd, slight smirk, metrics-on-the-mind",
    ttsGender: "male",
    browserTtsAccent: "en-jp",
  },
] as const;

/** Hex background for portrait API (no #) — harmonizes with team ring colors */
const AGENT_PORTRAIT_BG: Record<AgentBracketId, string> = {
  Discovery: "ede9fe",
  Architect: "dbeafe",
  Craft: "fce7f3",
  Build: "d1fae5",
  Security: "fef3c7",
  QA: "ffedd5",
  Docs: "e0f2fe",
  Perf: "fef9c3",
};

/**
 * Human-style illustrated headshot (DiceBear notionists). Offline / blocked CDN → use initials fallback in UI.
 */
export function getAgentPortraitUrl(agent: StudioAgent, sizePx: number = 128): string {
  const params = new URLSearchParams({
    seed: agent.avatarSeed,
    size: String(Math.max(32, Math.min(256, Math.round(sizePx)))),
    backgroundColor: AGENT_PORTRAIT_BG[agent.id],
  });
  return `https://api.dicebear.com/9.x/notionists/png?${params.toString()}`;
}

const byId = Object.fromEntries(STUDIO_AGENTS.map((a) => [a.id, a])) as Record<AgentBracketId, StudioAgent>;

export function getStudioAgent(id: string | null | undefined): StudioAgent | null {
  if (!id) return null;
  return byId[id as AgentBracketId] ?? null;
}

/** Badge / menu line: "Maya Ortiz · Product Discovery Lead" */
export function getAgentEmployeeLine(id: string | null | undefined): string | null {
  const a = getStudioAgent(id);
  if (!a) return id ?? null;
  return `${a.fullName} · ${a.title}`;
}

export type AgentSegment = { agentId: AgentBracketId | null; body: string };

/** Prefer `[Tag]` on its own line (cleaner), then newline + dialogue */
function parseAgentSegmentsStrict(content: string): AgentSegment[] {
  const tagRe = new RegExp(`\\[(${AGENT_BRACKET_IDS.join("|")})\\]\\s*\\n`, "g");
  const matches: { index: number; id: AgentBracketId; tagLen: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(content)) !== null) {
    matches.push({ index: m.index, id: m[1] as AgentBracketId, tagLen: m[0].length });
  }
  if (matches.length === 0) {
    return [{ agentId: null, body: content }];
  }
  const segments: AgentSegment[] = [];
  const preamble = content.slice(0, matches[0].index).trim();
  if (preamble) {
    segments.push({ agentId: null, body: preamble });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].tagLen;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const body = content.slice(start, end).replace(/\s+$/, "");
    segments.push({ agentId: matches[i].id, body });
  }
  return segments;
}

/** Accept `[Tag] same-line dialogue` (models often skip the newline) */
function parseAgentSegmentsLoose(content: string): AgentSegment[] {
  const pattern = new RegExp(`\\[(${AGENT_BRACKET_IDS.join("|")})\\]`, "g");
  const matches: { index: number; id: AgentBracketId; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    matches.push({ index: m.index, id: m[1] as AgentBracketId, len: m[0].length });
  }
  if (matches.length === 0) {
    return [{ agentId: null, body: content }];
  }
  const segments: AgentSegment[] = [];
  const preamble = content.slice(0, matches[0].index).trim();
  if (preamble) {
    segments.push({ agentId: null, body: preamble });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].len;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const body = content.slice(start, end).trim();
    segments.push({ agentId: matches[i].id, body });
  }
  return segments;
}

function countTagged(segs: AgentSegment[]): number {
  return segs.filter((s) => s.agentId !== null).length;
}

/**
 * Split assistant text into segments whenever `[Discovery]` … `[Perf]` appear.
 * Strict = tag then newline (best for markdown). Loose fallback = tag anywhere (conference room).
 */
export function parseAgentSegments(content: string): AgentSegment[] {
  const strict = parseAgentSegmentsStrict(content);
  const strictN = countTagged(strict);
  if (strictN >= 2) return strict;
  const loose = parseAgentSegmentsLoose(content);
  const looseN = countTagged(loose);
  if (looseN > strictN) return loose;
  return strictN > 0 ? strict : loose;
}
