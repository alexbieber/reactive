/**
 * OpenAI Text-to-Speech (neural) — proxied so the browser never calls OpenAI directly with a BYOK key.
 * Quality is much closer to ElevenLabs-style neural speech than Web Speech; usage is billed to the OpenAI account.
 */

import { inferProviderFromKey, sanitizeApiKeyInput } from "./llmStream.mjs";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

/** Preset voices (OpenAI `/v1/audio/speech`) — rotate by teammate index */
export const OPENAI_TTS_VOICE_IDS = ["nova", "echo", "shimmer", "onyx", "fable", "alloy", "coral", "sage"];

const ALLOWED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
]);

/**
 * Resolve an OpenAI API key for TTS: optional dedicated field, else llm key when provider is OpenAI, else server env.
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveOpenAiKeyForTts(req, env) {
  const body = req.body ?? {};
  const direct = typeof body.openaiTtsApiKey === "string" ? sanitizeApiKeyInput(body.openaiTtsApiKey) : "";
  if (direct.startsWith("sk-") && direct.length >= 20 && direct.length <= 4096) {
    return { ok: true, apiKey: direct };
  }

  const raw = body.llm && typeof body.llm === "object" ? body.llm : {};
  const rawKey = typeof raw.apiKey === "string" ? raw.apiKey : "";
  const userKey = sanitizeApiKeyInput(rawKey);
  if (userKey && inferProviderFromKey(userKey) === "openai") {
    return { ok: true, apiKey: userKey };
  }

  const envKey = env.OPENAI_API_KEY?.trim();
  if (envKey) {
    return { ok: true, apiKey: envKey };
  }

  return {
    ok: false,
    error:
      "Neural voices need an OpenAI API key: set Provider + key to OpenAI in Team Space, add openaiTtsApiKey for voice-only, or set OPENAI_API_KEY on the API server.",
  };
}

/**
 * @param {{ apiKey: string, text: string, voice?: string, model?: string }} opts
 * @returns {Promise<Buffer>}
 */
export async function synthesizeOpenAiSpeech({ apiKey, text, voice = "alloy", model = "tts-1" }) {
  const input = String(text ?? "").trim().slice(0, 4096);
  if (!input) {
    throw new Error("TTS text empty");
  }

  const r = await fetch(OPENAI_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model === "tts-1-hd" ? "tts-1-hd" : "tts-1",
      voice: ALLOWED_VOICES.has(String(voice).toLowerCase()) ? String(voice).toLowerCase() : "alloy",
      input,
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`OpenAI TTS HTTP ${r.status}: ${errText.slice(0, 400)}`);
  }

  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}
