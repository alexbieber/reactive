/**
 * Keep in sync with apps/api/src/normalizeAppSpec.mjs — fixes invalid screen.blocks before schema validation.
 */
const BLOCK_SET = new Set(["list", "detail", "form", "settings", "chart", "hero", "empty-state", "custom"]);

const BLOCK_ALIASES: Record<string, string> = {
  empty_state: "empty-state",
  emptystate: "empty-state",
  list_view: "list",
  listview: "list",
  lists: "list",
  detail_view: "detail",
  detailview: "detail",
  setting: "settings",
  settings_screen: "settings",
  inputs: "form",
  input: "form",
  calculator: "custom",
  keypad: "custom",
  keyboard: "custom",
  button: "custom",
  buttons: "custom",
  toolbar: "custom",
  display: "custom",
  screen: "custom",
  home: "hero",
  landing: "hero",
};

function blockStringFromRaw(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const s = blockStringFromRaw(x);
      if (String(s).trim() !== "") return s;
    }
    return "";
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const keys = ["type", "block", "kind", "name", "id", "layout", "component", "screen"] as const;
    for (const k of keys) {
      const v = o[k];
      if (v != null && typeof v === "string") return v;
    }
    for (const k of keys) {
      const v = o[k];
      if (v != null) return String(v);
    }
  }
  return "";
}

function normalizeBlockToken(raw: unknown): string {
  const src = blockStringFromRaw(raw);
  const trimmed = String(src).trim();
  if (trimmed === "") return "custom";
  let s = trimmed.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  if (BLOCK_SET.has(s)) return s;
  if (BLOCK_ALIASES[s]) return BLOCK_ALIASES[s];
  if (s.replace(/-/g, "") === "emptystate") return "empty-state";
  return "custom";
}

function assertAllowedBlockEnum(s: string): string {
  return BLOCK_SET.has(s) ? s : "custom";
}

const DEFAULT_ENTITIES = [
  {
    name: "Item",
    description: "Generic domain object for codegen.",
    fields: [
      { name: "id", type: "string", required: true },
      { name: "title", type: "string", required: true },
    ],
  },
];

function cloneSpec<T>(spec: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(spec);
  }
  return JSON.parse(JSON.stringify(spec)) as T;
}

function coerceScreensToArray(out: Record<string, unknown>): void {
  const sc = out.screens;
  if (sc == null) return;
  if (Array.isArray(sc)) return;
  if (typeof sc !== "object") return;
  const keys = Object.keys(sc as object);
  if (keys.length === 0) return;
  const allNumeric = keys.every((k) => /^\d+$/.test(k));
  if (!allNumeric) return;
  keys.sort((a, b) => Number(a) - Number(b));
  out.screens = keys.map((k) => (sc as Record<string, unknown>)[k]);
}

function coerceBlocksArrayOnScreen(screen: { blocks?: unknown }): void {
  let b = screen.blocks;
  if (typeof b === "string") {
    const t = b.trim();
    if (t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        b = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        b = t.split(/[,\s]+/).filter(Boolean);
      }
    } else {
      b = t.split(/[,\s]+/).filter(Boolean);
    }
    screen.blocks = b;
    return;
  }
  if (b != null && !Array.isArray(b) && typeof b === "object" && typeof (b as { length?: number }).length === "number") {
    try {
      screen.blocks = Array.from(b as ArrayLike<unknown>);
    } catch {
      screen.blocks = ["custom"];
    }
  }
}

function ensureDataModel(out: Record<string, unknown>): void {
  if (!out.data_model || typeof out.data_model !== "object") {
    out.data_model = { entities: cloneSpec(DEFAULT_ENTITIES) };
    return;
  }
  const dm = out.data_model as { entities?: unknown };
  if (!Array.isArray(dm.entities) || dm.entities.length === 0) {
    dm.entities = cloneSpec(DEFAULT_ENTITIES);
  }
}

/** Codegen v1 only implements `tabs` — stack/tabs-stack would fail preview/generate */
function ensureNavigationTabsForCodegen(out: Record<string, unknown>): void {
  const nav = out.navigation;
  if (!nav || typeof nav !== "object") return;
  const t = (nav as { type?: unknown }).type;
  if (t === "stack" || t === "tabs-stack") {
    (nav as { type: string }).type = "tabs";
  }
}

/** Deep clone + normalize blocks[] + ensure data_model.entities (schema-required) */
export function normalizeAppSpecForSchema<T>(spec: T): T {
  if (spec == null || typeof spec !== "object") return spec;
  try {
    const out = cloneSpec(spec) as Record<string, unknown>;
    ensureDataModel(out);
    ensureNavigationTabsForCodegen(out);
    coerceScreensToArray(out);
    const screens = out.screens;
    if (!Array.isArray(screens)) return out as T;
    for (const screen of screens) {
      if (!screen || typeof screen !== "object") continue;
      const sc = screen as { blocks?: unknown[] };
      coerceBlocksArrayOnScreen(sc);
      if (!Array.isArray(sc.blocks)) {
        sc.blocks = ["custom"];
      } else {
        sc.blocks = sc.blocks.map((b) => assertAllowedBlockEnum(normalizeBlockToken(b)));
      }
    }
    return out as T;
  } catch {
    return spec;
  }
}
