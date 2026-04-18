#!/usr/bin/env node
/**
 * Run TypeScript check on a generated Expo project (quality gate).
 * Usage: node scripts/check-artifact.mjs <projectDir>
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/check-artifact.mjs <projectDir>");
  process.exit(1);
}

const abs = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
if (!fs.existsSync(path.join(abs, "package.json"))) {
  console.error("Not a project directory:", abs);
  process.exit(1);
}

const r = spawnSync("npx", ["tsc", "--noEmit"], { cwd: abs, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
