/**
 * Multi-provider LLM streaming + one-shot completion.
 * Never log raw API keys.
 */

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  /** Widely available; override in Studio for Claude 4, Opus, etc. */
  anthropic: "claude-3-5-sonnet-20241022",
  /** Override in Studio if your key only serves certain model ids */
  google: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
  /** NVIDIA NIM / build — OpenAI-compatible; override in Studio (e.g. google/gemma-2-9b-it) */
  nvidia: "meta/llama-3.1-8b-instruct",
};

const OPENAI_COMPAT_BASE = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  /** NVIDIA API Catalog — same Chat Completions path as OpenAI */
  nvidia: "https://integrate.api.nvidia.com/v1",
};

/** Extract user-visible text from Gemini GenerateContentResponse JSON (handles multi-part + thinking parts) */
function extractGeminiResponseText(j) {
  const cands = j?.candidates;
  if (!Array.isArray(cands) || !cands.length) return "";
  const parts = cands[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const part of parts) {
    if (part?.thought) continue;
    if (typeof part?.text === "string" && part.text.length) out += part.text;
  }
  /* Some models stream dialogue only on parts flagged `thought` — if nothing else, use any text */
  if (!out) {
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.length) out += part.text;
    }
  }
  return out;
}

/** OpenAI-style delta.content may be string or an array of { type, text } chunks (some providers) */
function* yieldOpenAiDeltaContent(delta) {
  const c = delta?.content;
  if (typeof c === "string" && c.length) {
    yield c;
    return;
  }
  if (!Array.isArray(c)) return;
  for (const item of c) {
    if (item?.type === "text" && typeof item.text === "string" && item.text.length) yield item.text;
    else if (typeof item === "string" && item.length) yield item;
  }
}

const MAX_KEY_LEN = 4096;

/** Strip zero-width / BOM characters often copied from PDFs or chat UIs */
function sanitizeApiKeyInput(s) {
  if (typeof s !== "string") return "";
  return s.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

/** @param {string} key */
export function inferProviderFromKey(key) {
  if (!key || typeof key !== "string") return null;
  const k = sanitizeApiKeyInput(key);
  if (k.startsWith("sk-ant-api") || k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("gsk_")) return "groq";
  if (k.startsWith("AIza")) return "google";
  if (k.startsWith("nvapi-")) return "nvidia";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

function isAllowedProvider(p) {
  return ["openai", "anthropic", "google", "groq", "mistral", "nvidia"].includes(p);
}

/**
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ ok: true, provider: string, apiKey: string, model: string } | { ok: false, error: string }}
 */
export function resolveLlmFromRequest(req, env) {
  const body = req.body ?? {};
  const raw = body.llm && typeof body.llm === "object" ? body.llm : {};
  const rawKey =
    typeof raw.apiKey === "string"
      ? raw.apiKey
      : typeof body.llmApiKey === "string"
        ? body.llmApiKey
        : "";
  const userKey = sanitizeApiKeyInput(rawKey);

  let provider = String(raw.provider ?? body.llmProvider ?? "")
    .toLowerCase()
    .trim();
  const userModel =
    typeof raw.model === "string"
      ? raw.model.trim()
      : typeof body.llmModel === "string"
        ? body.llmModel.trim()
        : "";

  if (userKey) {
    if (userKey.length < 8 || userKey.length > MAX_KEY_LEN) {
      return { ok: false, error: "API key length invalid (8–4096 characters)." };
    }
    const inferred = inferProviderFromKey(userKey);
    /* Key shape wins over Studio dropdown — wrong provider + right key was a common failure mode */
    if (inferred) {
      provider = inferred;
    } else if (!provider || provider === "auto") {
      provider = "openai";
    }
    if (!isAllowedProvider(provider)) {
      return { ok: false, error: `Unknown provider: ${provider}` };
    }
    const model = userModel || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
    return { ok: true, provider, apiKey: userKey, model };
  }

  const envKey = env.OPENAI_API_KEY?.trim();
  if (envKey) {
    return {
      ok: true,
      provider: "openai",
      apiKey: envKey,
      model: userModel || env.OPENAI_MODEL || DEFAULT_MODELS.openai,
    };
  }

  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey) {
    return {
      ok: true,
      provider: "nvidia",
      apiKey: nvidiaKey,
      model: userModel || env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia,
    };
  }

  return {
    ok: false,
    error:
      "No model API key: set OPENAI_API_KEY or NVIDIA_API_KEY on the server, or use Studio → Bring your own API key (OpenAI, Claude, Gemini, Groq, Mistral, NVIDIA NIM).",
  };
}

/**
 * @param {{ baseUrl: string, apiKey: string, model: string, messages: {role: string, content: string}[], signal?: AbortSignal, extraHeaders?: Record<string, string>, extraBody?: Record<string, unknown> }} opts
 */
export async function* streamOpenAICompatible({
  baseUrl,
  apiKey,
  model,
  messages,
  signal,
  extraHeaders = {},
  extraBody = {},
}) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.35,
      max_tokens: 8192,
      ...extraBody,
    }),
    signal,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error((t || r.statusText).slice(0, 400));
  }

  if (!r.body) throw new Error("Empty upstream body");

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta;
        yield* yieldOpenAiDeltaContent(delta);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

/**
 * @param {{ apiKey: string, model: string, system: string, messages: {role: string, content: string}[], signal?: AbortSignal, temperature?: number }} opts
 */
export async function* streamAnthropicChat({ apiKey, model, system, messages, signal, temperature = 0.35 }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      stream: true,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
    }),
    signal,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error((t || r.statusText).slice(0, 400));
  }

  if (!r.body) throw new Error("Empty upstream body");

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      let dataLine = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) dataLine = line.slice(6);
      }
      if (!dataLine) continue;
      try {
        const j = JSON.parse(dataLine);
        if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) {
          yield j.delta.text;
        }
      } catch (_) {
        /* ignore */
      }
    }
  }
}

/**
 * @param {{ apiKey: string, model: string, system: string, messages: {role: string, content: string}[], signal?: AbortSignal, temperature?: number, maxOutputTokens?: number }} opts
 */
export async function* streamGeminiChat({
  apiKey,
  model,
  system,
  messages,
  signal,
  temperature = 0.35,
  maxOutputTokens = 8192,
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  const contents = [];
  for (const m of messages) {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const outCap = Math.min(Math.max(256, maxOutputTokens), 8192);
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens: outCap },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error((t || r.statusText).slice(0, 500));
  }

  if (!r.body) throw new Error("Empty upstream body");

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const j = Array.isArray(parsed) ? parsed[0] : parsed;
        if (j?.promptFeedback?.blockReason) {
          throw new Error(`Gemini blocked the prompt: ${j.promptFeedback.blockReason}`);
        }
        const fr = j?.candidates?.[0]?.finishReason;
        if (fr === "SAFETY" || fr === "BLOCKLIST" || fr === "PROHIBITED_CONTENT") {
          throw new Error(`Gemini stopped (${fr}). Try a shorter topic or another model.`);
        }
        const text = extractGeminiResponseText(j);
        if (text.length) yield text;
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Gemini")) throw e;
        /* malformed chunk — skip */
      }
    }
  }
}

/**
 * @param {{ provider: string, apiKey: string, model: string, system: string, messages: {role: string, content: string}[], signal?: AbortSignal, temperature?: number, max_tokens?: number }} opts
 */
export async function* streamLlmChat(opts) {
  const { provider, apiKey, model, system, messages, signal } = opts;
  const temperature = opts.temperature ?? 0.35;
  const max_tokens = opts.max_tokens ?? 8192;
  const openaiMsgs = [{ role: "system", content: system }, ...messages];

  if (provider === "anthropic") {
    yield* streamAnthropicChat({ apiKey, model, system, messages, signal, temperature });
    return;
  }

  if (provider === "google") {
    yield* streamGeminiChat({
      apiKey,
      model,
      system,
      messages,
      signal,
      temperature,
      maxOutputTokens: max_tokens,
    });
    return;
  }

  const base = OPENAI_COMPAT_BASE[provider];
  if (!base) throw new Error(`Unsupported provider: ${provider}`);
  const nvidiaHeaders = provider === "nvidia" ? { Accept: "text/event-stream" } : {};
  yield* streamOpenAICompatible({
    baseUrl: base,
    apiKey,
    model,
    messages: openaiMsgs,
    signal,
    extraHeaders: nvidiaHeaders,
    extraBody: { temperature, max_tokens },
  });
}

async function completeOpenAICompatible({ baseUrl, apiKey, model, messages, extraHeaders = {}, extraBody = {} }) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: 8192,
      ...extraBody,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error((t || r.statusText).slice(0, 400));
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "";
}

async function completeAnthropic({ apiKey, model, system, messages }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.35,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error((t || r.statusText).slice(0, 400));
  }
  const data = await r.json();
  return data.content?.[0]?.text || "";
}

async function completeGemini({ apiKey, model, system, messages }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const contents = [];
  for (const m of messages) {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  const body = { contents, generationConfig: { temperature: 0.35 } };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error((t || r.statusText).slice(0, 500));
  }
  const data = await r.json();
  if (!data.candidates?.length && data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
  }
  return extractGeminiResponseText(data) || "";
}

/**
 * @param {{ provider: string, apiKey: string, model: string, system: string, messages: {role: string, content: string}[] }} opts
 */
export async function completeLlmChat(opts) {
  const { provider, apiKey, model, system, messages } = opts;
  const openaiMsgs = [{ role: "system", content: system }, ...messages];

  if (provider === "anthropic") {
    return completeAnthropic({ apiKey, model, system, messages });
  }
  if (provider === "google") {
    return completeGemini({ apiKey, model, system, messages });
  }
  const base = OPENAI_COMPAT_BASE[provider];
  if (!base) throw new Error(`Unsupported provider: ${provider}`);
  return completeOpenAICompatible({ baseUrl: base, apiKey, model, messages: openaiMsgs });
}

export { DEFAULT_MODELS, OPENAI_COMPAT_BASE };
