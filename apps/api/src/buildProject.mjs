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

  const npm = spawnSync("npm", ["install"], {
    cwd: outDir,
    encoding: "utf8",
  });
  if (npm.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error((npm.stderr || npm.stdout || "npm install failed").trim());
  }

  return { tmp, outDir, specPath };
}

/**
 * @param {string} outDir - Expo project root
 * @returns {Promise<void>}
 */
export function runExpoWebExport(outDir) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", ["expo", "export", "--platform", "web"], {
      cwd: outDir,
      shell: false,
      env: { ...process.env, CI: "1" },
    });
    let err = "";
    p.stderr?.on("data", (d) => {
      err += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `expo export exited ${code}`));
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
