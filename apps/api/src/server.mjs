/**
 * REACTIVE API — validate App Spec, run codegen, return Expo project as ZIP.
 * Optional: serve apps/web/dist when SERVE_STATIC=1 (production).
 */

import archiver from "archiver";
import cors from "cors";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..");

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "reactive-api", version: "1.0.0" });
});

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

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reactive-gen-"));
  const specPath = path.join(tmp, "spec.json");
  const outDir = path.join(tmp, "out");

  try {
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const v = spawnSync(process.execPath, [path.join(root, "scripts", "validate-spec.mjs"), specPath], {
      encoding: "utf8",
    });
    if (v.status !== 0) {
      return res.status(400).json({
        ok: false,
        error: (v.stderr || v.stdout || "validation failed").trim(),
      });
    }

    fs.mkdirSync(outDir, { recursive: true });
    const codegen = path.join(root, "scripts", "codegen.mjs");
    const g = spawnSync(process.execPath, [codegen, specPath, outDir, "--skip-install"], {
      encoding: "utf8",
      cwd: root,
    });
    if (g.status !== 0) {
      return res.status(500).json({
        ok: false,
        error: (g.stderr || g.stdout || "codegen failed").trim(),
      });
    }

    const npm = spawnSync("npm", ["install"], {
      cwd: outDir,
      encoding: "utf8",
    });
    if (npm.status !== 0) {
      return res.status(500).json({
        ok: false,
        error: (npm.stderr || npm.stdout || "npm install failed").trim(),
      });
    }

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
    if (!res.headersSent) res.status(500).json({ error: String(e) });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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
