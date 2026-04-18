/**
 * Turn failed fetch Response bodies into readable messages (JSON .error, short text, or status).
 */

export async function getErrorMessageFromResponse(r: Response, methodPath: string): Promise<string> {
  const status = r.status;
  const base = r.statusText || "Error";
  const clone = r.clone();
  let detail = base;

  try {
    const ct = clone.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = (await clone.json()) as { error?: string; hint?: string };
      if (typeof j.error === "string" && j.error.trim()) {
        detail = j.hint ? `${j.error} — ${j.hint}` : j.error;
      }
    } else {
      const t = (await clone.text()).trim();
      if (t && t.length < 800) detail = t;
    }
  } catch {
    /* keep statusText */
  }

  if (status === 404) {
    return `${detail} (${methodPath} → HTTP 404). This usually means the request did not hit the REACTIVE API, or the API is an older build without that route. Fix: run \`npm run dev:platform\` from the repo (API on port 8787 with Vite proxy), or set \`VITE_API_BASE\` to that API’s origin.`;
  }

  if (status >= 400) {
    return `${detail} (${methodPath} → HTTP ${status})`;
  }

  return detail;
}
