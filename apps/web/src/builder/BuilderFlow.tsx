import { useCallback, useMemo, useState } from "react";
import { createDefaultSpec } from "../defaultSpec";
import Editor from "@monaco-editor/react";
import { postBuilderClarify, streamBuilderGenerate } from "./builderApi";
import { useBuilderStore, answersComplete } from "./builderStore";
import { parseGeneratedFiles } from "./parseGeneratedFiles";
import { downloadZip, zipGeneratedFiles } from "./zipper";
import BrandLogo from "../BrandLogo";
import BuilderTeamChat from "./BuilderTeamChat";

const CHIPS = [
  "A fitness tracker with workouts and streaks",
  "A recipe browser with favorites",
  "A habit tracker with reminders",
];

function monacoLang(lang: string): string {
  if (lang === "typescript" || lang === "javascript") return "typescript";
  if (lang === "json") return "json";
  if (lang === "css") return "css";
  if (lang === "markdown") return "markdown";
  return "plaintext";
}

type Props = {
  onBack: () => void;
  onOpenStudio: () => void;
};

export default function BuilderFlow({ onBack, onOpenStudio }: Props) {
  const step = useBuilderStore((s) => s.step);
  const prompt = useBuilderStore((s) => s.prompt);
  const questions = useBuilderStore((s) => s.questions);
  const answers = useBuilderStore((s) => s.answers);
  const files = useBuilderStore((s) => s.files);
  const activeFile = useBuilderStore((s) => s.activeFile);
  const rawStream = useBuilderStore((s) => s.rawStream);
  const isStreaming = useBuilderStore((s) => s.isStreaming);
  const error = useBuilderStore((s) => s.error);

  const setPrompt = useBuilderStore((s) => s.setPrompt);
  const setStep = useBuilderStore((s) => s.setStep);
  const setQuestions = useBuilderStore((s) => s.setQuestions);
  const setAnswer = useBuilderStore((s) => s.setAnswer);
  const setFiles = useBuilderStore((s) => s.setFiles);
  const updateFileContent = useBuilderStore((s) => s.updateFileContent);
  const setActiveFile = useBuilderStore((s) => s.setActiveFile);
  const appendRawStream = useBuilderStore((s) => s.appendRawStream);
  const clearRawStream = useBuilderStore((s) => s.clearRawStream);
  const setStreaming = useBuilderStore((s) => s.setStreaming);
  const setError = useBuilderStore((s) => s.setError);
  const reset = useBuilderStore((s) => s.reset);

  const [loadingClarify, setLoadingClarify] = useState(false);
  const [zipping, setZipping] = useState(false);

  const activeContent = useMemo(() => {
    if (!activeFile) return "";
    return files.find((f) => f.path === activeFile)?.content ?? "";
  }, [activeFile, files]);

  const runClarify = useCallback(async () => {
    const p = prompt.trim();
    if (!p) {
      setError("Describe your app first.");
      return;
    }
    setError(null);
    setLoadingClarify(true);
    try {
      const { questions: q } = await postBuilderClarify(p);
      if (!q.length) {
        setError("No questions returned — try again.");
        return;
      }
      setQuestions(q);
      setStep("questions");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingClarify(false);
    }
  }, [prompt, setError, setQuestions, setStep]);

  const runGenerate = useCallback(async () => {
    if (!answersComplete(questions, answers)) {
      setError("Answer every question.");
      return;
    }
    setError(null);
    setStep("generating");
    clearRawStream();
    setStreaming(true);
    try {
      await streamBuilderGenerate(
        prompt,
        answers,
        questions,
        (chunk) => appendRawStream(chunk),
        ({ fullText }) => {
          const parsed = parseGeneratedFiles(fullText);
          setFiles(parsed);
          setStreaming(false);
          if (!parsed.length) {
            setError(
              "No ===FILE=== blocks found in output. The model may not have followed the format — try another model or retry."
            );
          }
          setStep("done");
        },
        (msg) => {
          setStreaming(false);
          setError(msg);
          setStep("questions");
        }
      );
    } catch (e) {
      setStreaming(false);
      setError(e instanceof Error ? e.message : String(e));
      setStep("questions");
    }
  }, [
    answers,
    appendRawStream,
    clearRawStream,
    prompt,
    questions,
    setError,
    setFiles,
    setStep,
    setStreaming,
  ]);

  async function handleDownloadZip() {
    if (!files.length) return;
    setZipping(true);
    try {
      const blob = await zipGeneratedFiles(files);
      const slug = prompt.slice(0, 40).replace(/\s+/g, "-").toLowerCase() || "rn-app";
      downloadZip(blob, slug);
    } finally {
      setZipping(false);
    }
  }

  const showIdeLayout = step === "generating" || step === "done";

  const teamChatSpec = useMemo(() => createDefaultSpec(), []);

  const answerFor = useCallback(
    (qid: number) => answers.find((a) => a.questionId === qid)?.value?.trim() ?? "—",
    [answers]
  );

  return (
    <div className={`builder-flow app-shell ${showIdeLayout ? "builder-flow--ide" : ""}`}>
      <div className="brand brand-row brand-row--logo builder-flow__head">
        <div className="brand-lockup">
          <BrandLogo variant="studio" />
          <div className="brand-lockup-text">
            <h1>Project build</h1>
            <span className="brand-lockup-sub">Full Expo project — generated here, edited in Monaco, exported as ZIP — not in Studio chat</span>
          </div>
        </div>
        <div className="builder-flow__head-actions">
          <button type="button" className="btn link-back" onClick={onOpenStudio}>
            Studio (BYOK)
          </button>
          <button type="button" className="btn link-back" onClick={onBack}>
            ← Home
          </button>
        </div>
      </div>

      {!showIdeLayout && (
        <p className="builder-flow__lead">
          Studio is for <strong>App Spec</strong> + web preview; <strong>Project build</strong> is where you get a{" "}
          <strong>complete, runnable Expo file tree</strong> (config, Router screens, components, theme, README) in Monaco + ZIP.
          Same keys as Studio: <code className="inline-code">OPENAI_API_KEY</code> /{" "}
          <code className="inline-code">NVIDIA_API_KEY</code> on the API, or save a key in{" "}
          <button type="button" className="btn-inline" onClick={onOpenStudio}>
            Studio → BYOK
          </button>
          .
        </p>
      )}

      {error && <div className="error-banner builder-flow__err">{error}</div>}

      {step === "prompt" && (
        <section className="builder-card" aria-labelledby="qb-prompt">
          <h2 id="qb-prompt" className="builder-card__title">
            1 · What are you building?
          </h2>
          <textarea
            className="builder-textarea"
            rows={5}
            placeholder="e.g. A small app to track daily water intake with reminders…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="builder-chips">
            {CHIPS.map((c) => (
              <button key={c} type="button" className="btn builder-chip" onClick={() => setPrompt(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="builder-actions">
            <button
              type="button"
              className="btn primary"
              disabled={loadingClarify || !prompt.trim()}
              onClick={() => void runClarify()}
            >
              {loadingClarify ? "Asking the model…" : "Get clarifying questions"}
            </button>
          </div>
        </section>
      )}

      {step === "questions" && (
        <section className="builder-card" aria-labelledby="qb-q">
          <h2 id="qb-q" className="builder-card__title">
            2 · Answer the questions
          </h2>
          <ol className="builder-q-list">
            {questions.map((q) => (
              <li key={q.id} className="builder-q-item">
                <p className="builder-q-text">{q.question}</p>
                {q.type === "choice" && q.options?.length ? (
                  <select
                    className="builder-select"
                    value={answers.find((a) => a.questionId === q.id)?.value ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {q.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="builder-input"
                    value={answers.find((a) => a.questionId === q.id)?.value ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Your answer"
                  />
                )}
              </li>
            ))}
          </ol>
          <div className="builder-actions">
            <button type="button" className="btn" onClick={() => setStep("prompt")}>
              Back
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!answersComplete(questions, answers)}
              onClick={() => void runGenerate()}
            >
              Generate app
            </button>
          </div>
        </section>
      )}

      {showIdeLayout && (
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
                <button
                  type="button"
                  className="btn primary"
                  disabled={!files.length || zipping}
                  onClick={() => void handleDownloadZip()}
                >
                  {zipping ? "Zipping…" : "Download ZIP"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    reset();
                    setStep("prompt");
                  }}
                >
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
                <button
                  type="button"
                  className="btn primary builder-manus-zip-pill"
                  disabled={zipping}
                  onClick={() => void handleDownloadZip()}
                >
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
                        onClick={() => setActiveFile(f.path)}
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
                    language={monacoLang(files.find((x) => x.path === activeFile)?.language ?? "plaintext")}
                    value={activeContent}
                    onChange={(v) => {
                      if (activeFile && step === "done") updateFileContent(activeFile, v ?? "");
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
      )}

    </div>
  );
}
