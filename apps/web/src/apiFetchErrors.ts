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
      const j = (await clone.json()) as { error?: string; hint?: string; message?: string };
      const errStr =
        typeof j.error === "string" && j.error.trim()
          ? j.error.trim()
          : typeof j.message === "string" && j.message.trim()
            ? j.message.trim()
            : "";
      if (errStr) {
        detail = j.hint ? `${errStr} — ${j.hint}` : errStr;
      }
    } else {
      const t = (await clone.text()).trim();
      if (t && t.length < 800) detail = t;
    }
  } catch {
    /* keep statusText */
  }

  if (status === 404) {
    return `${detail} (${methodPath} → HTTP 404). This usually means the request did not hit the REACTIVE API (wrong process on the proxy port, or an old build). Fix: run \`npm run dev:platform\` from this repo — API defaults to port **8788** (Vite proxies /api there). Or set \`VITE_API_BASE\` to your API origin, and \`API_PROXY_TARGET\` if the API is not on 8788.`;
  }

  if (status >= 400) {
    return `${detail} (${methodPath} → HTTP ${status})`;
  }

  return detail;
}
