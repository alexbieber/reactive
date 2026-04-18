/**
 * LLMs often emit invalid screen.blocks values (typos, snake_case, or invented names).
 * Schema allows only: list | detail | form | settings | chart | hero | empty-state | custom
 * @param {unknown} spec
 * @returns {unknown} deep-cloned spec with blocks normalized
 */
const BLOCKS = ["list", "detail", "form", "settings", "chart", "hero", "empty-state", "custom"];
const BLOCK_SET = new Set(BLOCKS);

/** Map common variants → canonical enum value */
const BLOCK_ALIASES = {
  empty_state: "empty-state",
  emptystate: "empty-state",
  "empty-state": "empty-state",
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

/** Pull a block id from strings, numbers, or LLM-shaped objects like { type: "list" }. */
function blockStringFromRaw(raw) {
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
    const o = raw;
    const keys = ["type", "block", "kind", "name", "id", "layout", "component", "screen"];
    for (const k of keys) {
      if (o[k] != null && typeof o[k] === "string") return o[k];
    }
    for (const k of keys) {
      if (o[k] != null) return String(o[k]);
    }
  }
  return "";
}

function normalizeBlockToken(raw) {
  const src = blockStringFromRaw(raw);
  const trimmed = String(src).trim();
  if (trimmed === "") return "custom";
  let s = trimmed.toLowerCase();
  s = s.replace(/\s+/g, "-").replace(/_/g, "-");
  if (BLOCK_SET.has(s)) return s;
  if (BLOCK_ALIASES[s]) return BLOCK_ALIASES[s];
  const noHyphen = s.replace(/-/g, "");
  if (noHyphen === "emptystate") return "empty-state";
  return "custom";
}

function assertAllowedBlockEnum(s) {
  return BLOCK_SET.has(s) ? s : "custom";
}

/** LLMs often omit `data_model.entities` — schema requires it */
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

function cloneSpec(spec) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(spec);
  }
  return JSON.parse(JSON.stringify(spec));
}

/** LLMs sometimes emit screens as { "0": {...}, "1": {...} } instead of an array. */
function coerceScreensToArray(out) {
  const sc = out.screens;
  if (sc == null) return;
  if (Array.isArray(sc)) return;
  if (typeof sc !== "object") return;
  const keys = Object.keys(sc);
  if (keys.length === 0) return;
  const allNumeric = keys.every((k) => /^\d+$/.test(k));
  if (!allNumeric) return;
  keys.sort((a, b) => Number(a) - Number(b));
  out.screens = keys.map((k) => sc[k]);
}

/** blocks may be a string, JSON string, or array-like; schema requires string[]. */
function coerceBlocksArrayOnScreen(screen) {
  if (!screen || typeof screen !== "object") return;
  let b = screen.blocks;
  if (typeof b === "string") {
    const t = b.trim();
    if (t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t);
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
  if (b != null && !Array.isArray(b) && typeof b === "object" && typeof b.length === "number") {
    try {
      screen.blocks = Array.from(b);
    } catch {
      screen.blocks = ["custom"];
    }
  }
}

function ensureDataModel(out) {
  if (!out.data_model || typeof out.data_model !== "object") {
    out.data_model = { entities: cloneSpec(DEFAULT_ENTITIES) };
    return;
  }
  const dm = out.data_model;
  if (!Array.isArray(dm.entities) || dm.entities.length === 0) {
    dm.entities = cloneSpec(DEFAULT_ENTITIES);
  }
}

/** scripts/codegen.mjs v1 only emits Expo Router tabs — avoid preview/ZIP exit(1) on stack/tabs-stack */
function ensureNavigationTabsForCodegen(out) {
  const nav = out.navigation;
  if (!nav || typeof nav !== "object") return;
  const t = nav.type;
  if (t === "stack" || t === "tabs-stack") {
    nav.type = "tabs";
  }
}

export function normalizeAppSpecForSchema(spec) {
  if (spec == null || typeof spec !== "object") return spec;
  try {
    const out = cloneSpec(spec);
    ensureDataModel(out);
    ensureNavigationTabsForCodegen(out);
    coerceScreensToArray(out);
    if (!Array.isArray(out.screens)) return out;
    for (const screen of out.screens) {
      if (!screen || typeof screen !== "object") continue;
      coerceBlocksArrayOnScreen(screen);
      if (!Array.isArray(screen.blocks)) {
        screen.blocks = ["custom"];
      } else {
        screen.blocks = screen.blocks.map((b) => assertAllowedBlockEnum(normalizeBlockToken(b)));
      }
    }
    return out;
  } catch {
    return spec;
  }
}
