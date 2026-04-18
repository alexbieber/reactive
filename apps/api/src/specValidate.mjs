/**
 * Validate an App Spec object using the repo JSON Schema (same as CLI).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { normalizeAppSpecForSchema } from "./normalizeAppSpec.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..", "..");

/**
 * @param {object} spec
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateSpecObject(spec) {
  const normalized = normalizeAppSpecForSchema(spec);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reactive-vspec-"));
  const specPath = path.join(tmp, "spec.json");
  try {
    fs.writeFileSync(specPath, JSON.stringify(normalized));
    const r = spawnSync(process.execPath, [path.join(root, "scripts", "validate-spec.mjs"), specPath], {
      encoding: "utf8",
    });
    if (r.status === 0) return { ok: true };
    return { ok: false, error: (r.stderr || r.stdout || "validation failed").trim() };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
