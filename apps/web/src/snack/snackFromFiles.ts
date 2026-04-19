import type { SnackDependencies } from "snack-sdk";

export type PreviewSourceFile = { path: string; content: string };

function normalizedPath(f: PreviewSourceFile): string {
  return f.path.replace(/^\//, "").replace(/\\/g, "/");
}

/** True when the tree looks like Expo Router (Snack defaults to App.js if package.json has no `main`). */
function projectUsesExpoRouter(files: PreviewSourceFile[]): boolean {
  const hasAppLayout = files.some((f) => /(^|\/)app\/_layout\.(tsx|jsx|ts|js)$/.test(normalizedPath(f)));
  if (hasAppLayout) return true;
  const pkg = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (!pkg) return false;
  try {
    const j = JSON.parse(pkg.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Boolean(j.dependencies?.["expo-router"] ?? j.devDependencies?.["expo-router"]);
  } catch {
    return false;
  }
}

/**
 * Snack’s Metro defaults to `App.js` when `main` is missing. Expo Router apps must use `expo-router/entry`.
 */
function patchPackageJsonMainForSnack(
  out: Record<string, { type: "CODE"; contents: string }>,
  files: PreviewSourceFile[]
): void {
  if (!projectUsesExpoRouter(files)) return;
  const pkgKey = Object.keys(out).find((k) => k === "package.json" || k.endsWith("/package.json"));
  if (!pkgKey) return;
  let pkg: { main?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(out[pkgKey].contents);
  } catch {
    return;
  }
  if (pkg.main === "expo-router/entry") return;
  pkg.main = "expo-router/entry";
  out[pkgKey] = { type: "CODE", contents: `${JSON.stringify(pkg, null, 2)}\n` };
}

const EXPO_ROUTER_APP_JS = "import 'expo-router/entry';\n";

/** Snack / Metro often resolve `App.js`; add a one-line Router entry if the model omitted it. */
function ensureAppJsForExpoRouter(
  out: Record<string, { type: "CODE"; contents: string }>,
  files: PreviewSourceFile[]
): void {
  if (!projectUsesExpoRouter(files)) return;
  if (out["App.js"] || out["App.tsx"]) return;
  out["App.js"] = { type: "CODE", contents: EXPO_ROUTER_APP_JS };
}

/** Map repo paths → Snack `files` (limits size for Snack). */
export function buildSnackFiles(files: PreviewSourceFile[]): Record<string, { type: "CODE"; contents: string }> {
  const out: Record<string, { type: "CODE"; contents: string }> = {};
  const sorted = [...files].filter((f) => f.path && !f.path.includes("node_modules")).slice(0, 150);
  for (const f of sorted) {
    const p = normalizedPath(f);
    if (!p || /\.lock$/i.test(p)) continue;
    out[p] = { type: "CODE", contents: f.content };
  }
  patchPackageJsonMainForSnack(out, sorted);
  ensureAppJsForExpoRouter(out, sorted);
  return out;
}

export function parseSdkVersion(files: PreviewSourceFile[]): string {
  const appJson = files.find((f) => f.path === "app.json" || f.path.endsWith("/app.json"));
  if (appJson) {
    try {
      const j = JSON.parse(appJson.content) as { expo?: { sdkVersion?: string } };
      const v = j.expo?.sdkVersion;
      if (typeof v === "string") {
        const m = v.replace(/^~/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
        if (m) return `${m[1]}.${m[2]}.${m[3]}`;
      }
    } catch {
      /* ignore */
    }
  }
  return "54.0.0";
}

export function parseNpmDependencies(files: PreviewSourceFile[]): SnackDependencies {
  const pkg = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (!pkg) return {};
  try {
    const j = JSON.parse(pkg.content) as { dependencies?: Record<string, string> };
    const deps = j.dependencies || {};
    const out: SnackDependencies = {};
    let n = 0;
    for (const [name, ver] of Object.entries(deps)) {
      if (n >= 40) break;
      if (typeof ver !== "string") continue;
      out[name] = { version: ver.replace(/^[\^~]/, "") };
      n++;
    }
    return out;
  } catch {
    return {};
  }
}
