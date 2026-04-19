/** Empty string = same origin (Vite dev proxies `/api` to the API). Set `VITE_API_BASE` for split deploys. */
export const WEB_API_BASE = import.meta.env.VITE_API_BASE ?? "";
