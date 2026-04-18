#!/usr/bin/env node
/**
 * Optional: polish copy fields in an App Spec via OpenAI (same JSON shape — still validates).
 * Requires OPENAI_API_KEY. Does not add new keys; improves strings only.
 *
 * Usage: node scripts/llm-enrich-spec.mjs <spec.json> [out.json]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const specPath = process.argv[2];
const outPath = process.argv[3];
if (!specPath) {
  console.error("Usage: node scripts/llm-enrich-spec.mjs <spec.json> [out.json]");
  process.exit(1);
}

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("Set OPENAI_API_KEY");
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "docs/spec-schema/app-spec.schema.json"), "utf8"));

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You improve clarity and tone of user-facing copy inside a REACTIVE App Spec JSON.
Return ONLY valid JSON matching the input structure exactly (same keys and types).
You may only change string values in: audience.summary, audience.primary_persona, journeys[].name, journeys[].steps[], screens[].title, screens[].purpose, non_goals[].
Keep technical ids (meta.slug, route ids, screen ids) unchanged.`,
      },
      { role: "user", content: JSON.stringify(spec) },
    ],
  }),
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json();
const raw = data.choices?.[0]?.message?.content;
if (!raw) {
  console.error("No content from model");
  process.exit(1);
}

const enriched = JSON.parse(raw);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(enriched)) {
  console.error("Enriched spec failed schema validation:", validate.errors);
  process.exit(1);
}

const target = outPath || specPath.replace(/\.json$/i, ".enriched.json");
fs.writeFileSync(target, JSON.stringify(enriched, null, 2) + "\n");
console.log("Wrote", target);
