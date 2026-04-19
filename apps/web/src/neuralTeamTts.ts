/**
 * OpenAI neural TTS via REACTIVE API (`POST /api/tts/openai`) — much more natural than Web Speech.
 * Billed per character on the user’s OpenAI account; optional upgrade vs. browser voices.
 */
import type { AgentBracketId } from "./studioAgents";
import { parseAgentSegments, STUDIO_AGENTS } from "./studioAgents";
import { stripMarkdownForSpeech } from "./studioTts";

/** Discovery (Maya) uses `alloy` — neutral; `nova` moved to QA so eight voices stay distinct */
const OPENAI_TTS_VOICES = ["alloy", "echo", "shimmer", "onyx", "fable", "nova", "coral", "sage"] as const;

export function openaiVoiceForAgent(agentId: AgentBracketId | null): string {
  if (!agentId) return "alloy";
  const idx = STUDIO_AGENTS.findIndex((a) => a.id === agentId);
  const i = idx >= 0 ? idx : 0;
  return OPENAI_TTS_VOICES[i % OPENAI_TTS_VOICES.length]!;
}

let neuralToken = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function cleanupNeuralPlaybackOnly(): void {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  } catch {
    /* ignore */
  }
}

/** Stop neural playback and invalidate any in-flight `speakTeamOpenAiNeural` session */
export function stopNeuralTeamSpeech(): void {
  neuralToken += 1;
  cleanupNeuralPlaybackOnly();
}

type NeuralOpts = {
  apiBase: string;
  buildBody: () => Record<string, unknown>;
  onSegmentStart?: (info: { agentId: AgentBracketId | null; segmentIndex: number }) => void;
  onEnd?: () => void;
  signal?: AbortSignal;
};

/**
 * Speaks each tagged segment with a distinct OpenAI voice (MP3 via API).
 */
export async function speakTeamOpenAiNeural(markdown: string, opts: NeuralOpts): Promise<void> {
  stopNeuralTeamSpeech();
  const myToken = neuralToken;

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

  for (let i = 0; i < queue.length; i++) {
    if (myToken !== neuralToken) return;

    const item = queue[i];
    opts.onSegmentStart?.({ agentId: item.agentId, segmentIndex: i });
    const voice = openaiVoiceForAgent(item.agentId);

    const r = await fetch(`${opts.apiBase}/api/tts/openai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...opts.buildBody(),
        text: item.text.slice(0, 4096),
        voice,
        model: "tts-1",
      }),
      signal: opts.signal,
    });

    if (myToken !== neuralToken) return;

    if (!r.ok) {
      const err = await r.text().catch(() => "");
      throw new Error(`Neural TTS failed (${r.status}): ${err.slice(0, 200)}`);
    }

    const blob = await r.blob();
    if (myToken !== neuralToken) return;

    await playMp3Blob(blob, myToken);
    if (myToken !== neuralToken) return;
  }

  opts.onEnd?.();
}

function playMp3Blob(blob: Blob, myToken: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (myToken !== neuralToken) {
      resolve();
      return;
    }

    cleanupNeuralPlaybackOnly();

    if (myToken !== neuralToken) {
      resolve();
      return;
    }

    const url = URL.createObjectURL(blob);
    currentObjectUrl = url;
    const a = new Audio(url);
    currentAudio = a;
    a.onended = () => {
      cleanupNeuralPlaybackOnly();
      resolve();
    };
    a.onerror = () => {
      cleanupNeuralPlaybackOnly();
      reject(new Error("Audio playback failed"));
    };
    void a.play().catch((e) => {
      cleanupNeuralPlaybackOnly();
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

export function speakTeamOpenAiNeuralAsync(markdown: string, opts: NeuralOpts): Promise<void> {
  return speakTeamOpenAiNeural(markdown, opts);
}
