import { WEB_API_BASE } from "../apiBase";
import {
  inferProviderFromKey,
  LLM_PROVIDERS,
  type StudioLlmSettings,
} from "../studioLlm";
import type { ProjectBuildApiHealth } from "./useProjectBuildConnection";

type Props = {
  apiHealth: ProjectBuildApiHealth | null;
  hasByokKey: boolean;
  llmSettings: StudioLlmSettings;
  onChangeLlm: (next: StudioLlmSettings | ((prev: StudioLlmSettings) => StudioLlmSettings)) => void;
  onOpenStudio: () => void;
};

export default function BuilderByokCard({
  apiHealth,
  hasByokKey,
  llmSettings,
  onChangeLlm,
  onOpenStudio,
}: Props) {
  return (
    <section className="builder-card builder-card--byok" aria-labelledby="qb-byok">
      <h2 id="qb-byok" className="builder-card__title">
        API connection (required)
      </h2>
      <p className="builder-byok-lead">
        Target: <code className="inline-code">{apiHealth?.base ?? "…"}</code>
        {WEB_API_BASE ? "" : " — same-origin `/api` (Vite proxies to port 8788 in dev)."}
      </p>
      {apiHealth && !apiHealth.reachable && !hasByokKey && (
        <div className="error-banner builder-flow__err" role="alert">
          Could not reach <code className="inline-code">/api/health</code> — the API may still work if{" "}
          <code className="inline-code">npm run dev:platform</code> is running with server keys. Try Get questions / Generate; if
          they fail, fix <code className="inline-code">VITE_API_BASE</code> or paste a key below.
        </div>
      )}
      {apiHealth && !apiHealth.reachable && hasByokKey && (
        <div
          className="error-banner builder-flow__err"
          style={{ borderColor: "rgba(251, 191, 36, 0.45)", color: "#fcd34d" }}
          role="status"
        >
          Health check failed — you can still try Generate. If it fails, ensure the API is running and{" "}
          <code className="inline-code">/api</code> is proxied (dev) or set <code className="inline-code">VITE_API_BASE</code>.
        </div>
      )}
      {apiHealth?.reachable && !apiHealth.serverHasLlmKey && !hasByokKey && (
        <div
          className="error-banner builder-flow__err"
          style={{ borderColor: "rgba(234, 179, 8, 0.45)", color: "#fcd34d" }}
          role="status"
        >
          No key on the server — paste your model API key below (same storage as Studio BYOK).
        </div>
      )}
      <div className="builder-byok-grid">
        <label className="builder-byok-field">
          <span>Provider</span>
          <select
            value={llmSettings.provider}
            onChange={(e) =>
              onChangeLlm((s) => ({
                ...s,
                provider: e.target.value as StudioLlmSettings["provider"],
              }))
            }
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="builder-byok-field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            value={llmSettings.apiKey}
            onChange={(e) => onChangeLlm((s) => ({ ...s, apiKey: e.target.value }))}
            onBlur={(e) => {
              const k = e.target.value.trim();
              const p = inferProviderFromKey(k);
              if (p) onChangeLlm((s) => ({ ...s, provider: p }));
            }}
            placeholder="sk-… · sk-ant-… · AIza… · gsk_… · nvapi-…"
          />
        </label>
        <label className="builder-byok-field builder-byok-field--span">
          <span>Model (optional)</span>
          <input
            type="text"
            value={llmSettings.model}
            onChange={(e) => onChangeLlm((s) => ({ ...s, model: e.target.value }))}
            placeholder="Blank = provider default"
          />
        </label>
        <label className="builder-byok-check">
          <input
            type="checkbox"
            checked={llmSettings.rememberOnDevice}
            onChange={(e) => onChangeLlm((s) => ({ ...s, rememberOnDevice: e.target.checked }))}
          />
          Remember on this device
        </label>
      </div>
      <p className="builder-byok-foot">
        Or set keys in{" "}
        <button type="button" className="btn-inline" onClick={onOpenStudio}>
          Studio → BYOK
        </button>{" "}
        (shared with this page).
      </p>
    </section>
  );
}
