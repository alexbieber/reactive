import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { previewAbsoluteUrl } from "../previewAbsoluteUrl";
import {
  loadStudioLlm,
  saveStudioLlm,
  type StudioLlmSettings,
} from "../studioLlm";
import { postBuilderClarify, streamBuilderGenerate } from "./builderApi";
import { useBuilderStore, answersComplete } from "./builderStore";
import { parseGeneratedFiles } from "./parseGeneratedFiles";
import { downloadZip, zipGeneratedFiles } from "./zipper";
import BrandLogo from "../BrandLogo";
import BuilderByokCard from "./BuilderByokCard";
import BuilderIdeWorkspace from "./BuilderIdeWorkspace";
import BuilderPromptCard from "./BuilderPromptCard";
import BuilderQuestionsCard from "./BuilderQuestionsCard";
import { useProjectBuildConnection } from "./useProjectBuildConnection";
import { BUILDER_PREVIEW_PHASES } from "./projectBuildConstants";

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
  const [llmSettings, setLlmSettings] = useState<StudioLlmSettings>(() => loadStudioLlm());

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPhase, setPreviewPhase] = useState(0);
  const [snackKey, setSnackKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expoGoUrl, setExpoGoUrl] = useState<string | null>(null);
  const autoPreviewRanRef = useRef(false);

  /** Snack preview uses a snapshot taken only when starting preview — live `files` changes on every Monaco edit and would remount Snack (black iframe). */
  const [snackPreviewFiles, setSnackPreviewFiles] = useState<{ path: string; content: string }[]>([]);

  const previewAbsUrl = expoGoUrl ? previewAbsoluteUrl(expoGoUrl) : null;
  const showLocalhostQrHint = false;

  const { apiHealth, hasByokKey, llmReady } = useProjectBuildConnection(llmSettings);

  useEffect(() => {
    saveStudioLlm(llmSettings);
  }, [llmSettings]);

  useEffect(() => {
    if (!previewLoading) {
      setPreviewPhase(0);
      return;
    }
    const id = setInterval(() => {
      setPreviewPhase((p) => (p + 1) % BUILDER_PREVIEW_PHASES.length);
    }, 2800);
    return () => clearInterval(id);
  }, [previewLoading]);

  useEffect(() => {
    if (!previewAbsUrl || previewLoading) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(previewAbsUrl, {
      width: 216,
      margin: 2,
      color: { dark: "#0f0f14ff", light: "#ffffffff" },
      errorCorrectionLevel: "M",
    })
      .then((data) => {
        if (!cancelled) setQrDataUrl(data);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [previewAbsUrl, previewLoading]);

  const runBuilderPreview = useCallback(() => {
    if (files.length === 0) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setExpoGoUrl(null);
    setSnackPreviewFiles(files.map((f) => ({ path: f.path, content: f.content })));
    setSnackKey((k) => k + 1);
  }, [files]);

  /** After each successful generation, build preview automatically (once per “done” session). */
  useEffect(() => {
    if (step !== "done") {
      autoPreviewRanRef.current = false;
      return;
    }
    if (files.length === 0 || autoPreviewRanRef.current) return;
    autoPreviewRanRef.current = true;
    void runBuilderPreview();
  }, [step, files.length, runBuilderPreview]);

  const copyPreviewLink = useCallback(async () => {
    if (!previewAbsUrl) return;
    try {
      await navigator.clipboard.writeText(previewAbsUrl);
    } catch {
      /* ignore */
    }
  }, [previewAbsUrl]);

  const runClarify = useCallback(async () => {
    const p = prompt.trim();
    if (!p) {
      setError("Describe your app first.");
      return;
    }
    if (!llmReady) {
      setError("Add a model API key below, or set OPENAI_API_KEY / NVIDIA_API_KEY on the API server.");
      return;
    }
    setError(null);
    setLoadingClarify(true);
    try {
      const { questions: q } = await postBuilderClarify(p, llmSettings);
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
  }, [prompt, setError, setQuestions, setStep, llmReady, llmSettings]);

  const runGenerate = useCallback(async () => {
    if (!answersComplete(questions, answers)) {
      setError("Answer every question.");
      return;
    }
    if (!llmReady) {
      setError("Add a model API key below, or set OPENAI_API_KEY / NVIDIA_API_KEY on the API server.");
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
          try {
            const parsed = parseGeneratedFiles(fullText);
            setFiles(parsed);
            setStreaming(false);
            if (!parsed.length) {
              setError(
                "No ===FILE=== blocks found in output. The model may not have followed the format — try another model or retry."
              );
            }
            setStep("done");
          } catch (e) {
            setStreaming(false);
            setError(e instanceof Error ? e.message : String(e));
            setStep("questions");
          }
        },
        (msg) => {
          setStreaming(false);
          setError(msg);
          setStep("questions");
        },
        llmSettings
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
    llmReady,
    llmSettings,
  ]);

  const handleDownloadZip = useCallback(async () => {
    if (!files.length) return;
    setZipping(true);
    try {
      const blob = await zipGeneratedFiles(files);
      const slug = prompt.slice(0, 40).replace(/\s+/g, "-").toLowerCase() || "rn-app";
      downloadZip(blob, slug);
    } finally {
      setZipping(false);
    }
  }, [files, prompt]);

  const showIdeLayout = step === "generating" || step === "done";

  const handleNewApp = useCallback(() => {
    setSnackKey(0);
    setSnackPreviewFiles([]);
    setExpoGoUrl(null);
    setPreviewError(null);
    setQrDataUrl(null);
    autoPreviewRanRef.current = false;
    reset();
    setStep("prompt");
  }, [reset, setStep]);

  return (
    <div className={`builder-flow app-shell ${showIdeLayout ? "builder-flow--ide" : ""}`}>
      <div className="brand brand-row brand-row--logo builder-flow__head">
        <div className="brand-lockup">
          <BrandLogo variant="studio" />
          <div className="brand-lockup-text">
            <h1>Project build</h1>
            <span className="brand-lockup-sub">
              Full Expo project — generated here, edited in Monaco, exported as ZIP — not in Studio chat
            </span>
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
          Uses the same <strong>POST /api/builder/clarify</strong> and <strong>POST /api/builder/generate-stream</strong> as
          Studio’s BYOK flow — keys below are sent on every request. Web preview uses <strong>Expo Snack</strong> in the browser (no server export).
        </p>
      )}

      {!showIdeLayout && (
        <BuilderByokCard
          apiHealth={apiHealth}
          hasByokKey={hasByokKey}
          llmSettings={llmSettings}
          onChangeLlm={setLlmSettings}
          onOpenStudio={onOpenStudio}
        />
      )}

      {error && <div className="error-banner builder-flow__err">{error}</div>}

      {step === "prompt" && (
        <BuilderPromptCard
          prompt={prompt}
          onPromptChange={setPrompt}
          loadingClarify={loadingClarify}
          llmReady={llmReady}
          onGetQuestions={runClarify}
        />
      )}

      {step === "questions" && (
        <BuilderQuestionsCard
          questions={questions}
          answers={answers}
          llmReady={llmReady}
          onAnswer={setAnswer}
          onBack={() => setStep("prompt")}
          onGenerate={runGenerate}
        />
      )}

      {showIdeLayout && (
        <BuilderIdeWorkspace
          step={step}
          prompt={prompt}
          questions={questions}
          answers={answers}
          files={files}
          activeFile={activeFile}
          rawStream={rawStream}
          isStreaming={isStreaming}
          onActiveFile={setActiveFile}
          onFileEdit={updateFileContent}
          zipping={zipping}
          onDownloadZip={handleDownloadZip}
          onNewApp={handleNewApp}
          onBack={onBack}
          onOpenStudio={onOpenStudio}
          previewLoading={previewLoading}
          previewPhase={previewPhase}
          snackKey={snackKey}
          snackFiles={snackPreviewFiles}
          previewAbsUrl={previewAbsUrl}
          qrDataUrl={qrDataUrl}
          previewError={previewError}
          showLocalhostQrHint={showLocalhostQrHint}
          onSnackReady={() => setPreviewLoading(false)}
          onSnackError={(msg) => {
            setPreviewError(msg);
            setPreviewLoading(false);
          }}
          onExpoGoUrl={setExpoGoUrl}
          onRebuildPreview={() => runBuilderPreview()}
          onCopyPreviewLink={() => void copyPreviewLink()}
        />
      )}
    </div>
  );
}
