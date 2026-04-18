/**
 * Turn a possibly-relative preview path into an absolute URL for QR / sharing.
 * Optional `VITE_PUBLIC_PREVIEW_ORIGIN` (e.g. https://app.example.com) when the browser
 * origin differs from where the API/proxy is reachable for mobile (production).
 */
export function previewAbsoluteUrl(previewPath: string): string {
  if (/^https?:\/\//i.test(previewPath)) return previewPath;
  const origin = import.meta.env.VITE_PUBLIC_PREVIEW_ORIGIN as string | undefined;
  if (origin && /^https?:\/\//i.test(origin)) {
    const base = origin.replace(/\/$/, "");
    return new URL(previewPath, `${base}/`).href;
  }
  if (typeof window === "undefined") return previewPath;
  return new URL(previewPath, window.location.origin).href;
}

export function isLocalhostHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
