import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../docs/spec-schema/app-spec.schema.json";
import { normalizeAppSpecForSchema } from "./normalizeAppSpec";
import type { AppSpec } from "./types";

export function validateSpec(data: unknown): { ok: true } | { ok: false; message: string } {
  const normalized = normalizeAppSpecForSchema(data);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (validate(normalized)) return { ok: true };
  const lines = (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
  return { ok: false, message: lines.join("\n") };
}

export { normalizeAppSpecForSchema } from "./normalizeAppSpec";

export function stampTimes(spec: AppSpec): AppSpec {
  const now = new Date().toISOString();
  return {
    ...spec,
    meta: {
      ...spec.meta,
      created_at: spec.meta.created_at ?? now,
      updated_at: now,
    },
  };
}
