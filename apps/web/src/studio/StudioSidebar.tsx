import type { Dispatch, RefObject, SetStateAction, SyntheticEvent } from "react";
import BrandLogo from "../BrandLogo";
import { GITHUB_CONTEXT_PRESETS } from "../studioGithubPresets";
import { inferProviderFromKey, LLM_PROVIDERS, type StudioLlmSettings } from "../studioLlm";
import type { VoiceEngineId } from "../voiceEnginePrefs";
import type { AppSpec } from "../types";
import type { ChatTokenUsage, GithubContextPayload } from "./studioTypes";

type StudioSidebarProps = {
  onBack: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  onNewTask: () => void;
  onOpenProjectBuild?: () => void;
  openDetailsId: (id: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  specCheckOk: boolean;
  onOpenPreview: () => void;
  onSidebarDetailsToggle: (ev: SyntheticEvent<HTMLDetailsElement>) => void;
  llmSettings: StudioLlmSettings;
  setLlmSettings: Dispatch<SetStateAction<StudioLlmSettings>>;
  voiceEngine: VoiceEngineId;
  setVoiceEngine: Dispatch<SetStateAction<VoiceEngineId>>;
  openaiVoiceKeyOnly: string;
  setOpenaiVoiceKeyOnly: Dispatch<SetStateAction<string>>;
  githubRepoInput: string;
  setGithubRepoInput: Dispatch<SetStateAction<string>>;
  githubRefInput: string;
  setGithubRefInput: Dispatch<SetStateAction<string>>;
  githubAppPathInput: string;
  setGithubAppPathInput: Dispatch<SetStateAction<string>>;
  githubLoading: boolean;
  githubErr: string | null;
  githubCtx: GithubContextPayload | null;
  setGithubCtx: Dispatch<SetStateAction<GithubContextPayload | null>>;
  setGithubErr: Dispatch<SetStateAction<string | null>>;
  loadGithubContext: (opts?: { repo?: string; ref?: string; appPath?: string }) => void;
  setToast: (msg: string | null) => void;
  specJsonExpanded: boolean;
  setSpecJsonExpanded: Dispatch<SetStateAction<boolean>>;
  specCanonical: AppSpec;
  apiCaps: { chat?: boolean } | null;
  lastChatUsage: ChatTokenUsage | null;
  sessionLlm: { prompt: number; completion: number; total: number; turns: number };
  sessionPreview: { specTokens: number; builds: number };
};

export function StudioSidebar({
  onBack,
  sidebarCollapsed,
  setSidebarCollapsed,
  onNewTask,
  onOpenProjectBuild,
  openDetailsId,
  inputRef,
  specCheckOk,
  onOpenPreview,
  onSidebarDetailsToggle,
  llmSettings,
  setLlmSettings,
  voiceEngine,
  setVoiceEngine,
  openaiVoiceKeyOnly,
  setOpenaiVoiceKeyOnly,
  githubRepoInput,
  setGithubRepoInput,
  githubRefInput,
  setGithubRefInput,
  githubAppPathInput,
  setGithubAppPathInput,
  githubLoading,
  githubErr,
  githubCtx,
  setGithubCtx,
  setGithubErr,
  loadGithubContext,
  setToast,
  specJsonExpanded,
  setSpecJsonExpanded,
  specCanonical,
  apiCaps,
  lastChatUsage,
  sessionLlm,
  sessionPreview,
}: StudioSidebarProps) {
  return (
    <aside
      className={`studio-mv2-sidebar ${sidebarCollapsed ? "studio-mv2-sidebar--collapsed" : ""}`}
      aria-label="Workspace"
    >
      <div className="studio-mv2-sidebar-head">
        <BrandLogo variant="studio" />
        {!sidebarCollapsed && <span className="studio-mv2-sidebar-brand">REACTIVE</span>}
        <button
          type="button"
          className="studio-mv2-sidebar-collapse"
          onClick={() => setSidebarCollapsed((c) => !c)}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
        >
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {sidebarCollapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
      </div>

      <nav className="studio-mv2-nav" aria-label="Primary">
        <button type="button" className="studio-mv2-nav-item" onClick={onNewTask}>
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {!sidebarCollapsed && <span>New task</span>}
        </button>
        <div className="studio-mv2-nav-item studio-mv2-nav-item--static studio-mv2-nav-item--active" aria-current="page">
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          {!sidebarCollapsed && (
            <span>
              Copilot <span className="studio-mv2-badge">Live</span>
            </span>
          )}
        </div>
        <a
          href="/?project=1"
          className="studio-mv2-nav-item studio-mv2-nav-link studio-mv2-nav-link--editor"
          title="React Native / TypeScript source: Monaco editor, file tree, ZIP. Not available in Copilot chat."
          onClick={(e) => {
            if (onOpenProjectBuild) {
              e.preventDefault();
              onOpenProjectBuild();
            }
          }}
        >
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
          </svg>
          {!sidebarCollapsed && (
            <span className="studio-mv2-nav-label-col">
              <span className="studio-mv2-nav-label-main">Project build</span>
              <span className="studio-mv2-nav-label-sub">Monaco, files, ZIP</span>
            </span>
          )}
        </a>
        <button type="button" className="studio-mv2-nav-item" onClick={() => inputRef.current?.focus()}>
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          {!sidebarCollapsed && <span>Search</span>}
        </button>
        <button type="button" className="studio-mv2-nav-item" onClick={() => openDetailsId("studio-spec-json")}>
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          {!sidebarCollapsed && <span>App Spec</span>}
        </button>
      </nav>

      <div className="studio-mv2-sidebar-section">
        {!sidebarCollapsed && <div className="studio-mv2-sidebar-section-title">Session</div>}
        <button type="button" className="studio-mv2-task-pill" onClick={onOpenPreview} disabled={!specCheckOk}>
          {!sidebarCollapsed && (
            <>
              <span className="studio-mv2-task-pill-dot" aria-hidden />
              Expo preview
            </>
          )}
          {sidebarCollapsed && <span title="Expo preview">◉</span>}
        </button>
      </div>

      <div className="studio-mv2-sidebar-scroll">
        <details id="studio-byok" className="studio-byok studio-mv2-side-details" onToggle={onSidebarDetailsToggle}>
          <summary>Bring your own API key (OpenAI, Claude, Gemini, Groq, Mistral, NVIDIA NIM)</summary>
          <div className="studio-byok-body">
            <p className="studio-byok-lead">
              Stored in this browser (session by default). Requests go to <strong>your</strong> provider through this app’s
              API — not to us for training. The <strong>provider</strong> matches your key automatically (e.g.{" "}
              <code className="inline-code">sk-…</code> → OpenAI, <code className="inline-code">nvapi-…</code> → NVIDIA).
            </p>
            <div className="studio-byok-grid">
              <label className="studio-byok-field">
                <span>Provider</span>
                <select
                  value={llmSettings.provider}
                  onChange={(e) =>
                    setLlmSettings((s) => ({
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
              <label className="studio-byok-field">
                <span>API key</span>
                <input
                  type="password"
                  name="studio-llm-key"
                  autoComplete="off"
                  value={llmSettings.apiKey}
                  onChange={(e) => setLlmSettings((s) => ({ ...s, apiKey: e.target.value }))}
                  onBlur={(e) => {
                    const k = e.target.value.trim();
                    const p = inferProviderFromKey(k);
                    if (p) setLlmSettings((s) => ({ ...s, provider: p }));
                  }}
                  placeholder="sk-… · sk-ant-… · AIza… · gsk_… · nvapi-…"
                />
              </label>
              <label className="studio-byok-field studio-byok-span2">
                <span>Model override (optional)</span>
                <input
                  type="text"
                  value={llmSettings.model}
                  onChange={(e) => setLlmSettings((s) => ({ ...s, model: e.target.value }))}
                  placeholder="Blank = provider default (e.g. gpt-4o-mini, google/gemma-2-9b-it on NVIDIA, llama-3.3-70b on Groq)"
                />
              </label>
              <label className="studio-byok-check studio-byok-span2">
                <input
                  type="checkbox"
                  checked={llmSettings.rememberOnDevice}
                  onChange={(e) => setLlmSettings((s) => ({ ...s, rememberOnDevice: e.target.checked }))}
                />
                Remember key on this device (localStorage — only if you trust this machine)
              </label>
            </div>
            <p className="studio-byok-hint">
              <strong>Tip:</strong> paste a bare key into the composer once — we’ll detect the provider and save it here.{" "}
              {LLM_PROVIDERS.find((x) => x.id === llmSettings.provider)?.hint}
            </p>
            <div className="studio-byok-voice">
              <label className="studio-byok-field studio-byok-span2">
                <span>Listen — voice engine</span>
                <select
                  value={voiceEngine}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVoiceEngine(v === "openai" ? "openai" : v === "kokoro" ? "kokoro" : "browser");
                  }}
                >
                  <option value="browser">Browser (free, device voices)</option>
                  <option value="kokoro">Kokoro (on-device — no voice API key)</option>
                  <option value="openai">OpenAI neural (MP3 — TTS pricing)</option>
                </select>
              </label>
              {voiceEngine === "openai" && (
                <label className="studio-byok-field studio-byok-span2">
                  <span>OpenAI key for voice only (if chat uses another provider)</span>
                  <input
                    type="password"
                    name="studio-openai-tts-key"
                    autoComplete="off"
                    value={openaiVoiceKeyOnly}
                    onChange={(e) => setOpenaiVoiceKeyOnly(e.target.value)}
                    placeholder="sk-… (optional — same as chat key when Provider is OpenAI)"
                  />
                </label>
              )}
              {voiceEngine === "kokoro" && (
                <p className="studio-byok-hint studio-byok-hint--tight">
                  Kokoro downloads a large model on first play. Chrome or Edge recommended.
                </p>
              )}
            </div>
          </div>
        </details>

        <details id="studio-github" className="studio-github studio-mv2-side-details" onToggle={onSidebarDetailsToggle}>
          <summary>Optional: GitHub stack context (feeds the copilot only)</summary>
          <div className="studio-github-body">
            <p className="studio-github-lead">
              Loads public repo metadata into the <strong>same chat</strong> as extra context — not into your ZIP. Fetches
              README, <strong>package.json</strong>, Expo config, <strong>tsconfig</strong>, <strong>eas.json</strong>, first{" "}
              <strong>babel</strong>/<strong>metro</strong> config found. Use <em>App path</em> for monorepos.{" "}
              <code className="inline-code">GITHUB_TOKEN</code> on the API avoids rate limits (
              <a href="https://docs.github.com/en/rest" target="_blank" rel="noreferrer noopener">
                REST API
              </a>
              ).
            </p>
            <div className="studio-github-presets" aria-label="Curated GitHub presets">
              {GITHUB_CONTEXT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="studio-github-preset-chip"
                  disabled={githubLoading}
                  title={p.hint}
                  onClick={() => void loadGithubContext({ repo: p.repo, ref: p.ref ?? "", appPath: p.appPath ?? "" })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="studio-github-row">
              <label className="studio-github-field">
                <span>Repository</span>
                <input
                  type="text"
                  value={githubRepoInput}
                  onChange={(e) => setGithubRepoInput(e.target.value)}
                  placeholder="expo/expo or https://github.com/expo/expo"
                  disabled={githubLoading}
                />
              </label>
              <label className="studio-github-field studio-github-ref">
                <span>Ref (optional)</span>
                <input
                  type="text"
                  value={githubRefInput}
                  onChange={(e) => setGithubRefInput(e.target.value)}
                  placeholder="main, tag, or SHA"
                  disabled={githubLoading}
                />
              </label>
              <label className="studio-github-field studio-github-span2">
                <span>App path (monorepo)</span>
                <input
                  type="text"
                  value={githubAppPathInput}
                  onChange={(e) => setGithubAppPathInput(e.target.value)}
                  placeholder="e.g. packages/mobile — README + package.json under this path"
                  disabled={githubLoading}
                />
              </label>
              <div className="studio-github-actions">
                <button type="button" className="btn primary" disabled={githubLoading} onClick={() => void loadGithubContext({})}>
                  {githubLoading ? "Loading…" : "Load context"}
                </button>
                <button
                  type="button"
                  className="btn ghost studio-btn-small"
                  disabled={!githubCtx}
                  onClick={() => {
                    setGithubCtx(null);
                    setGithubErr(null);
                    setGithubAppPathInput("");
                    setToast("GitHub context cleared.");
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            {githubErr && <p className="studio-github-err">{githubErr}</p>}
            {githubCtx && (
              <p className="studio-github-loaded">
                <strong>Loaded:</strong> <code>{githubCtx.fullName}</code>
                {githubCtx.appPath ? <span className="studio-github-meta"> · path: {githubCtx.appPath}</span> : null}
                {githubCtx.expoConfig ? <span className="studio-github-meta"> · Expo config</span> : null}
                {githubCtx.tsconfigJson ? <span className="studio-github-meta"> · tsconfig</span> : null}
                {githubCtx.easJson ? <span className="studio-github-meta"> · EAS</span> : null}
                {githubCtx.babelConfig ? <span className="studio-github-meta"> · Babel</span> : null}
                {githubCtx.metroConfig ? <span className="studio-github-meta"> · Metro</span> : null}
                {githubCtx.description
                  ? ` — ${githubCtx.description.slice(0, 160)}${githubCtx.description.length > 160 ? "…" : ""}`
                  : ""}
                {githubCtx.topics && githubCtx.topics.length > 0 ? (
                  <span className="studio-github-topics">{githubCtx.topics.slice(0, 8).join(" · ")}</span>
                ) : null}
              </p>
            )}
          </div>
        </details>

        <section
          id="studio-spec-json"
          className="studio-mv2-spec-json-panel studio-spec-details studio-mv2-side-details"
        >
          <button
            type="button"
            className="studio-mv2-spec-json-trigger"
            aria-expanded={specJsonExpanded}
            id="studio-spec-json-trigger"
            onClick={() => {
              setSpecJsonExpanded((was) => {
                const next = !was;
                if (next) {
                  requestAnimationFrame(() => {
                    document.getElementById("studio-spec-json")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  });
                }
                return next;
              });
            }}
          >
            App Spec JSON — single source of truth for codegen &amp; preview
          </button>
          {specJsonExpanded && (
            <div id="studio-spec-json-body" className="studio-spec-json-body">
              <pre className="json-preview studio-spec-pre">{JSON.stringify(specCanonical, null, 2)}</pre>
            </div>
          )}
        </section>

        {apiCaps?.chat && (
          <details className="studio-mv2-side-details studio-mv2-token-details" onToggle={onSidebarDetailsToggle}>
            <summary>Token usage</summary>
            <div className="studio-token-meter studio-token-meter--compact-mv2">
              {lastChatUsage && (
                <p className="studio-mv2-token-line">
                  Last reply · {lastChatUsage.model}: {lastChatUsage.promptTokens.toLocaleString()} in /{" "}
                  {lastChatUsage.completionTokens.toLocaleString()} out
                </p>
              )}
              <p className="studio-mv2-token-line">
                Session: {sessionLlm.turns} turns · {sessionLlm.total.toLocaleString()} total · preview builds{" "}
                {sessionPreview.builds} (~{sessionPreview.specTokens.toLocaleString()} spec tok)
              </p>
            </div>
          </details>
        )}
      </div>

      <div className="studio-mv2-sidebar-foot">
        <button type="button" className="studio-mv2-foot-home" onClick={onBack} title="Home">
          <svg className="studio-mv2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          {!sidebarCollapsed && <span>Home</span>}
        </button>
      </div>
    </aside>
  );
}
