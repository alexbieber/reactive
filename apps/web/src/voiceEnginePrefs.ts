/**
 * Voice engine for Team Space + Studio (Listen). Session storage; legacy keys kept in sync.
 */
const LEGACY_VOICE = "team-space-voice-engine";
const LEGACY_OPENAI_TTS = "team-space-openai-tts-key";

export const VOICE_ENGINE_KEY = "reactive-voice-engine";
export const OPENAI_VOICE_ONLY_KEY = "reactive-openai-tts-key";

export type VoiceEngineId = "browser" | "openai" | "kokoro";

export function loadVoiceEngine(): VoiceEngineId {
  try {
    let v = sessionStorage.getItem(VOICE_ENGINE_KEY);
    if (!v) {
      v = sessionStorage.getItem(LEGACY_VOICE);
      if (v) sessionStorage.setItem(VOICE_ENGINE_KEY, v);
    }
    if (v === "openai") return "openai";
    if (v === "kokoro") return "kokoro";
  } catch {
    /* ignore */
  }
  return "browser";
}

export function saveVoiceEngine(v: VoiceEngineId): void {
  try {
    sessionStorage.setItem(VOICE_ENGINE_KEY, v);
    sessionStorage.setItem(LEGACY_VOICE, v);
  } catch {
    /* ignore */
  }
}

export function loadOpenAiVoiceKeyOnly(): string {
  try {
    let k = sessionStorage.getItem(OPENAI_VOICE_ONLY_KEY);
    if (k == null || k === "") {
      k = sessionStorage.getItem(LEGACY_OPENAI_TTS) ?? "";
      if (k) sessionStorage.setItem(OPENAI_VOICE_ONLY_KEY, k);
    }
    return k;
  } catch {
    return "";
  }
}

export function saveOpenAiVoiceKeyOnly(k: string): void {
  try {
    sessionStorage.setItem(OPENAI_VOICE_ONLY_KEY, k);
    sessionStorage.setItem(LEGACY_OPENAI_TTS, k);
  } catch {
    /* ignore */
  }
}
