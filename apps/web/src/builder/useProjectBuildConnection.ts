import { useEffect, useState } from "react";
import { WEB_API_BASE } from "../apiBase";
import { sanitizeLlmApiKey, type StudioLlmSettings } from "../studioLlm";

export type ProjectBuildApiHealth = {
  reachable: boolean;
  serverHasLlmKey: boolean;
  base: string;
};

/**
 * Fetches /api/health once and derives whether clarify/generate can run.
 * If health fails, we still allow tries (server may have env keys the browser cannot see).
 */
export function useProjectBuildConnection(llmSettings: StudioLlmSettings) {
  const [apiHealth, setApiHealth] = useState<ProjectBuildApiHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = WEB_API_BASE || "(same origin as this page)";
    (async () => {
      try {
        const r = await fetch(`${WEB_API_BASE}/api/health`);
        const j = (await r.json()) as { capabilities?: { serverOpenAiKey?: boolean; serverNvidiaKey?: boolean } };
        if (!cancelled) {
          setApiHealth({
            reachable: r.ok,
            serverHasLlmKey: Boolean(j.capabilities?.serverOpenAiKey || j.capabilities?.serverNvidiaKey),
            base,
          });
        }
      } catch {
        if (!cancelled) {
          setApiHealth({ reachable: false, serverHasLlmKey: false, base });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasByokKey = Boolean(sanitizeLlmApiKey(llmSettings.apiKey));
  const llmReady =
    apiHealth == null ||
    !apiHealth.reachable ||
    (apiHealth.serverHasLlmKey || hasByokKey);

  return { apiHealth, hasByokKey, llmReady };
}
