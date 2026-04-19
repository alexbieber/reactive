/**
 * Client-only speech using the Web Speech API (built into Chromium, Safari, Firefox).
 * No REACTIVE API calls and no paid TTS services — voices come from the user’s OS/browser.
 */
import type { AgentBracketId, BrowserTtsAccent, StudioAgent } from "./studioAgents";
import { getStudioAgent, parseAgentSegments, STUDIO_AGENTS } from "./studioAgents";

/** Position among teammates of the same gender (0–3) — used for distinct voices */
export function ordinalWithinGender(agentId: AgentBracketId | null): number {
  const agent = agentId ? getStudioAgent(agentId) : null;
  if (!agent) return 0;
  let n = 0;
  for (const a of STUDIO_AGENTS) {
    if (a.id === agentId) return n;
    if (a.ttsGender === agent.ttsGender) n += 1;
  }
  return 0;
}

export function isBrowserTtsAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

function looksLikeCodeSnippet(inner: string): boolean {
  const t = inner.trim();
  if (t.length > 80) return true;
  if (/[{}\[\];]|=>|::|\/\/|\/\*|\*\/|import |export |function |const |let |var |<\/?[a-z]/i.test(t)) return true;
  if (/^\w+\([^)]*\)\s*\{/.test(t)) return true;
  return false;
}

/** Strip markdown so TTS sounds like speech — no code, no paths, no JSON read aloud */
export function stripMarkdownForSpeech(md: string): string {
  let s = md;
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, (_, inner: string) => (looksLikeCodeSnippet(inner) ? " " : inner));
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/_([^_]+)_/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

type VoiceGender = "female" | "male" | "unknown";

function classifyVoice(v: SpeechSynthesisVoice): VoiceGender {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  if (
    /(female|woman|girl|samantha|victoria|karen|susan|zira|hazel|fiona|tessa|moira|veena|paige|linda|heather|sonia|shelley|aria|jenny|ivy|joanna|kimberly|joelle|sarah|emma|olivia|nicole|flo|catherine|kate|serena|martha|allison|ava|melina|leslie)/i.test(
      n
    ) &&
    !/(male|man\b|guy\b|daniel|fred|tom\b|david|mark|james|arthur|bruce|nick|rishi|aaron|oliver|ryan|george)/i.test(n)
  ) {
    return "female";
  }
  if (
    /(\bmale\b|man\b|guy\b|daniel|fred|tom\b|david|mark|aaron|arthur|bruce|james|nick|rishi|george|brian|jason|oliver|ryan|william|thomas|alex\b|gordon|ralph|reed|eitan|albert|juan|diego)/i.test(
      n
    )
  ) {
    return "male";
  }
  return "unknown";
}

/**
 * Higher = more natural / neural; lower = more likely chipmunk, tinny, or “speak-and-spell”.
 * Used *within* an accent tier so regional targets still win, but we avoid toy voices.
 */
function voiceQualityScore(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (/neural\s*2|premium|enhanced|natural\s*voice|personal\s*voice/i.test(n)) s += 8;
  else if (/\bneural\b|enhanced/i.test(n)) s += 5;
  if (/google|microsoft\s+.*online|apple\s+.*\(.*\)/i.test(n)) s += 3;
  if (/samantha|allison|ava|aaron|daniel|karen|susan|serena|tom\b|oliver|moira|fiona|martha/i.test(n)) s += 2;
  /** Older / alternate engines often sound thin or distorted */
  if (/\bdesktop\b/i.test(n)) s -= 3;
  if (/\bembedded\b/i.test(n)) s -= 2;
  /** Novelty / toy / extreme formants — common “robotic” culprits on macOS */
  if (
    /zarvox|whisper|bad|novelty|deranged|compact|tiny|pipe|organ|trinoids|bahh|boing|bubbles|cellos|good news|jester|hysterical|squeak|albert\b|agnes|princess|rock\b|flo\b.*\(english\)|veena|melina|siri.*male|kid|child/i.test(
      n
    )
  ) {
    s -= 12;
  }
  return s;
}

/** Voices that almost always sound distorted — skip unless nothing else is left */
function isLikelyRoboticOrToyVoice(v: SpeechSynthesisVoice): boolean {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  return /zarvox|whisper|bad|novelty|deranged|pipe organ|trinoids|bahh|boing|bubbles|cellos|good news|jester|hysterical|squeak|albert\b|agnes|princess|kid|child|compact|tiny/i.test(
    n
  );
}

/**
 * How well a system voice matches a regional English read (0 = no match — still usable as fallback).
 */
function accentMatchScore(v: SpeechSynthesisVoice, accent: BrowserTtsAccent): number {
  const lang = (v.lang || "").toLowerCase();
  const name = `${v.name} ${v.voiceURI}`.toLowerCase();
  switch (accent) {
    case "en-us":
      if (lang.startsWith("en-us")) return 100;
      if (lang === "en") return 40;
      if (lang.startsWith("en") && !lang.startsWith("en-gb") && !lang.startsWith("en-uk") && !lang.startsWith("en-in")) return 28;
      return 0;
    case "en-gb":
      if (lang.startsWith("en-gb") || lang.startsWith("en-uk")) return 100;
      return 0;
    case "en-in":
      if (lang.startsWith("en-in")) return 100;
      if (/bharat|en-in|india/i.test(lang)) return 85;
      return 0;
    case "en-cn":
      if (/^en-(cn|hk|mo)/i.test(v.lang || "")) return 100;
      if (/sinji|ting-ting|mei-jia|shelley|china.*english|english.*china/i.test(name)) return 70;
      if (lang.startsWith("zh-cn") || lang.startsWith("zh-hk")) return 22;
      return 0;
    case "en-jp":
      if (/^en-jp/i.test(lang)) return 100;
      if (/kyoko|otoya|english.*japan|japanese.*english/i.test(name)) return 72;
      if (lang.startsWith("ja-jp")) return 18;
      return 0;
    default:
      return 0;
  }
}

function genderMatchesAgent(v: SpeechSynthesisVoice, gender: "female" | "male"): boolean {
  const g = classifyVoice(v);
  return g === gender || g === "unknown";
}

function englishVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter((v) => /^en(-|$)/i.test(v.lang));
}

/**
 * Voices considered when assigning regional English — includes `en-*` plus `zh-*` / `ja-jp` so
 * Chinese/Japanese system voices can be used for English lines when `en-cn` / `en-jp` are missing.
 */
function voicesForAccentAssignment(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter((v) => {
    const lang = (v.lang || "").toLowerCase();
    if (/^en(-|$)/i.test(lang)) return true;
    if (/^zh-(cn|hk|tw|mo)/i.test(lang)) return true;
    if (/^ja-jp/i.test(lang)) return true;
    return false;
  });
}

let cachedBuckets: { female: SpeechSynthesisVoice[]; male: SpeechSynthesisVoice[]; fallback: SpeechSynthesisVoice[] } | null =
  null;

/** Stable one voice per roster agent — rebuilt whenever buckets refresh */
const voiceByAgentId = new Map<AgentBracketId, SpeechSynthesisVoice>();

/**
 * Ordered candidates: stay within the strongest accent tier possible, but rank by naturalness first *inside* that tier.
 * (Previously we sorted by accent first, which picked a “perfect locale” toy voice over a neural voice.)
 */
function orderedVoiceCandidatesForAgent(
  agent: StudioAgent,
  pool: SpeechSynthesisVoice[]
): { v: SpeechSynthesisVoice; accent: number; q: number }[] {
  const rows = pool.map((v) => ({
    v,
    accent: accentMatchScore(v, agent.browserTtsAccent),
    q: voiceQualityScore(v),
  }));

  const accentTiers = [80, 50, 25, 1, 0];
  for (const minAccent of accentTiers) {
    const inTier = rows.filter((r) => r.accent >= minAccent);
    if (!inTier.length) continue;

    const nonToy = inTier.filter((r) => !isLikelyRoboticOrToyVoice(r.v));
    const tier = nonToy.length ? nonToy : inTier;

    tier.sort((a, b) => {
      if (b.q !== a.q) return b.q - a.q;
      if (b.accent !== a.accent) return b.accent - a.accent;
      return a.v.name.localeCompare(b.v.name);
    });
    if (tier.length) return tier;
  }
  return rows.sort((a, b) => b.q - a.q || a.v.name.localeCompare(b.v.name));
}

function assignDistinctVoicesPerAgent(): void {
  voiceByAgentId.clear();
  const buckets = cachedBuckets;
  if (!buckets) return;

  const all = voicesForAccentAssignment();
  if (!all.length) return;

  const usedVoiceUris = new Set<string>();

  for (const agent of STUDIO_AGENTS) {
    const gender = agent.ttsGender;
    let pool = all.filter((v) => genderMatchesAgent(v, gender));
    if (!pool.length) pool = all;

    const ranked = orderedVoiceCandidatesForAgent(agent, pool);

    const pick = ranked.find((r) => !usedVoiceUris.has(r.v.voiceURI)) ?? ranked[0];
    if (!pick) continue;

    voiceByAgentId.set(agent.id, pick.v);
    usedVoiceUris.add(pick.v.voiceURI);
  }
}

function refreshVoiceBuckets(): void {
  const all = englishVoices();
  const female: SpeechSynthesisVoice[] = [];
  const male: SpeechSynthesisVoice[] = [];
  const unknown: SpeechSynthesisVoice[] = [];
  for (const v of all) {
    const g = classifyVoice(v);
    if (g === "female") female.push(v);
    else if (g === "male") male.push(v);
    else unknown.push(v);
  }
  female.sort((a, b) => a.name.localeCompare(b.name));
  male.sort((a, b) => a.name.localeCompare(b.name));
  unknown.sort((a, b) => a.name.localeCompare(b.name));
  /** Spread unknown across buckets so we still get variety when OS labels are vague */
  unknown.forEach((v, i) => {
    if (i % 2 === 0) female.push(v);
    else male.push(v);
  });
  const fallback = all.length ? all : [];
  cachedBuckets = { female, male, fallback };
  assignDistinctVoicesPerAgent();
}

/**
 * Snapshot of which system voice each teammate resolved to (for debugging “check everyone’s voice”).
 * Call after `ensureTtsVoicesLoaded()`; empty if Web Speech unavailable.
 */
export function getBrowserTtsVoiceReport(): {
  agentId: AgentBracketId;
  fullName: string;
  targetAccent: BrowserTtsAccent;
  gender: "female" | "male";
  voiceName: string;
  voiceLang: string;
  accentScore: number;
  qualityScore: number;
}[] {
  if (!isBrowserTtsAvailable() || !cachedBuckets) return [];
  return STUDIO_AGENTS.map((agent) => {
    const v = voiceByAgentId.get(agent.id);
    return {
      agentId: agent.id,
      fullName: agent.fullName,
      targetAccent: agent.browserTtsAccent,
      gender: agent.ttsGender,
      voiceName: v?.name ?? "(none)",
      voiceLang: v?.lang ?? "",
      accentScore: v ? accentMatchScore(v, agent.browserTtsAccent) : 0,
      qualityScore: v ? voiceQualityScore(v) : 0,
    };
  });
}

export function ensureTtsVoicesLoaded(): Promise<void> {
  if (!isBrowserTtsAvailable()) return Promise.resolve();
  refreshVoiceBuckets();
  if (englishVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      refreshVoiceBuckets();
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    refreshVoiceBuckets();
    setTimeout(done, 250);
  });
}

/**
 * One stable, distinct voice per agent (4 female + 4 male). Ungrouped lines use a neutral narrator slot.
 */
function voiceForAgent(agentId: AgentBracketId | null): SpeechSynthesisVoice | null {
  if (!cachedBuckets) refreshVoiceBuckets();
  if (!cachedBuckets) return null;
  if (agentId && voiceByAgentId.has(agentId)) {
    return voiceByAgentId.get(agentId) ?? null;
  }
  const list = cachedBuckets.female.length ? cachedBuckets.female : cachedBuckets.fallback;
  if (!list.length) return null;
  return [...list].sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))[0] ?? list[0] ?? null;
}

/**
 * Web Speech: keep default rate & pitch (1.0). Tweaking them made lines sound sing-song; differentiation comes from
 * regional voices ({@link STUDIO_AGENTS} `browserTtsAccent`), not synthetic prosody.
 */
function prosodyForAgent(_agentId: AgentBracketId | null): { rate: number; pitch: number } {
  return { rate: 1, pitch: 1 };
}

let chainToken = 0;

export function stopStudioSpeech(): void {
  chainToken += 1;
  if (isBrowserTtsAvailable()) window.speechSynthesis.cancel();
}

type SpeakOpts = {
  /** Called when the full message finished or was interrupted */
  onEnd?: () => void;
  /** Fires before each segment speaks — use to highlight “who’s talking” (e.g. Spaces-style stage) */
  onSegmentStart?: (info: { agentId: AgentBracketId | null; segmentIndex: number }) => void;
};

/**
 * Speaks assistant markdown in order: one utterance per segment, matching teammate voices.
 * Cancels any in-progress studio speech first.
 */
export function speakAssistantContent(markdown: string, opts: SpeakOpts = {}): void {
  if (!isBrowserTtsAvailable()) {
    opts.onEnd?.();
    return;
  }
  stopStudioSpeech();
  const myToken = chainToken;
  const segments = parseAgentSegments(markdown);
  const queue: { text: string; agentId: AgentBracketId | null }[] = [];
  for (const seg of segments) {
    const text = stripMarkdownForSpeech(seg.body);
    if (text.length > 0) queue.push({ text, agentId: seg.agentId });
  }
  if (queue.length === 0) {
    opts.onEnd?.();
    return;
  }

  let i = 0;
  const runNext = () => {
    if (myToken !== chainToken) return;
    if (i >= queue.length) {
      opts.onEnd?.();
      return;
    }
    const item = queue[i];
    opts.onSegmentStart?.({ agentId: item.agentId, segmentIndex: i });
    const u = new SpeechSynthesisUtterance(item.text);
    const v = voiceForAgent(item.agentId);
    if (v) u.voice = v;
    const { rate, pitch } = prosodyForAgent(item.agentId);
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => {
      if (myToken !== chainToken) return;
      i += 1;
      runNext();
    };
    u.onerror = (ev) => {
      if (myToken !== chainToken) return;
      const code = "error" in ev && typeof ev.error === "string" ? ev.error : "";
      if (code === "canceled" || code === "interrupted") {
        opts.onEnd?.();
        return;
      }
      i += 1;
      runNext();
    };
    window.speechSynthesis.speak(u);
  };
  void ensureTtsVoicesLoaded().then(() => {
    refreshVoiceBuckets();
    runNext();
  });
}

/** Resolves when playback ends or is cancelled (`stopStudioSpeech` / new speech). For auto conversation chains. */
export function speakAssistantContentAsync(
  markdown: string,
  opts?: Omit<SpeakOpts, "onEnd">
): Promise<void> {
  return new Promise((resolve) => {
    speakAssistantContent(markdown, {
      ...opts,
      onEnd: () => resolve(),
    });
  });
}
