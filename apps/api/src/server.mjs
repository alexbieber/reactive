/**
 * REACTIVE API — validate, codegen, ZIP, Expo web preview, optional OpenAI chat.
 */

import archiver from "archiver";
import { randomBytes } from "crypto";
import cors from "cors";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { buildCopilotSystem } from "./copilotPrompt.mjs";
import { buildProjectBuildCopilotSystem } from "./projectBuildCopilotPrompt.mjs";
import {
  materializeProject,
  runExpoWebExport,
  previewEntryHtml,
  rewritePreviewPaths,
} from "./buildProject.mjs";
import { completeLlmChat, resolveLlmFromRequest, streamLlmChat } from "./llmStream.mjs";
import { normalizeAppSpecForSchema } from "./normalizeAppSpec.mjs";
import { validateSpecObject } from "./specValidate.mjs";
import {
  fetchGithubRepoContext,
  githubContextToPromptAugment,
  parseGithubRepoInput,
} from "./githubContext.mjs";
import { computeChatTokenUsage, computeSpecJsonTokenUsage } from "./tokenUsage.mjs";
import {
  CLARIFICATION_PROMPT,
  GENERATION_PROMPT,
  parseQuestionsJson,
} from "./rnBuilderPrompts.mjs";
import { buildTeamRoomSystem } from "./teamRoomPrompt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..");

/** Must match GET /api/health — bump when routes or capabilities change */
const API_VERSION = "1.4.0";

const app = express();

/** Express 4 does not catch rejected promises from async route handlers — forward to error middleware */
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  /* SAMEORIGIN: Studio iframe loads preview from same dev origin via Vite proxy. */
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const corsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins, credentials: false } : undefined));
app.use(express.json({ limit: "6mb" }));

/** @type {Map<string, { tmp: string, created: number }>} */
const previewSessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of previewSessions) {
    if (now - s.created > 60 * 60 * 1000) {
      try {
        fs.rmSync(s.tmp, { recursive: true, force: true });
      } catch (_) {}
      previewSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "reactive-api",
    version: API_VERSION,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    nvidiaModel: process.env.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct",
    capabilities: {
      codegen: true,
      preview: true,
      /** Chat works with server OPENAI_API_KEY or client-supplied keys (BYOK) from Studio */
      chat: true,
      chatStream: true,
      serverOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      /** OpenAI-compatible NVIDIA NIM / build API */
      serverNvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
      llmProviders: ["openai", "anthropic", "google", "groq", "mistral", "nvidia"],
      githubRepoContext: true,
      /** POST /api/team-room/stream — multi-agent conference (no App Spec) */
      teamRoomStream: true,
      tokenEstimates: true,
      /** plannew-style: prompt → JSON questions → stream ===FILE=== project */
      rnQuickBuilder: true,
    },
  });
});

/** Load README, package.json, Expo config, tsconfig, eas.json — optional monorepo appPath. */
app.post("/api/github/context", async (req, res) => {
  const raw = typeof req.body?.repo === "string" ? req.body.repo : "";
  const ref = typeof req.body?.ref === "string" ? req.body.ref.trim() : "";
  const appPath = typeof req.body?.appPath === "string" ? req.body.appPath.trim() : "";
  const parsed = parseGithubRepoInput(raw);
  if (!parsed) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid repo. Use owner/name or https://github.com/owner/repo',
    });
  }
  try {
    const out = await fetchGithubRepoContext({
      ...parsed,
      ref: ref || undefined,
      appPath: appPath || undefined,
    });
    if (!out.ok) return res.status(502).json({ ok: false, error: out.error });
    return res.json({
      ok: true,
      fullName: out.fullName,
      description: out.description,
      topics: out.topics,
      readme: out.readme,
      packageJson: out.packageJson,
      babelConfigPath: out.babelConfigPath,
      babelConfig: out.babelConfig,
      metroConfigPath: out.metroConfigPath,
      metroConfig: out.metroConfig,
      expoConfig: out.expoConfig,
      tsconfigJson: out.tsconfigJson,
      easJson: out.easJson,
      appPath: out.appPath,
      defaultBranch: out.defaultBranch,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) });
  }
});

function buildSystemPrompt(reqBody) {
  const spec = reqBody?.spec;
  const client = reqBody?.githubContext;
  const augment = githubContextToPromptAugment(client);
  const copilotContext = reqBody?.copilotContext;
  const phase = copilotContext?.phase;
  if (
    copilotContext &&
    (phase === "project-build-post" || phase === "quick-build-post")
  ) {
    return buildProjectBuildCopilotSystem(spec, copilotContext);
  }
  return buildCopilotSystem(spec, augment, copilotContext);
}

function getSafeChatMessages(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return null;
  const MAX_MSG = 48;
  const MAX_CHARS = 12000;
  const safe = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, MAX_CHARS),
    }))
    .slice(-MAX_MSG);
  return safe.length ? safe : null;
}

/** Team conference room: use messages[] or a single facilitator message from topic */
function getTeamRoomMessages(body) {
  const fromChat = getSafeChatMessages(body);
  if (fromChat) return fromChat;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const content =
    topic.slice(0, 12000) ||
    "Stand-up: align on what we're shipping next in REACTIVE (Expo previews, App Spec, Project build) — who owns what and what could bite us?";
  return [{ role: "user", content }];
}

function extractAndValidateProposedSpec(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) {
    return { proposedSpec: null, specValidationError: null };
  }
  try {
    const obj = JSON.parse(m[1].trim());
    const normalized = normalizeAppSpecForSchema(obj);
    const v = validateSpecObject(normalized);
    if (v.ok) return { proposedSpec: normalized, specValidationError: null };
    return { proposedSpec: null, specValidationError: v.error };
  } catch (e) {
    return { proposedSpec: null, specValidationError: `Invalid JSON in code block: ${e.message}` };
  }
}

app.post("/api/validate", (req, res) => {
  const v = validateSpecObject(req.body);
  if (v.ok) return res.json({ ok: true });
  return res.status(400).json({ ok: false, error: v.error });
});

app.post("/api/generate", async (req, res) => {
  const spec = req.body;
  if (!spec?.meta?.slug || typeof spec.meta.slug !== "string") {
    return res.status(400).json({ error: "Invalid body: expected App Spec with meta.slug" });
  }

  const normalized = normalizeAppSpecForSchema(spec);
  const v = validateSpecObject(normalized);
  if (!v.ok) {
    return res.status(400).json({ ok: false, error: v.error });
  }

  let tmp;
  try {
    const { tmp: t, outDir } = materializeProject(normalized);
    tmp = t;

    const slug = String(normalized.meta.slug).replace(/[^a-z0-9-]/gi, "-") || "expo-app";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}-expo.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    await new Promise((resolve, reject) => {
      archive.on("error", reject);
      archive.on("end", resolve);
      archive.pipe(res);
      archive.directory(outDir, false);
      archive.finalize();
    });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(400).json({ ok: false, error: String(e.message || e) });
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/**
 * Build project + expo export --platform web → session id for iframe
 */
app.post("/api/preview-build", async (req, res) => {
  const spec = req.body;
  if (!spec?.meta?.slug) {
    return res.status(400).json({ error: "Invalid App Spec" });
  }

  const normalized = normalizeAppSpecForSchema(spec);
  const v = validateSpecObject(normalized);
  if (!v.ok) {
    return res.status(400).json({ ok: false, error: v.error });
  }

  let tmp;
  try {
    const { tmp: t, outDir } = materializeProject(normalized);
    tmp = t;
    await runExpoWebExport(outDir);

    const webDist = path.join(outDir, "dist");
    if (!fs.existsSync(webDist)) {
      fs.rmSync(tmp, { recursive: true, force: true });
      return res.status(500).json({ error: "expo export did not produce dist/" });
    }

    const id = randomBytes(16).toString("base64url");
    const previewBase = `/api/preview-frame/${id}`;
    rewritePreviewPaths(webDist, previewBase);
    previewSessions.set(id, { tmp, created: Date.now() });

    const entry = previewEntryHtml(normalized);
    const entryPath = path.join(webDist, entry);
    const fallback = fs.existsSync(entryPath) ? entry : fs.readdirSync(webDist).find((f) => f.endsWith(".html") && !f.startsWith("+")) || "today.html";

    const specTu = computeSpecJsonTokenUsage(normalized);
    res.json({
      ok: true,
      previewId: id,
      /** path under /api/preview-frame/:id/ */
      entry: fallback,
      message: "Open preview iframe (Expo web export — same UI code as native, web renderer).",
      tokenUsage: {
        phase: "preview-build",
        llmTokens: 0,
        ...specTu,
      },
    });
  } catch (e) {
    console.error(e);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    if (!res.headersSent) {
      const msg = String(e.message || e);
      const isCodegen =
        /codegen|navigation\.type|tabs|validation failed|npm install|expo export/i.test(msg);
      res.status(isCodegen ? 422 : 500).json({
        ok: false,
        error: msg,
        hint: isCodegen
          ? "Check App Spec (navigation routes, design colors). Codegen v1 requires tab navigation; stack/tabs-stack are coerced to tabs. Retry Build preview after fixing the spec or use a demo spec."
          : undefined,
      });
    }
  }
});

app.use("/api/preview-frame/:id", (req, res, next) => {
  const { id } = req.params;
  const session = previewSessions.get(id);
  if (!session) {
    return res.status(404).send("Preview expired or not found. Rebuild from Studio.");
  }
  const webDist = path.join(session.tmp, "out", "dist");
  if (!fs.existsSync(webDist)) {
    return res.status(404).send("dist missing");
  }
  const prefix = `/api/preview-frame/${id}`;
  const pathname = req.originalUrl.split("?")[0];
  let rel = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "/";
  if (!rel || rel === "/") rel = "/index.html";
  const savedUrl = req.url;
  req.url = rel;
  res.on("finish", () => {
    req.url = savedUrl;
  });
  express.static(webDist, { fallthrough: true })(req, res, (err) => {
    req.url = savedUrl;
    if (err) return next(err);
    next();
  });
});

app.post(
  "/api/chat",
  asyncRoute(async (req, res) => {
  const resolved = resolveLlmFromRequest(req, process.env);
  if (!resolved.ok) {
    return res.status(501).json({
      error: resolved.error,
      hint: "Add OPENAI_API_KEY or NVIDIA_API_KEY on the API, or paste your key in Studio (Bring your own API key).",
    });
  }

  const safeMessages = getSafeChatMessages(req.body);
  if (!safeMessages) {
    return res.status(400).json({ error: "messages[] required with valid user/assistant entries" });
  }

  let system;
  try {
    system = buildSystemPrompt(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(400).json({ error: `Could not build copilot prompt: ${msg.slice(0, 280)}` });
  }

  try {
    const text = await completeLlmChat({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system,
      messages: safeMessages,
    });
    const { proposedSpec, specValidationError } = extractAndValidateProposedSpec(text);
    const tokenUsage = computeChatTokenUsage({
      provider: resolved.provider,
      model: resolved.model,
      system,
      messages: safeMessages,
      completionText: text,
    });

    res.json({ reply: text, proposedSpec, specValidationError, tokenUsage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = process.env.NODE_ENV === "production" ? "Model request failed" : msg.slice(0, 500);
    res.status(502).json({ error: safe });
  }
  })
);

/**
 * SSE stream: token deltas then final { done, proposedSpec?, specValidationError? }
 */
app.post(
  "/api/chat/stream",
  asyncRoute(async (req, res) => {
  const resolved = resolveLlmFromRequest(req, process.env);
  if (!resolved.ok) {
    return res.status(501).json({
      error: resolved.error,
      hint: "Add OPENAI_API_KEY or NVIDIA_API_KEY on the API, or paste your key in Studio (Bring your own API key).",
    });
  }

  const safeMessages = getSafeChatMessages(req.body);
  if (!safeMessages) {
    return res.status(400).json({ error: "messages[] required with valid user/assistant entries" });
  }

  let system;
  try {
    system = buildSystemPrompt(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(400).json({ error: `Could not build copilot prompt: ${msg.slice(0, 280)}` });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 120000);
  req.on("close", () => {
    clearTimeout(t);
    ac.abort();
  });

  const writeSse = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    let full = "";
    for await (const chunk of streamLlmChat({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system,
      messages: safeMessages,
      signal: ac.signal,
    })) {
      full += chunk;
      writeSse({ type: "delta", text: chunk });
    }
    clearTimeout(t);
    const { proposedSpec, specValidationError } = extractAndValidateProposedSpec(full);
    const tokenUsage = computeChatTokenUsage({
      provider: resolved.provider,
      model: resolved.model,
      system,
      messages: safeMessages,
      completionText: full,
    });
    const donePayload = { type: "done", fullText: full, proposedSpec, specValidationError, tokenUsage };
    try {
      JSON.stringify(donePayload);
      writeSse(donePayload);
    } catch {
      writeSse({
        type: "done",
        fullText: full,
        proposedSpec: null,
        specValidationError: specValidationError ?? "Could not serialize proposed spec for stream",
        tokenUsage,
      });
    }
    res.end();
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    try {
      writeSse({
        type: "error",
        message: process.env.NODE_ENV === "production" ? "Stream failed" : msg.slice(0, 400),
      });
    } catch (_) {
      /* response may be closed */
    }
    try {
      res.end();
    } catch (_) {
      /* ignore */
    }
  }
  })
);

/**
 * Probe: confirms this process has the team-room routes (use after deploy / pull). GET never streams.
 */
app.get("/api/team-room", (_req, res) => {
  res.json({
    ok: true,
    post: "/api/team-room/stream",
    hint: "GET is a capability check. Start a meeting with POST + JSON body { topic } or { messages[] }.",
  });
});

/**
 * Conference room: teammates speak to each other (bracket tags) — same LLM / BYOK as Studio; no App Spec.
 */
app.post(
  "/api/team-room/stream",
  asyncRoute(async (req, res) => {
    const resolved = resolveLlmFromRequest(req, process.env);
    if (!resolved.ok) {
      return res.status(501).json({
        error: resolved.error,
        hint: "Add OPENAI_API_KEY or NVIDIA_API_KEY on the API, or paste your key in Studio (Bring your own API key).",
      });
    }

    const safeMessages = getTeamRoomMessages(req.body);

    const continuation = safeMessages.some((m) => m.role === "assistant");
    const system = buildTeamRoomSystem({ continuation });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 180000);
    req.on("close", () => {
      clearTimeout(t);
      ac.abort();
    });

    const writeSse = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      let full = "";
      for await (const chunk of streamLlmChat({
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        model: resolved.model,
        system,
        messages: safeMessages,
        signal: ac.signal,
        temperature: 0.82,
        max_tokens: 16000,
      })) {
        full += chunk;
        writeSse({ type: "delta", text: chunk });
      }
      clearTimeout(t);
      if (!full.trim()) {
        writeSse({
          type: "error",
          message:
            "Model returned no text — check BYOK key, model id in Studio, and provider status; try a shorter topic if filters block.",
        });
        res.end();
        return;
      }
      const tokenUsage = computeChatTokenUsage({
        provider: resolved.provider,
        model: resolved.model,
        system,
        messages: safeMessages,
        completionText: full,
      });
      writeSse({ type: "done", fullText: full, tokenUsage });
      res.end();
    } catch (e) {
      clearTimeout(t);
      const msg = e instanceof Error ? e.message : String(e);
      try {
        writeSse({
          type: "error",
          message: process.env.NODE_ENV === "production" ? "Team room stream failed" : msg.slice(0, 400),
        });
      } catch (_) {}
      try {
        res.end();
      } catch (_) {}
    }
  })
);

/**
 * Project RN builder (plannew flow): clarifying questions as JSON — same BYOK / multi-provider as Studio.
 */
app.post("/api/builder/clarify", async (req, res) => {
  const resolved = resolveLlmFromRequest(req, process.env);
  if (!resolved.ok) {
    return res.status(501).json({
      error: resolved.error,
      hint: "Add OPENAI_API_KEY or NVIDIA_API_KEY on the API, or pass llm from the browser (BYOK).",
    });
  }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "prompt required" });
  }
  if (prompt.length > 48000) {
    return res.status(400).json({ error: "prompt too long" });
  }

  try {
    const text = await completeLlmChat({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system: CLARIFICATION_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const questions = parseQuestionsJson(text);
    const tokenUsage = computeChatTokenUsage({
      provider: resolved.provider,
      model: resolved.model,
      system: CLARIFICATION_PROMPT,
      messages: [{ role: "user", content: prompt }],
      completionText: text,
    });
    res.json({ questions, tokenUsage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      /JSON|Unexpected token/i.test(msg) || msg.includes("parse")
        ? "The model did not return pure JSON. Retry or switch model."
        : undefined;
    res.status(502).json({
      error: msg.slice(0, 500),
      ...(hint ? { hint } : {}),
    });
  }
});

/**
 * Stream full ===FILE=== project text (plannew-style). Long timeout for large generations.
 */
app.post("/api/builder/generate-stream", async (req, res) => {
  const resolved = resolveLlmFromRequest(req, process.env);
  if (!resolved.ok) {
    return res.status(501).json({
      error: resolved.error,
      hint: "Add OPENAI_API_KEY or NVIDIA_API_KEY on the API, or pass llm from the browser (BYOK).",
    });
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (!prompt) {
    return res.status(400).json({ error: "prompt required" });
  }

  let qaBlock = "";
  if (questions.length > 0) {
    const lines = [];
    for (const q of questions) {
      if (!q || typeof q !== "object") continue;
      const id = q.id;
      const qtext = typeof q.question === "string" ? q.question.trim() : "";
      const a = answers.find((x) => x && x.questionId === id);
      const aval = a && typeof a.value === "string" ? a.value.trim() : String(a?.value ?? "").trim();
      lines.push(`Q: ${qtext || `(question ${id})`}`);
      lines.push(`A: ${aval || "(empty)"}`);
      lines.push("");
    }
    qaBlock = lines.join("\n").trim();
  }
  if (!qaBlock) {
    qaBlock = answers.map((a) => `Q${a.questionId}: ${String(a.value ?? "")}`).join("\n");
  }

  const userContent = `## App idea
${prompt}

## Clarifications (implement all that apply)
${qaBlock}

## Instructions
Generate the **complete** React Native (Expo) project per the system prompt. The app must reflect the idea and clarifications above — not a generic template with placeholder names.`;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 300000);
  req.on("close", () => {
    clearTimeout(t);
    ac.abort();
  });

  const writeSse = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    let full = "";
    for await (const chunk of streamLlmChat({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system: GENERATION_PROMPT,
      messages: [{ role: "user", content: userContent }],
      signal: ac.signal,
    })) {
      full += chunk;
      writeSse({ type: "delta", text: chunk });
    }
    clearTimeout(t);
    const tokenUsage = computeChatTokenUsage({
      provider: resolved.provider,
      model: resolved.model,
      system: GENERATION_PROMPT,
      messages: [{ role: "user", content: userContent }],
      completionText: full,
    });
    writeSse({ type: "done", fullText: full, tokenUsage });
    res.end();
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    writeSse({
      type: "error",
      message: process.env.NODE_ENV === "production" ? "Generation failed" : msg.slice(0, 500),
    });
    res.end();
  }
});

app.use((err, req, res, _next) => {
  console.error("[api]", err);
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: msg.slice(0, 500) });
});

const SERVE_STATIC = process.env.SERVE_STATIC === "1" || process.env.SERVE_STATIC === "true";
if (SERVE_STATIC) {
  const webDist = path.join(root, "apps", "web", "dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  } else {
    console.warn("SERVE_STATIC set but apps/web/dist missing — run npm run build -w web");
  }
}

/** Default below avoids clashing with other local apps that bind 8787 and only expose /api/health */
const PORT = Number(process.env.PORT) || 8788;
app.listen(PORT, () => {
  console.log(
    `REACTIVE API v${API_VERSION} http://localhost:${PORT}${SERVE_STATIC ? " (+serving web dist)" : ""}`
  );
});
