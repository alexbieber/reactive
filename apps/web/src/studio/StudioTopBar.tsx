import type { Dispatch, SetStateAction } from "react";
import AgentPortrait from "../AgentPortrait";
import { STUDIO_AGENTS } from "../studioAgents";
import { LLM_PROVIDERS, type StudioLlmSettings } from "../studioLlm";

type StudioTopBarProps = {
  llmSettings: StudioLlmSettings;
  setLlmSettings: Dispatch<SetStateAction<StudioLlmSettings>>;
  apiCaps: {
    chat: boolean;
    chatStream?: boolean;
    service?: string;
    version?: string;
    openaiModel?: string;
    nvidiaModel?: string;
    serverOpenAiKey?: boolean;
    serverNvidiaKey?: boolean;
  } | null;
  specPillOk: boolean;
  specPillTitle: string;
  specCheckOk: boolean;
  specValidationError: string | null;
  onOpenPreview: () => void;
  onOpenProjectBuild?: () => void;
  onOpenTeamRoom?: () => void;
  sessionLlmTotal: number;
  sessionLlmTurns: number;
  onShare: () => void;
  chatLoading: boolean;
  messages: { role: string }[];
  onRegenerateLast: () => void;
  onClearChat: () => void;
  onEraseLocalHistory: () => void;
};

export function StudioTopBar({
  llmSettings,
  setLlmSettings,
  apiCaps,
  specPillOk,
  specPillTitle,
  specCheckOk,
  specValidationError,
  onOpenPreview,
  onOpenProjectBuild,
  onOpenTeamRoom,
  sessionLlmTotal,
  sessionLlmTurns,
  onShare,
  chatLoading,
  messages,
  onRegenerateLast,
  onClearChat,
  onEraseLocalHistory,
}: StudioTopBarProps) {
  return (
    <header className="studio-mv2-topbar">
      <div className="studio-mv2-topbar-left">
        <label className="studio-mv2-sr-only" htmlFor="studio-llm-provider">
          LLM provider
        </label>
        <select
          id="studio-llm-provider"
          className="studio-mv2-model-select"
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
      </div>
      <div className="studio-mv2-topbar-right">
        <span
          className={`studio-mv2-status-dot ${apiCaps == null ? "" : apiCaps.chat ? "studio-mv2-status-dot--ok" : "studio-mv2-status-dot--bad"}`}
          title={apiCaps == null ? "API status" : apiCaps.chat ? "API ready" : "API unavailable"}
        />
        <span
          className={`studio-mv2-spec-pill ${specPillOk ? "studio-mv2-spec-pill--ok" : "studio-mv2-spec-pill--warn"}`}
          title={specPillTitle}
        >
          Spec {!specCheckOk ? "fix" : specValidationError ? "JSON" : "ok"}
        </span>
        <button type="button" className="studio-mv2-bell" title="Notifications" aria-label="Notifications" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </button>
        <button
          type="button"
          className="studio-mv2-preview-cta"
          onClick={onOpenPreview}
          disabled={!specCheckOk}
          title="Open Expo web preview"
        >
          Preview
        </button>
        <a
          href="/?project=1"
          className="studio-mv2-topbar-link"
          title="Open Monaco editor + full Expo file tree (RN/TS lives there, not in chat)"
          onClick={(e) => {
            if (onOpenProjectBuild) {
              e.preventDefault();
              onOpenProjectBuild();
            }
          }}
        >
          Project build
        </a>
        <a
          href="/?teamroom=1"
          className="studio-mv2-topbar-link"
          title="Team Space — host a room; teammates talk to each other (and without you)"
          onClick={(e) => {
            if (onOpenTeamRoom) {
              e.preventDefault();
              onOpenTeamRoom();
            }
          }}
        >
          Team Space
        </a>
        {apiCaps?.chat && sessionLlmTurns > 0 && (
          <span className="studio-mv2-tok-pill" title="Session tokens (estimate)">
            <span className="studio-mv2-tok-spark" aria-hidden>
              ✦
            </span>
            {sessionLlmTotal.toLocaleString()}
          </span>
        )}
        <button type="button" className="studio-mv2-icon-txt" onClick={onShare} title="Copy page link">
          Share
        </button>
        <span className="studio-mv2-avatar" title="REACTIVE Studio" aria-hidden>
          R
        </span>
        <details className="studio-mv2-menu">
          <summary className="studio-mv2-menu-sum" aria-label="More">
            ···
          </summary>
          <div className="studio-mv2-menu-body">
            <button
              type="button"
              disabled={chatLoading || messages[messages.length - 1]?.role !== "assistant"}
              onClick={onRegenerateLast}
            >
              Regenerate last
            </button>
            <button type="button" onClick={onClearChat}>
              Reset chat
            </button>
            <button type="button" onClick={onEraseLocalHistory} title="Removes locally saved transcript and spec snapshot">
              Clear saved history (this device)
            </button>
            <p className="studio-mv2-menu-pipeline-title">Your team</p>
            <ul className="studio-mv2-menu-pipeline">
              {STUDIO_AGENTS.map((a) => (
                <li key={a.id} className="studio-mv2-menu-team-item">
                  <AgentPortrait agent={a} variant="studio-menu" />
                  <div className="studio-mv2-menu-team-copy">
                    <strong className="studio-mv2-menu-team-name">
                      {a.fullName}
                      <span className="studio-mv2-menu-team-title"> — {a.title}</span>
                    </strong>
                    <span className="studio-mv2-menu-team-blurb">{a.blurb}</span>
                    <span className="studio-mv2-menu-team-personality">{a.personality}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </header>
  );
}
