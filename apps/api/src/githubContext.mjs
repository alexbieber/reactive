/**
 * Public GitHub repo context via REST API.
 * README, package.json, Expo config, tsconfig, EAS, first matching babel.config.* / metro.config.* — optional monorepo appPath.
 * Set GITHUB_TOKEN or GH_TOKEN for higher rate limits (5000/hr vs 60).
 */

const GH = "https://api.github.com";
const MAX_README = 16_000;
const MAX_PKG = 6_000;
const MAX_PKG_SUMMARY = 2_800;
const MAX_EXPO = 5_000;
const MAX_TS = 3_500;
const MAX_EAS = 2_500;
const MAX_BABEL = 2_200;
const MAX_METRO = 2_200;

const BABEL_CANDIDATES = ["babel.config.js", "babel.config.cjs", "babel.config.mjs"];
const METRO_CANDIDATES = ["metro.config.js", "metro.config.cjs", "metro.config.mjs"];

const EXPO_CONFIG_PATHS = ["app.config.ts", "app.config.js", "app.json", "app.config.mjs"];

function headers() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "reactive-api/1.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** @param {string} input */
export function parseGithubRepoInput(input) {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  const short = s.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  try {
    const u = new URL(s);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

/** @param {string} s */
export function normalizeAppPath(s) {
  if (!s || typeof s !== "string") return "";
  const t = s.trim().replace(/^\/+|\/+$/g, "");
  if (!t) return "";
  if (t.includes("..") || t.includes("//")) return "";
  if (!/^[a-zA-Z0-9_.\-/]+$/.test(t)) return "";
  return t;
}

/** @param {string} appPath */
function joinAppPath(appPath, file) {
  const p = normalizeAppPath(appPath);
  if (!p) return file;
  return `${p}/${file}`;
}

function decodeContent(j) {
  if (!j?.content || j.encoding !== "base64") return "";
  try {
    return Buffer.from(String(j.content).replace(/\n/g, ""), "base64").toString("utf8");
  } catch {
    return "";
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @param {string} refQ
 * @param {Record<string, string>} h
 */
/**
 * @param {string} raw
 */
export function summarizePackageJson(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const j = JSON.parse(trimmed);
    const deps = { ...(typeof j.dependencies === "object" && j.dependencies ? j.dependencies : {}) };
    const peer =
      typeof j.peerDependencies === "object" && j.peerDependencies ? j.peerDependencies : {};
    for (const [k, v] of Object.entries(peer)) deps[k] = v;
    const dev =
      typeof j.devDependencies === "object" && j.devDependencies ? j.devDependencies : {};
    const names = Object.keys(deps).sort();
    const devNames = Object.keys(dev).sort();
    const lines = [];
    const nm = typeof j.name === "string" ? j.name : "";
    const ver = typeof j.version === "string" ? j.version : "";
    lines.push(`package: ${nm || "?"}${ver ? `@${ver}` : ""}`);
    const expo = deps.expo ?? dev.expo;
    const rn = deps["react-native"] ?? dev["react-native"];
    if (expo) lines.push(`expo: ${expo}`);
    if (rn) lines.push(`react-native: ${rn}`);
    if (deps["expo-router"]) lines.push("routing: expo-router");
    else if (deps["@react-navigation/native"]) lines.push("routing: react-navigation");
    lines.push(
      `dependencies (${names.length}): ${names.slice(0, 48).join(", ")}${names.length > 48 ? " …" : ""}`
    );
    if (devNames.length) {
      lines.push(
        `devDependencies (${devNames.length}): ${devNames.slice(0, 28).join(", ")}${devNames.length > 28 ? " …" : ""}`
      );
    }
    if (j.scripts && typeof j.scripts === "object") {
      const sk = Object.keys(j.scripts).slice(0, 14);
      lines.push(`scripts: ${sk.join(", ")}`);
    }
    return lines.join("\n").slice(0, MAX_PKG_SUMMARY);
  } catch {
    return "(package.json not parseable as JSON)";
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} appPath
 * @param {string} refQ
 * @param {Record<string, string>} h
 * @param {string[]} fileNames
 */
async function fetchFirstExistingFile(owner, repo, appPath, refQ, h, fileNames) {
  const paths = [];
  for (const f of fileNames) {
    paths.push(joinAppPath(appPath, f));
    paths.push(f);
  }
  const uniq = [...new Set(paths)];
  for (const p of uniq) {
    const t = await fetchRepoFile(owner, repo, p, refQ, h);
    if (t.trim()) return { path: p, content: t };
  }
  return { path: "", content: "" };
}

async function fetchRepoFile(owner, repo, filePath, refQ, h) {
  const pathEnc = filePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const res = await fetch(
    `${GH}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathEnc}${refQ}`,
    { headers: h }
  );
  if (!res.ok) return "";
  const j = await res.json();
  if (Array.isArray(j)) return "";
  return decodeContent(j);
}

/**
 * Ordered Expo paths: prefer app/ subfolder first when appPath set.
 * @param {string} appPath
 */
function orderedExpoPaths(appPath) {
  const ap = normalizeAppPath(appPath);
  const ordered = [];
  if (ap) {
    for (const p of EXPO_CONFIG_PATHS) ordered.push(joinAppPath(ap, p));
  }
  for (const p of EXPO_CONFIG_PATHS) ordered.push(p);
  return [...new Set(ordered)];
}

/**
 * @param {{ owner: string, repo: string, ref?: string, appPath?: string }} p
 */
export async function fetchGithubRepoContext(p) {
  const { owner, repo, ref } = p;
  const appPath = normalizeAppPath(p.appPath ?? "");
  const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const h = headers();

  const metaRes = await fetch(`${GH}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: h,
  });
  if (metaRes.status === 404) {
    return {
      ok: false,
      error: "Repo not found or private. Use a public repo, or set GITHUB_TOKEN on the API for private access.",
    };
  }
  if (metaRes.status === 403) {
    const t = await metaRes.text().catch(() => "");
    return {
      ok: false,
      error: t.includes("rate limit")
        ? "GitHub API rate limit — set GITHUB_TOKEN on the API for 5000 req/hr."
        : "GitHub API forbidden (403).",
    };
  }
  if (!metaRes.ok) {
    return { ok: false, error: `GitHub API error ${metaRes.status}` };
  }

  const meta = await metaRes.json();
  const fullName = meta.full_name || `${owner}/${repo}`;
  const description = typeof meta.description === "string" ? meta.description : "";
  const topics = Array.isArray(meta.topics) ? meta.topics : [];
  const defaultBranch = typeof meta.default_branch === "string" ? meta.default_branch : "main";

  let readmeRoot = "";
  const readmeRes = await fetch(`${GH}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme${refQ}`, {
    headers: h,
  });
  if (readmeRes.ok) {
    const rj = await readmeRes.json();
    readmeRoot = decodeContent(rj);
  }

  let readmeApp = "";
  if (appPath) {
    readmeApp = await fetchRepoFile(owner, repo, joinAppPath(appPath, "README.md"), refQ, h);
  }

  let readme = "";
  if (readmeApp.trim()) {
    readme = `${readmeRoot.slice(0, 7000)}\n\n--- Subpath: ${appPath} ---\n${readmeApp.slice(0, 9000)}`.slice(0, MAX_README);
  } else {
    readme = readmeRoot.slice(0, MAX_README);
  }

  let packageJson = await fetchRepoFile(owner, repo, joinAppPath(appPath, "package.json"), refQ, h);
  if (!packageJson.trim() && appPath) {
    packageJson = await fetchRepoFile(owner, repo, "package.json", refQ, h);
  }
  if (!packageJson.trim()) {
    const pkgRes = await fetch(
      `${GH}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json${refQ}`,
      { headers: h }
    );
    if (pkgRes.ok) {
      const pj = await pkgRes.json();
      packageJson = decodeContent(pj);
    }
  }
  packageJson = packageJson.slice(0, MAX_PKG);

  const expoPaths = orderedExpoPaths(appPath);
  const expoTexts = await Promise.all(expoPaths.map((path) => fetchRepoFile(owner, repo, path, refQ, h)));
  const expoMap = Object.fromEntries(expoPaths.map((k, i) => [k, expoTexts[i]]));
  let expoConfig = "";
  for (const path of expoPaths) {
    const t = expoMap[path]?.trim();
    if (t) {
      expoConfig = t.slice(0, MAX_EXPO);
      break;
    }
  }

  let tsconfigJson = await fetchRepoFile(owner, repo, joinAppPath(appPath, "tsconfig.json"), refQ, h);
  if (!tsconfigJson.trim() && appPath) {
    tsconfigJson = await fetchRepoFile(owner, repo, "tsconfig.json", refQ, h);
  }
  tsconfigJson = tsconfigJson.slice(0, MAX_TS);

  let easJson = await fetchRepoFile(owner, repo, joinAppPath(appPath, "eas.json"), refQ, h);
  if (!easJson.trim() && appPath) {
    easJson = await fetchRepoFile(owner, repo, "eas.json", refQ, h);
  }
  easJson = easJson.slice(0, MAX_EAS);

  const [babelHit, metroHit] = await Promise.all([
    fetchFirstExistingFile(owner, repo, appPath, refQ, h, BABEL_CANDIDATES),
    fetchFirstExistingFile(owner, repo, appPath, refQ, h, METRO_CANDIDATES),
  ]);

  return {
    ok: true,
    fullName,
    description,
    topics,
    readme: readme.slice(0, MAX_README),
    packageJson,
    babelConfigPath: babelHit.path,
    babelConfig: babelHit.content ? babelHit.content.slice(0, MAX_BABEL) : "",
    metroConfigPath: metroHit.path,
    metroConfig: metroHit.content ? metroHit.content.slice(0, MAX_METRO) : "",
    expoConfig,
    tsconfigJson,
    easJson,
    appPath: appPath || "",
    defaultBranch,
  };
}

/**
 * @param {object | null | undefined} ctx
 */
export function githubContextToPromptAugment(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const fullName = typeof ctx.fullName === "string" ? ctx.fullName.trim() : "";
  const readme = typeof ctx.readme === "string" ? ctx.readme.slice(0, MAX_README) : "";
  const packageJsonRaw = typeof ctx.packageJson === "string" ? ctx.packageJson.slice(0, MAX_PKG) : "";
  const pkgSummary = summarizePackageJson(packageJsonRaw);
  const packageJsonForPrompt = pkgSummary
    ? packageJsonRaw.slice(0, 4_200)
    : packageJsonRaw;
  const babelConfig =
    typeof ctx.babelConfig === "string" ? ctx.babelConfig.slice(0, MAX_BABEL) : "";
  const babelConfigPath = typeof ctx.babelConfigPath === "string" ? ctx.babelConfigPath.trim() : "";
  const metroConfig =
    typeof ctx.metroConfig === "string" ? ctx.metroConfig.slice(0, MAX_METRO) : "";
  const metroConfigPath = typeof ctx.metroConfigPath === "string" ? ctx.metroConfigPath.trim() : "";
  const expoConfig = typeof ctx.expoConfig === "string" ? ctx.expoConfig.slice(0, MAX_EXPO) : "";
  const tsconfigJson = typeof ctx.tsconfigJson === "string" ? ctx.tsconfigJson.slice(0, MAX_TS) : "";
  const easJson = typeof ctx.easJson === "string" ? ctx.easJson.slice(0, MAX_EAS) : "";
  const appPath = typeof ctx.appPath === "string" ? ctx.appPath.trim() : "";
  const description = typeof ctx.description === "string" ? ctx.description.slice(0, 500) : "";
  const topics = Array.isArray(ctx.topics) ? ctx.topics.slice(0, 14).join(", ") : "";
  if (
    !fullName &&
    !readme &&
    !packageJsonRaw &&
    !expoConfig &&
    !tsconfigJson &&
    !easJson &&
    !babelConfig &&
    !metroConfig
  ) {
    return "";
  }

  const parts = [];
  if (fullName) parts.push(`Repo: ${fullName}${appPath ? ` (monorepo path: ${appPath})` : ""}`);
  if (description) parts.push(`About: ${description}`);
  if (topics) parts.push(`Topics: ${topics}`);
  if (readme) parts.push(`README (truncated):\n${readme}`);
  if (pkgSummary) parts.push(`package.json dependency summary (derived):\n${pkgSummary}`);
  if (packageJsonForPrompt) parts.push(`package.json (raw, truncated):\n${packageJsonForPrompt}`);
  if (expoConfig) parts.push(`Expo app.json / app.config.* (truncated):\n${expoConfig}`);
  if (babelConfig) {
    parts.push(
      `Babel config (${babelConfigPath || "babel.config.*"}):\n${babelConfig}`
    );
  }
  if (metroConfig) {
    parts.push(
      `Metro config (${metroConfigPath || "metro.config.*"}):\n${metroConfig}`
    );
  }
  if (tsconfigJson) parts.push(`tsconfig.json (truncated):\n${tsconfigJson}`);
  if (easJson) parts.push(`eas.json (truncated):\n${easJson}`);
  const core = parts.join("\n\n");
  return core
    ? `${core}\n\n(Use as reference only. REACTIVE codegen uses its stock Expo template — align naming/deps where compatible; never invent packages outside template.)`
    : "";
}
