/**
 * Kokoro 82M — Apache-2.0, runs 100% in the browser (no API key, no cloud voice billing).
 * Uses `kokoro-js` + Transformers.js; first load downloads the model (can take a minute on slow networks).
 *
 * ONNX defaults to loading `ort-wasm-*.mjs` / `.wasm` from a CDN. That breaks local dev (and some hosts) with
 * “Failed to construct Worker” / CORS. We point ORT at the same-origin copy Vite emits from `@huggingface/transformers/dist`
 * and keep a single WASM thread so workers are not required for multi-threading.
 *
 * @see https://github.com/hexgrad/kokoro
 */
import { type AgentBracketId, parseAgentSegments, STUDIO_AGENTS } from "./studioAgents";
import { stripMarkdownForSpeech } from "./studioTts";

/** Same-dir prefix for `ort-wasm-simd-threaded.jsep.{mjs,wasm}` — loaded only when Kokoro runs (avoids top-level bundle / eval issues). */
async function ortWasmDistPrefix(): Promise<string> {
  /** Relative to monorepo root `node_modules` — avoids Vite alias + `?url` dep-scan bugs */
  const { default: ortWasmFactory } = await import(
    "../../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url"
  );
  const base = typeof window !== "undefined" && window.location?.href ? window.location.href : import.meta.url;
  const u = new URL(ortWasmFactory, base);
  u.pathname = u.pathname.replace(/[^/]+$/, "");
  return u.href;
}

async function configureOnnxWasmForKokoro(): Promise<void> {
  const { env: hfEnv } = await import("@huggingface/transformers");
  const wasm = hfEnv.backends.onnx.wasm;
  if (!wasm) {
    throw new Error("ONNX WASM backend is not available in this build.");
  }
  wasm.wasmPaths = await ortWasmDistPrefix();
  wasm.numThreads = 1;
}

/** Distinct preset voices (American/British mix) mapped by roster index — Maya = af_alloy (neutral) */
const KOKORO_VOICES = [
  "af_alloy",
  "am_adam",
  "af_sarah",
  "bm_daniel",
  "af_bella",
  "bm_fable",
  "af_jessica",
  "bm_lewis",
] as const;

export function kokoroVoiceForAgent(agentId: AgentBracketId | null): string {
  if (!agentId) return "af_heart";
  const idx = STUDIO_AGENTS.findIndex((a) => a.id === agentId);
  const i = idx >= 0 ? idx : 0;
  return KOKORO_VOICES[i % KOKORO_VOICES.length]!;
}

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type KokoroModule = typeof import("kokoro-js");

let kokoroLoadPromise: Promise<InstanceType<KokoroModule["KokoroTTS"]>> | null = null;

async function getKokoroTts(
  onProgress?: (state: { status: string; file?: string; progress?: number }) => void
): Promise<InstanceType<KokoroModule["KokoroTTS"]>> {
  if (!kokoroLoadPromise) {
    kokoroLoadPromise = (async () => {
      await configureOnnxWasmForKokoro();
      const { KokoroTTS } = await import("kokoro-js");
      return KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: onProgress
          ? (p: { status?: string; file?: string; progress?: number }) => {
              onProgress({
                status: String(p.status ?? ""),
                file: typeof p.file === "string" ? p.file : undefined,
                progress: typeof p.progress === "number" ? p.progress : undefined,
              });
            }
          : undefined,
      });
    })();
  }
  try {
    return await kokoroLoadPromise;
  } catch (e) {
    kokoroLoadPromise = null;
    throw e;
  }
}

/** Preload model in background (e.g. when user picks Kokoro in settings) */
export function preloadKokoroTts(): void {
  void getKokoroTts().catch(() => {
    /* ignore — user will see error on first play */
  });
}

let kokoroToken = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function cleanupKokoroAudio(): void {
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

export function stopKokoroTeamSpeech(): void {
  kokoroToken += 1;
  cleanupKokoroAudio();
}

type KokoroOpts = {
  onSegmentStart?: (info: { agentId: AgentBracketId | null; segmentIndex: number }) => void;
  onEnd?: () => void;
  /** First model download / WASM init can be slow */
  onLoadProgress?: (message: string) => void;
};

export async function speakTeamKokoro(markdown: string, opts: KokoroOpts = {}): Promise<void> {
  stopKokoroTeamSpeech();
  const myToken = kokoroToken;

  const segments = parseAgentSegments(markdown);
  const queue: { text: string; agentId: AgentBracketId | null }[] = [];
  for (const seg of segments) {
    const text = stripMarkdownForSpeech(seg.body);
    if (text.length > 0) queue.push({ text: text.slice(0, 2000), agentId: seg.agentId });
  }
  if (queue.length === 0) {
    opts.onEnd?.();
    return;
  }

  opts.onLoadProgress?.("Loading Kokoro (first time downloads ~100MB+)…");

  const tts = await getKokoroTts((p) => {
    if (myToken !== kokoroToken) return;
    const msg = [p.status, p.file, p.progress != null ? `${Math.round(p.progress * 100)}%` : ""]
      .filter(Boolean)
      .join(" · ");
    if (msg) opts.onLoadProgress?.(msg);
  });

  if (myToken !== kokoroToken) return;

  for (let i = 0; i < queue.length; i++) {
    if (myToken !== kokoroToken) return;
    const item = queue[i];
    opts.onSegmentStart?.({ agentId: item.agentId, segmentIndex: i });
    let voice = kokoroVoiceForAgent(item.agentId);

    let raw: { toBlob: () => Blob };
    try {
      raw = await tts.generate(item.text, { voice: voice as never, speed: 1 });
    } catch {
      raw = await tts.generate(item.text, { voice: "af_heart" as never, speed: 1 });
    }

    if (myToken !== kokoroToken) return;

    const blob = raw.toBlob();
    const url = URL.createObjectURL(blob);
    cleanupKokoroAudio();
    currentObjectUrl = url;

    await new Promise<void>((resolve, reject) => {
      if (myToken !== kokoroToken) {
        URL.revokeObjectURL(url);
        resolve();
        return;
      }
      const a = new Audio(url);
      currentAudio = a;
      a.onended = () => {
        cleanupKokoroAudio();
        resolve();
      };
      a.onerror = () => {
        cleanupKokoroAudio();
        reject(new Error("Kokoro audio playback failed"));
      };
      void a.play().catch((e) => {
        cleanupKokoroAudio();
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });

    if (myToken !== kokoroToken) return;
  }

  opts.onEnd?.();
}

export function speakTeamKokoroAsync(markdown: string, opts: KokoroOpts): Promise<void> {
  return speakTeamKokoro(markdown, opts);
}
