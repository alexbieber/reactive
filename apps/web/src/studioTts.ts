/**
 * Client-only speech using the Web Speech API (built into Chromium, Safari, Firefox).
 * No REACTIVE API calls and no paid TTS services — voices come from the user’s OS/browser.
 */
import type { AgentBracketId } from "./studioAgents";
import { getStudioAgent, parseAgentSegments, STUDIO_AGENTS } from "./studioAgents";

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
    /(female|samantha|victoria|karen|susan|zira|hazel|fiona|tessa|moira|veena|paige|linda|heather|sonia|shelley|aria|jenny|ivy|joanna|kimberly|joelle|sarah|emma|olivia|nicole|flo)/i.test(
      n
    ) &&
    !/(male|man\b|guy\b|daniel|fred|tom\b|david|mark|james|arthur|bruce|nick|rishi|aaron)/i.test(n)
  ) {
    return "female";
  }
  if (
    /(male|daniel|fred|tom\b|david|mark|aaron|arthur|bruce|james|nick|rishi|guy\b|george|brian|jason|oliver|ryan|william|thomas|alex\b)/i.test(n)
  ) {
    return "male";
  }
  return "unknown";
}

function englishVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter((v) => /^en(-|$)/i.test(v.lang));
}

let cachedBuckets: { female: SpeechSynthesisVoice[]; male: SpeechSynthesisVoice[]; fallback: SpeechSynthesisVoice[] } | null =
  null;

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

/** Distinct voice slot per roster index so many agents don’t all sound identical (within gender pool). */
function slotForAgent(id: AgentBracketId | null): number {
  if (!id) return 0;
  const idx = STUDIO_AGENTS.findIndex((a) => a.id === id);
  return idx >= 0 ? idx % 4 : 0;
}

/**
 * Slot cycles within gender bucket so eight teammates get variety (Web Speech API limits apply).
 */
function voiceForAgent(agentId: AgentBracketId | null): SpeechSynthesisVoice | null {
  if (!cachedBuckets) refreshVoiceBuckets();
  if (!cachedBuckets) return null;
  const agent = agentId ? getStudioAgent(agentId) : null;
  const gender = agent?.ttsGender ?? "female";
  const slot = slotForAgent(agentId);
  const pool = gender === "female" ? cachedBuckets.female : cachedBuckets.male;
  const list = pool.length ? pool : cachedBuckets.fallback;
  if (!list.length) return null;
  return list[slot % list.length] ?? list[0] ?? null;
}

let chainToken = 0;

export function stopStudioSpeech(): void {
  chainToken += 1;
  if (isBrowserTtsAvailable()) window.speechSynthesis.cancel();
}

type SpeakOpts = {
  /** Called when the full message finished or was interrupted */
  onEnd?: () => void;
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
    const u = new SpeechSynthesisUtterance(item.text);
    const v = voiceForAgent(item.agentId);
    if (v) u.voice = v;
    u.rate = 0.98;
    u.pitch = 1;
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
