import { useCallback, useMemo } from "react";
import Editor from "@monaco-editor/react";
import type { AppSpec } from "../types";
import { createDefaultSpec } from "../defaultSpec";
import BuilderPreviewPanel from "./BuilderPreviewPanel";
import BuilderTeamChat from "./BuilderTeamChat";
import { monacoLanguageForFile } from "./monacoLanguage";
import type { BuilderAnswer, BuilderQuestion, GeneratedFile } from "./types";
import type { BuilderStep } from "./types";

type Props = {
  step: BuilderStep;
  prompt: string;
  questions: BuilderQuestion[];
  answers: BuilderAnswer[];
  files: GeneratedFile[];
  activeFile: string | null;
  rawStream: string;
  isStreaming: boolean;
  onActiveFile: (path: string | null) => void;
  onFileEdit: (path: string, content: string) => void;
  zipping: boolean;
  onDownloadZip: () => void;
  onNewApp: () => void;
  onBack: () => void;
  onOpenStudio: () => void;
  previewLoading: boolean;
  previewPhase: number;
  snackKey: number;
  snackFiles: { path: string; content: string }[];
  previewAbsUrl: string | null;
  qrDataUrl: string | null;
  previewError: string | null;
  showLocalhostQrHint: boolean;
  onSnackReady: () => void;
  onSnackError: (msg: string) => void;
  onExpoGoUrl: (url: string | null) => void;
  onRebuildPreview: () => void;
  onCopyPreviewLink: () => void;
};

export default function BuilderIdeWorkspace({
  step,
  prompt,
  questions,
  answers,
  files,
  activeFile,
  rawStream,
  isStreaming,
  onActiveFile,
  onFileEdit,
  zipping,
  onDownloadZip,
  onNewApp,
  onBack,
  onOpenStudio,
  previewLoading,
  previewPhase,
  snackKey,
  snackFiles,
  previewAbsUrl,
  qrDataUrl,
  previewError,
  showLocalhostQrHint,
  onSnackReady,
  onSnackError,
  onExpoGoUrl,
  onRebuildPreview,
  onCopyPreviewLink,
}: Props) {
  const teamChatSpec = useMemo<AppSpec>(() => createDefaultSpec(), []);

  const answerFor = useCallback(
    (qid: number) => answers.find((a) => a.questionId === qid)?.value?.trim() ?? "—",
    [answers]
  );

  const activeContent = useMemo(() => {
    if (!activeFile) return "";
    return files.find((f) => f.path === activeFile)?.content ?? "";
  }, [activeFile, files]);

  const lang = files.find((x) => x.path === activeFile)?.language ?? "plaintext";

  return (
    <>
    <div className="builder-manus-root">
      <aside className="builder-manus-left" aria-label="Brief and answers">
        <p className="builder-manus-kicker">{step === "generating" ? "Generating…" : "Project ready"}</p>
        <h2 className="builder-manus-left__title">Your brief</h2>
        <div className="builder-manus-bubble builder-manus-bubble--idea">
          <span className="builder-manus-label">App idea</span>
          <p className="builder-manus-idea-text">{prompt || "—"}</p>
        </div>
        <h3 className="builder-manus-sub">Clarifications</h3>
        <ul className="builder-manus-qa-list">
          {questions.map((q) => (
            <li key={q.id} className="builder-manus-qa">
              <p className="builder-manus-q">{q.question}</p>
              <p className="builder-manus-a">{answerFor(q.id)}</p>
            </li>
          ))}
        </ul>
        <div className="builder-manus-status" role="status">
          {step === "generating" && (
            <>
              <span className="builder-manus-status-dot" aria-hidden />
              Writing files to the project tree…
            </>
          )}
          {step === "done" && (
            <>
              {files.length > 0 ? (
                <strong>{files.length} files</strong>
              ) : (
                <span>No files parsed — check the stream below.</span>
              )}
              {files.length > 0 ? " · Edit in the editor or download ZIP." : ""}
            </>
          )}
        </div>
        {step === "generating" && (
          <details className="builder-raw-details builder-raw-details--left" open>
            <summary>Raw stream</summary>
            <pre className="builder-raw-pre">{rawStream}</pre>
          </details>
        )}
        {step === "done" && files.length > 0 && (
          <BuilderTeamChat files={files} spec={teamChatSpec} onOpenStudio={onOpenStudio} />
        )}
        {step === "done" && (
          <div className="builder-manus-actions">
            <button type="button" className="btn primary" disabled={!files.length || zipping} onClick={() => void onDownloadZip()}>
              {zipping ? "Zipping…" : "Download ZIP"}
            </button>
            <button type="button" className="btn" onClick={onNewApp}>
              New app
            </button>
            <button type="button" className="btn" onClick={onBack}>
              Home
            </button>
          </div>
        )}
      </aside>

      <div className="builder-manus-ide">
        <div className="builder-manus-ide-top">
          <div className="builder-manus-breadcrumb" title={activeFile ?? undefined}>
            <span className="builder-manus-breadcrumb-label">expo-app</span>
            <span className="builder-manus-breadcrumb-sep">/</span>
            <span className="builder-manus-breadcrumb-file">{activeFile ?? (step === "generating" ? "…" : "select a file")}</span>
          </div>
          {step === "done" && files.length > 0 && (
            <button type="button" className="btn primary builder-manus-zip-pill" disabled={zipping} onClick={() => void onDownloadZip()}>
              {zipping ? "Zipping…" : "Download ZIP"}
            </button>
          )}
        </div>

        <div className="builder-split builder-split--ide">
          <aside className="builder-files">
            <div className="builder-files__head">Explorer ({files.length})</div>
            <ul className="builder-files__ul">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className={activeFile === f.path ? "builder-file active" : "builder-file"}
                    onClick={() => onActiveFile(f.path)}
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="builder-editor-wrap builder-editor-wrap--fill">
            {activeFile && files.length > 0 ? (
              <Editor
                height="min(72vh, calc(100vh - 200px))"
                theme="vs-dark"
                path={activeFile}
                language={monacoLanguageForFile(lang)}
                value={activeContent}
                onChange={(v) => {
                  if (activeFile && step === "done") onFileEdit(activeFile, v ?? "");
                }}
                options={{
                  readOnly: step !== "done",
                  minimap: { enabled: true },
                  wordWrap: "on",
                  fontSize: 13,
                }}
              />
            ) : (
              <pre className="builder-raw-fallback builder-raw-fallback--fill">{rawStream || (isStreaming ? "…" : "Waiting for files…")}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
    {step === "done" && files.length > 0 && (
      <BuilderPreviewPanel
        previewLoading={previewLoading}
        previewPhase={previewPhase}
        snackKey={snackKey}
        snackFiles={snackFiles}
        previewAbsUrl={previewAbsUrl}
        qrDataUrl={qrDataUrl}
        previewError={previewError}
        showLocalhostQrHint={showLocalhostQrHint}
        onSnackReady={onSnackReady}
        onSnackError={onSnackError}
        onExpoGoUrl={onExpoGoUrl}
        onRebuildPreview={onRebuildPreview}
        onCopyPreviewLink={onCopyPreviewLink}
      />
    )}
    </>
  );
}
