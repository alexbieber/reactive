/**
 * Shared: validate spec → codegen → npm install in a temp directory.
 * Caller owns cleanup of `tmp` unless using preview sessions.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const monorepoRoot = path.join(__dirname, "..", "..", "..");

/**
 * @param {object} spec - App Spec JSON
 * @returns {{ tmp: string, outDir: string, specPath: string }}
 */
export function materializeProject(spec) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reactive-gen-"));
  const specPath = path.join(tmp, "spec.json");
  const outDir = path.join(tmp, "out");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

  const v = spawnSync(process.execPath, [path.join(monorepoRoot, "scripts", "validate-spec.mjs"), specPath], {
    encoding: "utf8",
  });
  if (v.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error((v.stderr || v.stdout || "validation failed").trim());
  }

  fs.mkdirSync(outDir, { recursive: true });
  const g = spawnSync(process.execPath, [path.join(monorepoRoot, "scripts", "codegen.mjs"), specPath, outDir, "--skip-install"], {
    encoding: "utf8",
    cwd: monorepoRoot,
  });
  if (g.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error((g.stderr || g.stdout || "codegen failed").trim());
  }

  try {
    runNpmInstall(outDir);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }

  return { tmp, outDir, specPath };
}

/**
 * @param {string} outDir - package root (directory with package.json)
 */
export function runNpmInstall(outDir) {
  const npm = spawnSync("npm", ["install"], {
    cwd: outDir,
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
  });
  if (npm.status !== 0) {
    throw new Error((npm.stderr || npm.stdout || "npm install failed").trim().slice(0, 1200));
  }
}

/**
 * LLM-generated trees often have peer conflicts — use for Project build preview only.
 * @param {string} outDir
 */
export function runNpmInstallForPreview(outDir) {
  const npm = spawnSync(
    "npm",
    ["install", "--legacy-peer-deps", "--no-audit", "--no-fund"],
    {
      cwd: outDir,
      encoding: "utf8",
      maxBuffer: 14 * 1024 * 1024,
    }
  );
  if (npm.status !== 0) {
    const tail = (npm.stderr || npm.stdout || "npm install failed").trim().slice(-2500);
    throw new Error(`npm install failed:\n${tail}`);
  }
}

/**
 * LLM-generated package.json often omits web peers. Expo requires these for `expo export --platform web`.
 * Resolves versions against the project's Expo SDK (same as local `npx expo install react-native-web react-dom`).
 * @param {string} outDir - Expo project root
 */
export function ensureExpoWebPreviewDeps(outDir) {
  /** Prefer `npm exec` over `npx` so the **local** `expo` from this project is used (global npx can skip deps). */
  const r = spawnSync(
    "npm",
    ["exec", "--", "expo", "install", "react-native-web", "react-dom"],
    {
      cwd: outDir,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
        FORCE_COLOR: "0",
      },
    }
  );
  if (r.status !== 0) {
    const tail = (r.stderr || r.stdout || "expo install failed").trim().slice(-2500);
    throw new Error(`expo install react-native-web react-dom failed:\n${tail}`);
  }
  const rnw = path.join(outDir, "node_modules", "react-native-web", "package.json");
  const rdom = path.join(outDir, "node_modules", "react-dom", "package.json");
  if (!fs.existsSync(rnw) || !fs.existsSync(rdom)) {
    throw new Error(
      "expo install reported success but react-native-web / react-dom are missing in node_modules — restart the API (npm run dev:platform) and retry; if it persists, check npm/registry access."
    );
  }
}

/**
 * @param {string} outDir - Expo project root
 * @returns {Promise<void>}
 */
export function runExpoWebExport(outDir) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["expo", "export", "--platform", "web"], {
      cwd: outDir,
      /** Windows: npx is a .cmd shim — shell helps find it */
      shell: process.platform === "win32",
      env: {
        ...process.env,
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
        FORCE_COLOR: "0",
      },
    });
    let combined = "";
    const append = (d) => {
      combined += d.toString();
    };
    p.stdout?.on("data", append);
    p.stderr?.on("data", append);
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const msg = (combined.trim() || `expo export exited ${code}`).slice(-5000);
        reject(new Error(msg));
      }
    });
  });
}

/**
 * Initial HTML file for static export (expo-router) — e.g. today -> today.html
 */
export function previewEntryHtml(spec) {
  const initial = spec?.navigation?.initial_route || "index";
  const safe = String(initial).replace(/[^a-zA-Z0-9-_]/g, "") || "index";
  return `${safe}.html`;
}

/**
 * Expo web export emits root-absolute paths (/assets/..., /_expo/...). Rewrite so the
 * bundle can be served under a subpath (e.g. /api/preview-frame/:id/).
 * @param {string} webDist
 * @param {string} basePath - e.g. /api/preview-frame/abc123 (no trailing slash)
 */
export function rewritePreviewPaths(webDist, basePath) {
  const b = basePath.replace(/\/$/, "");
  function rewriteContent(s) {
    return s
      .replaceAll('"/assets/', `"${b}/assets/`)
      .replaceAll("'/assets/", `'${b}/assets/`)
      .replaceAll('"/_expo/', `"${b}/_expo/`)
      .replaceAll("'/_expo/", `'${b}/_expo/`)
      .replaceAll('url("/assets/', `url("${b}/assets/`)
      .replaceAll("url('/assets/", `url('${b}/assets/`)
      .replaceAll('href="/favicon.ico', `href="${b}/favicon.ico`)
      .replaceAll('href="/favicon.png', `href="${b}/favicon.png`);
  }

  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(html|js|css|json|map|txt)$/i.test(name)) {
        const c = fs.readFileSync(p, "utf8");
        const n = rewriteContent(c);
        if (n !== c) fs.writeFileSync(p, n, "utf8");
      }
    }
  }

  walk(webDist);
}

const MAX_BUILDER_PREVIEW_FILES = 450;
const MAX_BUILDER_PREVIEW_BYTES = 28 * 1024 * 1024;

const BABEL_CONFIG_NAMES = ["babel.config.js", "babel.config.cjs", "babel.config.mjs"];

/**
 * SDK 50+ deprecates `expo-router/babel` in babel plugins (use babel-preset-expo only). Generated trees
 * often still include it, which breaks `expo export --platform web`.
 * @param {string} source
 */
function stripExpoRouterBabelFromSource(source) {
  if (!/expo-router\/babel/.test(source)) return source;
  let s = source;
  s = s.replace(/require\(\s*['"]expo-router\/babel['"]\s*\)/g, "");
  s = s.replace(/,\s*['"]expo-router\/babel['"]/g, "");
  s = s.replace(/['"]expo-router\/babel['"]\s*,?/g, "");
  s = s.replace(/\[\s*,+\s*\]/g, "[]");
  s = s.replace(/\[\s*,/g, "[");
  s = s.replace(/,\s*\]/g, "]");
  s = s.replace(/,\s*,/g, ",");
  return s;
}

/**
 * Patch babel.config.* at project root after materialize (preview-export only).
 * @param {string} outDir
 */
export function sanitizeBuilderPreviewBabel(outDir) {
  for (const name of BABEL_CONFIG_NAMES) {
    const p = path.join(outDir, name);
    if (!fs.existsSync(p)) continue;
    let raw;
    try {
      raw = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const next = stripExpoRouterBabelFromSource(raw);
    if (next !== raw) fs.writeFileSync(p, next, "utf8");
  }
}

const EXPO_CONFIG_ROOT_NAMES = [
  "app.json",
  "app.config.js",
  "app.config.cjs",
  "app.config.mjs",
  "app.config.ts",
  "app.config.json",
];

/**
 * Models sometimes emit `expo-router/expo-router-app-plugin` in `expo.plugins`; Expo resolves plugins by
 * package name — use `expo-router` only (see template expo-starter `app.json`).
 * @param {string} source
 */
function stripExpoRouterAppPluginPath(source) {
  if (!source.includes("expo-router/expo-router-app-plugin")) return source;
  return source.replace(/expo-router\/expo-router-app-plugin/g, "expo-router");
}

/**
 * Patch app.json / app.config.* after materialize (preview-export only).
 * @param {string} outDir
 */
export function sanitizeBuilderPreviewExpoConfig(outDir) {
  for (const name of EXPO_CONFIG_ROOT_NAMES) {
    const p = path.join(outDir, name);
    if (!fs.existsSync(p)) continue;
    let raw;
    try {
      raw = fs.readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const next = stripExpoRouterAppPluginPath(raw);
    if (next !== raw) fs.writeFileSync(p, next, "utf8");
  }
}

/**
 * Serve exported web at document `/` on a dedicated port (see preview static server in server.mjs).
 * Strips subpath `experiments.baseUrl` so the bundle does not assume `/api/preview-frame/...`.
 * @param {string} outDir
 */
export function preparePreviewExportForDedicatedHost(outDir) {
  const appJsonPath = path.join(outDir, "app.json");
  if (!fs.existsSync(appJsonPath)) {
    throw new Error("app.json missing — include app.json in the generated project.");
  }
  let j;
  try {
    j = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`app.json is not valid JSON (${m})`);
  }
  j.expo = j.expo || {};
  if (j.expo.experiments) {
    delete j.expo.experiments.baseUrl;
    if (Object.keys(j.expo.experiments).length === 0) delete j.expo.experiments;
  }
  j.expo.web = {
    ...(j.expo.web || {}),
    bundler: (j.expo.web && j.expo.web.bundler) || "metro",
    output: "single",
  };
  fs.writeFileSync(appJsonPath, JSON.stringify(j, null, 2), "utf8");
}

/**
 * Write LLM-generated ===FILE=== tree to an Expo project root (same layout as unzipped builder output).
 * @param {Array<{ path: string, content: string }>} files
 * @param {string} outDir - e.g. tmp/out
 */
export function materializeGeneratedFiles(files, outDir) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files[] required");
  }
  fs.mkdirSync(outDir, { recursive: true });
  let totalBytes = 0;
  let n = 0;
  for (const f of files) {
    if (!f || typeof f.path !== "string") continue;
    const rel = safeProjectRelativePath(f.path);
    const content = typeof f.content === "string" ? f.content : "";
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > MAX_BUILDER_PREVIEW_BYTES) {
      throw new Error("Project too large for preview (max ~28MB source)");
    }
    n++;
    if (n > MAX_BUILDER_PREVIEW_FILES) {
      throw new Error("Too many files for preview");
    }
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }
  if (n === 0) throw new Error("No valid files to materialize");
}

function safeProjectRelativePath(p) {
  const normalized = path.normalize(p).replace(/\\/g, "/");
  const parts = normalized.split("/").filter((x) => x && x !== ".");
  if (parts.some((x) => x === "..")) {
    throw new Error("Invalid path in generated file list");
  }
  return path.join(...parts);
}

const PREVIEW_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".expo",
  "coverage",
  ".turbo",
  "ios",
  "android",
]);

/** Text-ish extensions we send to Expo Snack (client-side web preview). */
const PREVIEW_TEXT_EXT =
  /\.(tsx?|jsx?|json|md|mjs|cjs|css|html|svg|gitignore|env)$/i;

/**
 * Walk a generated Expo project and return source files for Snack (skips heavy folders).
 * @param {string} projectRoot
 * @returns {Array<{ path: string, content: string }>}
 */
export function readProjectSourceFilesForSnack(projectRoot) {
  const out = [];
  let totalBytes = 0;
  const maxBytes = 6 * 1024 * 1024;
  const maxFiles = 200;

  function walk(rel) {
    if (out.length >= maxFiles) return;
    const abs = rel ? path.join(projectRoot, rel) : projectRoot;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      const base = path.basename(abs);
      if (rel && PREVIEW_SKIP_DIRS.has(base)) return;
      for (const name of fs.readdirSync(abs)) {
        if (out.length >= maxFiles) return;
        walk(rel ? path.join(rel, name) : name);
      }
      return;
    }
    const relPosix = rel.replace(/\\/g, "/");
    if (!PREVIEW_TEXT_EXT.test(relPosix)) return;
    let content;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      return;
    }
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > maxBytes) {
      throw new Error("Project source too large for Snack preview (max ~6MB text)");
    }
    out.push({ path: relPosix, content });
  }

  walk("");
  if (out.length === 0) throw new Error("No source files found for preview");
  return out;
}

/**
 * @param {string} webDist - .../dist after expo export
 * @returns {string} entry filename for iframe
 */
export function pickPreviewEntryFromWebDist(webDist) {
  const indexPath = path.join(webDist, "index.html");
  if (fs.existsSync(indexPath)) return "index.html";
  const names = fs.existsSync(webDist) ? fs.readdirSync(webDist) : [];
  const html = names.find((f) => f.endsWith(".html") && !f.startsWith("+"));
  return html || "index.html";
}

/**
 * Fail fast with a clear message when the model output is not a runnable Expo app.
 * @param {string} outDir - project root (contains package.json)
 */
export function assertExpoPreviewProject(outDir) {
  const pkgPath = path.join(outDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      "No package.json at project root — the model must emit package.json (Expo app) for preview. Try Regenerate or fix files, or use Download ZIP and run locally."
    );
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`package.json is not valid JSON (${m}). Fix the file or regenerate.`);
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps.expo) {
    throw new Error(
      'package.json must list "expo" in dependencies for web export. The generated project may be incomplete — try another model or Regenerate.'
    );
  }
}
