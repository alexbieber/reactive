#!/usr/bin/env node
/**
 * Validates a REACTIVE App Spec JSON file against docs/spec-schema/app-spec.schema.json.
 * Usage: node scripts/validate-spec.mjs [path/to/spec.json]
 * Default: docs/spec-schema/examples/habit-tracker.spec.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const schemaPath = path.join(root, "docs", "spec-schema", "app-spec.schema.json");

const target =
  process.argv[2] ??
  path.join(root, "docs", "spec-schema", "examples", "habit-tracker.spec.json");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const data = JSON.parse(fs.readFileSync(target, "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(schema);
const ok = validate(data);

if (!ok) {
  console.error(`Invalid App Spec: ${path.relative(root, target)}`);
  for (const err of validate.errors ?? []) {
    const p = err.instancePath || "(root)";
    console.error(`  ${p} ${err.message}`);
  }
  process.exit(1);
}

console.log(`OK — ${path.relative(root, target)} matches app-spec.schema.json`);
