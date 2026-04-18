/** Client-side LLM / BYOK helpers — keys stay in session unless user opts into persistence */

export type LlmProviderId = "openai" | "anthropic" | "google" | "groq" | "mistral";

export type StudioLlmSettings = {
  provider: LlmProviderId;
  /** Optional override; server defaults apply when empty */
  model: string;
  apiKey: string;
  /** When true, key + settings also written to localStorage */
  rememberOnDevice: boolean;
};

export const LLM_PROVIDERS: { id: LlmProviderId; label: string; hint: string }[] = [
  { id: "openai", label: "OpenAI", hint: "Chat Completions — sk-…" },
  { id: "anthropic", label: "Anthropic (Claude)", hint: "Messages API — sk-ant-…" },
  { id: "google", label: "Google (Gemini)", hint: "Google AI Studio / Vertex-style — AIza…" },
  { id: "groq", label: "Groq", hint: "OpenAI-compatible — gsk_…" },
  { id: "mistral", label: "Mistral", hint: "OpenAI-compatible — console.mistral.ai" },
];

const SESSION_KEY = "studio-llm-v1";
const PERSIST_KEY = "studio-llm-persist-v1";

const defaultSettings = (): StudioLlmSettings => ({
  provider: "openai",
  model: "",
  apiKey: "",
  rememberOnDevice: false,
});

export function inferProviderFromKey(key: string): LlmProviderId | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-api") || k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("gsk_")) return "groq";
  if (k.startsWith("AIza")) return "google";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

/** If the user pastes only a key in the composer, save it and skip sending chat text */
export function tryParseBareApiKey(text: string): { provider: LlmProviderId; apiKey: string } | null {
  const t = text.trim();
  if (t.length < 20 || t.length > 4096) return null;
  if (/[\s\n\r]/.test(t)) return null;
  const p = inferProviderFromKey(t);
  if (!p) return null;
  return { provider: p, apiKey: t };
}

export function loadStudioLlm(): StudioLlmSettings {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(PERSIST_KEY);
    if (!raw) return defaultSettings();
    const j = JSON.parse(raw) as Partial<StudioLlmSettings>;
    return {
      provider: (j.provider as LlmProviderId) || "openai",
      model: typeof j.model === "string" ? j.model : "",
      apiKey: typeof j.apiKey === "string" ? j.apiKey : "",
      rememberOnDevice: Boolean(j.rememberOnDevice),
    };
  } catch {
    return defaultSettings();
  }
}

export function saveStudioLlm(s: StudioLlmSettings): void {
  const payload = JSON.stringify({
    provider: s.provider,
    model: s.model,
    apiKey: s.apiKey,
    rememberOnDevice: s.rememberOnDevice,
  });
  sessionStorage.setItem(SESSION_KEY, payload);
  if (s.rememberOnDevice && s.apiKey.trim()) {
    localStorage.setItem(PERSIST_KEY, payload);
  } else {
    localStorage.removeItem(PERSIST_KEY);
  }
}

/** Only include `llm` when the user supplied a key (server may still use OPENAI_API_KEY) */
export function buildLlmRequestFields(s: StudioLlmSettings): { llm?: { provider: LlmProviderId; apiKey: string; model?: string } } {
  const key = s.apiKey.trim();
  if (!key) return {};
  return {
    llm: {
      provider: s.provider,
      apiKey: key,
      model: s.model.trim() || undefined,
    },
  };
}
