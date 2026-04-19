import type { RefObject } from "react";
import { isBrowserTtsAvailable } from "../studioTts";
import type { VoiceEngineId } from "../voiceEnginePrefs";
import { StudioAssistantContent } from "./StudioAssistantContent";
import type { StudioMsg } from "./studioTypes";
import { stripStudioHandwrittenCodeFences } from "./studioStripCode";

type StudioMainStageProps = {
  error: string | null;
  specValidationError: string | null;
  toast: string | null;
  listRef: RefObject<HTMLDivElement | null>;
  onFeedScroll: () => void;
  userTurnCount: number;
  messages: StudioMsg[];
  chatLoading: boolean;
  thinking: boolean;
  feedEndRef: RefObject<HTMLDivElement | null>;
  voiceEngine: VoiceEngineId;
  ttsPlayingIndex: number | null;
  onToggleListen: (messageIndex: number, text: string) => void;
  onOpenProjectBuild?: () => void;
  pendingSpec: boolean;
  onApplyPending: () => void;
  onApplyAndPreview: () => void;
  input: string;
  setInput: (v: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSendChat: () => void;
};

export function StudioMainStage({
  error,
  specValidationError,
  toast,
  listRef,
  onFeedScroll,
  userTurnCount,
  messages,
  chatLoading,
  thinking,
  feedEndRef,
  voiceEngine,
  ttsPlayingIndex,
  onToggleListen,
  onOpenProjectBuild,
  pendingSpec,
  onApplyPending,
  onApplyAndPreview,
  input,
  setInput,
  inputRef,
  onSendChat,
}: StudioMainStageProps) {
  return (
    <div className="studio-mv2-stage">
      {error && <div className="error-banner studio-mv2-banner">{error}</div>}
      {specValidationError && (
        <div
          className="error-banner studio-mv2-banner"
          style={{ borderColor: "rgba(234, 179, 8, 0.45)", color: "#fcd34d" }}
        >
          Schema: {specValidationError}
        </div>
      )}
      {toast && <div className="studio-toast studio-mv2-toast">{toast}</div>}

      <div
        className={`studio-mv2-feed ${userTurnCount === 0 ? "studio-mv2-feed--welcome" : ""}`}
        ref={listRef}
        onScroll={onFeedScroll}
      >
        {userTurnCount === 0 && (
          <div className="studio-mv2-empty">
            <div className="studio-mv2-plan-row">
              <span className="studio-mv2-plan-pill">REACTIVE Studio</span>
              <span className="studio-mv2-plan-sep" aria-hidden>
                |
              </span>
              <a href="#studio-byok" className="studio-mv2-plan-link">
                API key
              </a>
            </div>
            <h1 className="studio-mv2-empty-title">What can I do for you?</h1>
            <p className="studio-mv2-empty-sub">
              Here we only ship <strong>App Spec JSON</strong> and preview the template — <strong>no handwritten RN code</strong> in
              chat. To write or edit TypeScript/React Native source, open{" "}
              <a
                href="/?project=1"
                onClick={(e) => {
                  if (onOpenProjectBuild) {
                    e.preventDefault();
                    onOpenProjectBuild();
                  }
                }}
              >
                Project build
              </a>{" "}
              (Monaco + full file tree + ZIP). Otherwise: describe the app, <strong>Apply</strong>, <strong>Preview</strong>.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`studio-mv2-turn studio-mv2-turn--${m.role}`}>
            {m.role === "assistant" ? (
              <div className="studio-mv2-assistant">
                <div className="studio-mv2-assistant-head">
                  <div className="studio-mv2-assistant-brand">REACTIVE Copilot</div>
                  {(voiceEngine === "openai" || voiceEngine === "kokoro" || isBrowserTtsAvailable()) && (
                    <button
                      type="button"
                      className="studio-mv2-listen"
                      aria-label={
                        ttsPlayingIndex === i
                          ? "Stop listening"
                          : voiceEngine === "openai"
                            ? "Listen (OpenAI neural)"
                            : voiceEngine === "kokoro"
                              ? "Listen (Kokoro on-device)"
                              : "Listen (browser voices)"
                      }
                      disabled={Boolean(chatLoading && i === messages.length - 1)}
                      title={
                        voiceEngine === "openai"
                          ? "Neural TTS via your OpenAI key"
                          : voiceEngine === "kokoro"
                            ? "Kokoro runs locally — no separate voice API key"
                            : "Uses your browser’s built-in text-to-speech (device-local)"
                      }
                      onClick={() => onToggleListen(i, stripStudioHandwrittenCodeFences(m.content || ""))}
                    >
                      {ttsPlayingIndex === i ? "Stop" : "Listen"}
                    </button>
                  )}
                </div>
                <StudioAssistantContent
                  content={m.content || (chatLoading && i === messages.length - 1 ? "\u00a0" : "")}
                  onOpenProjectBuild={onOpenProjectBuild}
                />
              </div>
            ) : (
              <div className="studio-mv2-user-bubble">
                <div className="studio-mv2-user-text">{m.content}</div>
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="studio-mv2-thinking" aria-live="polite">
            <span className="studio-mv2-thinking-dot" />
            Thinking
          </div>
        )}
        <div className="studio-mv2-feed-end" ref={feedEndRef} aria-hidden />
      </div>

      <div className="studio-mv2-dock">
        {pendingSpec && (
          <div className="studio-mv2-pending" role="status">
            <div>
              <strong>Spec ready</strong>
              <span>Apply to continue, or apply and build the preview.</span>
            </div>
            <div className="studio-mv2-pending-actions">
              <button type="button" className="studio-mv2-btn-secondary" onClick={onApplyPending}>
                Apply
              </button>
              <button type="button" className="studio-mv2-btn-primary" onClick={onApplyAndPreview}>
                Apply &amp; preview
              </button>
            </div>
          </div>
        )}

        <div className="studio-mv2-float">
          <div className="studio-mv2-float-card">
            <textarea
              ref={inputRef}
              className="studio-mv2-float-input"
              value={input}
              placeholder="App Spec + product intent — RN/TS source is edited in Project build (/?project=1), not here"
              rows={3}
              disabled={chatLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void onSendChat();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSendChat();
                }
              }}
            />
            <div className="studio-mv2-float-toolbar">
              <div className="studio-mv2-float-tools" aria-hidden>
                <span className="studio-mv2-tico" title="Add">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span className="studio-mv2-tico" title="Context">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                <span className="studio-mv2-tico" title="Preview">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </span>
              </div>
              <div className="studio-mv2-float-right">
                <span className="studio-mv2-tico" title="Emoji" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                  </svg>
                </span>
                <span className="studio-mv2-tico" title="Voice (not connected)" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                    <path d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" />
                  </svg>
                </span>
                <button
                  type="button"
                  className="studio-mv2-float-send"
                  disabled={chatLoading}
                  onClick={() => void onSendChat()}
                  title="Send"
                >
                  {chatLoading ? (
                    <span className="studio-mv2-send-pulse" />
                  ) : (
                    <svg className="studio-mv2-send-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M12 19V5M5 12l7-7 7 7"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {userTurnCount === 0 && (
          <p className="studio-mv2-key-hint">
            Keys stay in this browser — set yours in the sidebar (
            <a href="#studio-byok">BYOK</a>).
          </p>
        )}
      </div>
    </div>
  );
}
