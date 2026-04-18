/**
 * REACTIVE API — validate, codegen, ZIP, Expo web preview, optional OpenAI chat.
 */

import archiver from "archiver";
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";
import cors from "cors";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { buildCopilotSystem } from "./copilotPrompt.mjs";
import {
  materializeProject,
  runExpoWebExport,
  previewEntryHtml,
  rewritePreviewPaths,
} from "./buildProject.mjs";
import { completeLlmChat, resolveLlmFromRequest, streamLlmChat } from "./llmStream.mjs";
import { validateSpecObject } from "./specValidate.mjs";
import {
  fetchGithubRepoContext,
  githubContextToPromptAugment,
  parseGithubRepoInput,
} from "./githubContext.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..");

const app = express();

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
    version: "1.2.0",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    capabilities: {
      codegen: true,
      preview: true,
      /** Chat works with server OPENAI_API_KEY or client-supplied keys (BYOK) from Studio */
      chat: true,
      chatStream: true,
      serverOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      llmProviders: ["openai", "anthropic", "google", "groq", "mistral"],
      githubRepoContext: true,
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
  return buildCopilotSystem(spec, augment);
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

function extractAndValidateProposedSpec(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) {
    return { proposedSpec: null, specValidationError: null };
  }
  try {
    const obj = JSON.parse(m[1].trim());
    const v = validateSpecObject(obj);
    if (v.ok) return { proposedSpec: obj, specValidationError: null };
    return { proposedSpec: null, specValidationError: v.error };
  } catch (e) {
    return { proposedSpec: null, specValidationError: `Invalid JSON in code block: ${e.message}` };
  }
}

app.post("/api/validate", (req, res) => {
  const spec = req.body;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reactive-val-"));
  const specPath = path.join(tmp, "spec.json");
  try {
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
    const r = spawnSync(process.execPath, [path.join(root, "scripts", "validate-spec.mjs"), specPath], {
      encoding: "utf8",
    });
    if (r.status === 0) return res.json({ ok: true });
    return res.status(400).json({
      ok: false,
      error: (r.stderr || r.stdout || "validation failed").trim(),
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

app.post("/api/generate", async (req, res) => {
  const spec = req.body;
  if (!spec?.meta?.slug || typeof spec.meta.slug !== "string") {
    return res.status(400).json({ error: "Invalid body: expected App Spec with meta.slug" });
  }

  let tmp;
  try {
    const { tmp: t, outDir } = materializeProject(spec);
    tmp = t;

    const slug = String(spec.meta.slug).replace(/[^a-z0-9-]/gi, "-") || "expo-app";
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

  let tmp;
  try {
    const { tmp: t, outDir } = materializeProject(spec);
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

    const entry = previewEntryHtml(spec);
    const entryPath = path.join(webDist, entry);
    const fallback = fs.existsSync(entryPath) ? entry : fs.readdirSync(webDist).find((f) => f.endsWith(".html") && !f.startsWith("+")) || "today.html";

    res.json({
      ok: true,
      previewId: id,
      /** path under /api/preview-frame/:id/ */
      entry: fallback,
      message: "Open preview iframe (Expo web export — same UI code as native, web renderer).",
    });
  } catch (e) {
    console.error(e);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    if (!res.headersSent) res.status(500).json({ ok: false, error: String(e.message || e) });
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

app.post("/api/chat", async (req, res) => {
  const resolved = resolveLlmFromRequest(req, process.env);
  if (!resolved.ok) {
    return res.status(501).json({
      error: resolved.error,
      hint: "Add OPENAI_API_KEY on the API, or paste your key in Studio (Bring your own API key).",
    });
  }

  const safeMessages = getSafeChatMessages(req.body);
  if (!safeMessages) {
    return res.status(400).json({ error: "messages[] required with valid user/assistant entries" });
  }

  const system = buildSystemPrompt(req.body);

  try {
    const text = await completeLlmChat({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.model,
      system,
      messages: safeMessages,
    });
    const { proposedSpec, specValidationError } = extractAndValidateProposedSpec(text);

    res.json({ reply: text, proposedSpec, specValidationError });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const safe = process.env.NODE_ENV === "production" ? "Model request failed" : msg.slice(0, 500);
    res.status(502).json({ error: safe });
  }
});

/**
 * SSE stream: token deltas then final { done, proposedSpec?, specValidationError? }
 */
app.post("/api/chat/stream", async (req, res) => {
  const resolved = resolveLlmFromRequest(req, process.env);
  if (!resolved.ok) {
    return res.status(501).json({
      error: resolved.error,
      hint: "Add OPENAI_API_KEY on the API, or paste your key in Studio (Bring your own API key).",
    });
  }

  const safeMessages = getSafeChatMessages(req.body);
  if (!safeMessages) {
    return res.status(400).json({ error: "messages[] required with valid user/assistant entries" });
  }

  const system = buildSystemPrompt(req.body);

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
    writeSse({ type: "done", fullText: full, proposedSpec, specValidationError });
    res.end();
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    writeSse({
      type: "error",
      message: process.env.NODE_ENV === "production" ? "Stream failed" : msg.slice(0, 400),
    });
    res.end();
  }
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

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`REACTIVE API http://localhost:${PORT}${SERVE_STATIC ? " (+serving web dist)" : ""}`);
});
