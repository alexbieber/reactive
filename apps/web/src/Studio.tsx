import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BrandLogo from "./BrandLogo";
import type { AppSpec } from "./types";
import { isLocalhostHost, previewAbsoluteUrl } from "./previewAbsoluteUrl";
import {
  clearStudioPersisted,
  getHydratedStudioState,
  saveStudioPersisted,
  STUDIO_DEFAULT_WELCOME_MESSAGES,
} from "./studioPersist";
import { getAgentEmployeeLine, parseAgentSegments, STUDIO_AGENTS } from "./studioAgents";
import {
  ensureTtsVoicesLoaded,
  isBrowserTtsAvailable,
  speakAssistantContent,
  stopStudioSpeech,
} from "./studioTts";
import {
  buildLlmRequestFields,
  inferProviderFromKey,
  LLM_PROVIDERS,
  loadStudioLlm,
  sanitizeLlmApiKey,
  saveStudioLlm,
  tryParseBareApiKey,
  type StudioLlmSettings,
} from "./studioLlm";
import { GITHUB_CONTEXT_PRESETS } from "./studioGithubPresets";
import { normalizeAppSpecForSchema, stampTimes, validateSpec } from "./validateSpec";
import { getErrorMessageFromResponse } from "./apiFetchErrors";
import QRCode from "qrcode";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

type Msg = { role: "user" | "assistant"; content: string };

/** From POST /api/chat and /api/chat/stream done — gpt-tokenizer baseline */
type ChatTokenUsage = {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  encoder?: string;
  estimate?: string;
};

/** Mirrors POST /api/github/context response — injected into copilot system prompt */
type GithubContextPayload = {
  fullName: string;
  description?: string;
  topics?: string[];
  readme: string;
  packageJson: string;
  babelConfigPath?: string;
  babelConfig: string;
  metroConfigPath?: string;
  metroConfig: string;
  expoConfig: string;
  tsconfigJson: string;
  easJson: string;
  /** Monorepo subfolder used for fetch */
  appPath: string;
};

const STUDIO_CODE_STRIPPED_NOTE =
  "\n\n> **No source code in Studio chat** — the UI hides fenced blocks except App Spec `json`. Use **[Project build](/?project=1)** for Monaco, the file tree, and ZIP.\n\n";

/** True when an unlabeled fence is clearly App Spec JSON (assistant sometimes omits `json`). */
function looksLikeAppSpecJson(body: string): boolean {
  const t = body.trim();
  if (!t.startsWith("{")) return false;
  return (
    t.includes('"meta"') &&
    (t.includes('"screens"') || t.includes('"navigation"') || t.includes('"data_model"'))
  );
}

/**
 * Strip every markdown fenced block except ```json (and bare ``` that look like App Spec).
 * Models still emit ```ts / ```tsx / ``` — users should never see that in Studio.
 */
function stripStudioHandwrittenCodeFences(text: string): string {
  let out = "";
  let pos = 0;
  while (pos < text.length) {
    const fenceStart = text.indexOf("```", pos);
    if (fenceStart < 0) {
      out += text.slice(pos);
      break;
    }
    out += text.slice(pos, fenceStart);
    const afterOpen = fenceStart + 3;
    const lineEnd = text.indexOf("\n", afterOpen);
    if (lineEnd < 0) {
      out += text.slice(fenceStart);
      break;
    }
    const firstLine = text.slice(afterOpen, lineEnd);
    const langToken = firstLine.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const bodyStart = lineEnd + 1;
    const close = text.indexOf("```", bodyStart);
    if (close < 0) {
      out += text.slice(fenceStart);
      break;
    }
    const body = text.slice(bodyStart, close);
    const fullBlock = text.slice(fenceStart, close + 3);
    const keepJson =
      langToken === "json" ||
      langToken === "jsonc" ||
      (langToken === "" && looksLikeAppSpecJson(body));
    out += keepJson ? fullBlock : STUDIO_CODE_STRIPPED_NOTE;
    pos = close + 3;
  }
  return out;
}

function makeAssistantMdComponents(onOpenProjectBuild?: () => void) {
  return {
    p: ({ children }: { children?: ReactNode }) => <p className="studio-msg-md-p">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="studio-msg-md-ul">{children}</ul>,
    ol: ({ children }: { children?: ReactNode }) => <ol className="studio-msg-md-ol">{children}</ol>,
    li: ({ children }: { children?: ReactNode }) => <li className="studio-msg-md-li">{children}</li>,
    strong: ({ children }: { children?: ReactNode }) => <strong>{children}</strong>,
    blockquote: ({ children }: { children?: ReactNode }) => (
      <blockquote className="studio-msg-md-bq">{children}</blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const projectBuild =
        href === "/?project=1" ||
        href === "?project=1" ||
        href === "/?quick=1" ||
        href === "?quick=1" ||
        (typeof href === "string" &&
          (href.includes("project=1") || href.includes("quick=1")) &&
          !/^https?:\/\//i.test(href));
      return (
        <a
          href={href ?? "#"}
          className="studio-msg-md-a"
          onClick={
            projectBuild && onOpenProjectBuild
              ? (e) => {
                  e.preventDefault();
                  onOpenProjectBuild();
                }
              : undefined
          }
          {...(projectBuild ? {} : { target: "_blank" as const, rel: "noreferrer noopener" })}
        >
          {children}
        </a>
      );
    },
    pre: ({ children }: { children?: ReactNode }) => <pre className="studio-msg-md-pre">{children}</pre>,
    code: ({ className, children, ...props }: { className?: string; children?: ReactNode }) => {
      const isBlock = Boolean(className?.includes("language-"));
      if (isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="studio-msg-inline-code" {...props}>
          {children}
        </code>
      );
    },
  };
}

function AssistantContent({
  content,
  onOpenProjectBuild,
}: {
  content: string;
  onOpenProjectBuild?: () => void;
}) {
  const display = useMemo(() => stripStudioHandwrittenCodeFences(content), [content]);
  const segments = useMemo(() => parseAgentSegments(display), [display]);
  const mdComponents = useMemo(() => makeAssistantMdComponents(onOpenProjectBuild), [onOpenProjectBuild]);
  const [copied, setCopied] = useState(false);
  const copyReply = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(display.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied */
    }
  }, [display]);

  const showCopy = Boolean(content) && content !== "…";

  return (
    <div className="studio-assistant-segments">
      {segments.map((seg, i) => (
        <Fragment key={i}>
          <div className="studio-agent-segment">
            {seg.agentId && (
              <span
                className={`studio-agent-badge studio-agent-badge--${seg.agentId.toLowerCase()}`}
                title={getAgentEmployeeLine(seg.agentId) ?? seg.agentId}
              >
                {getAgentEmployeeLine(seg.agentId) ?? seg.agentId}
              </span>
            )}
            <div className="studio-msg-md-wrap">
              <div className="studio-msg-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {seg.body || "\u00a0"}
                </ReactMarkdown>
              </div>
              {showCopy && i === segments.length - 1 && (
                <button type="button" className="studio-msg-copy" onClick={() => void copyReply()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

type Props = {
  initialSpec: AppSpec;
  onBack: () => void;
  /** Opens Project build in-app (Monaco) without a full page reload */
  onOpenProjectBuild?: () => void;
  /** Multi-agent conference room (teammates talk to each other) */
  onOpenTeamRoom?: () => void;
};

const PREVIEW_PHASES = [
  "Validating spec & generating project…",
  "Installing dependencies (npm)…",
  "Bundling Expo web export…",
  "Almost ready…",
] as const;

function parseSseDataLine(rawBlock: string): {
  type?: string;
  text?: string;
  fullText?: string;
  proposedSpec?: AppSpec | null;
  specValidationError?: string | null;
  tokenUsage?: ChatTokenUsage;
  message?: string;
} | null {
  const line = rawBlock.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(6)) as {
      type?: string;
      text?: string;
      fullText?: string;
      proposedSpec?: AppSpec | null;
      specValidationError?: string | null;
      tokenUsage?: ChatTokenUsage;
      message?: string;
    };
  } catch {
    return null;
  }
}

async function parseSSEStream(
  res: Response,
  onDelta: (t: string) => void,
  onDone: (payload: {
    fullText: string;
    proposedSpec: AppSpec | null;
    specValidationError: string | null;
    tokenUsage?: ChatTokenUsage;
  }) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const dec = new TextDecoder();
  let buf = "";
  let sawDone = false;

  const handleOneBlock = (raw: string) => {
    const j = parseSseDataLine(raw);
    if (!j) return;
    if (j.type === "delta" && typeof j.text === "string") onDelta(j.text);
    if (j.type === "done") {
      if (sawDone) return;
      sawDone = true;
      onDone({
        fullText: typeof j.fullText === "string" ? j.fullText : "",
        proposedSpec: (j.proposedSpec as AppSpec) ?? null,
        specValidationError: typeof j.specValidationError === "string" ? j.specValidationError : null,
        tokenUsage:
          j.tokenUsage && typeof j.tokenUsage.promptTokens === "number"
            ? j.tokenUsage
            : undefined,
      });
    }
    if (j.type === "error") throw new Error(j.message || "Stream error");
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    buf = buf.replace(/\r\n/g, "\n");
    for (;;) {
      const i = buf.indexOf("\n\n");
      if (i < 0) break;
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      handleOneBlock(raw);
    }
  }
  buf = buf.replace(/\r\n/g, "\n").trim();
  if (buf) {
    if (buf.includes("\n\n")) {
      for (const part of buf.split("\n\n")) {
        if (part.trim()) handleOneBlock(part);
      }
    } else {
      handleOneBlock(buf);
    }
  }
  if (!sawDone) {
    throw new Error(
      "Stream ended without a final done event. Run npm run dev:platform (API defaults to port 8788), or set API_PROXY_TARGET and PORT so they match."
    );
  }
}

export default function Studio({ initialSpec, onBack, onOpenProjectBuild, onOpenTeamRoom }: Props) {
  const [boot] = useState(() => getHydratedStudioState(initialSpec));
  const [spec, setSpec] = useState<AppSpec>(boot.spec);
  const [messages, setMessages] = useState<Msg[]>(boot.messages);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPhase, setPreviewPhase] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingSpec, setPendingSpec] = useState<AppSpec | null>(boot.pendingSpec);
  const [specValidationError, setSpecValidationError] = useState<string | null>(boot.specValidationError);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [apiCaps, setApiCaps] = useState<{
    chat: boolean;
    chatStream?: boolean;
    service?: string;
    version?: string;
    openaiModel?: string;
    nvidiaModel?: string;
    serverOpenAiKey?: boolean;
    serverNvidiaKey?: boolean;
  } | null>(null);
  const [llmSettings, setLlmSettings] = useState<StudioLlmSettings>(() => loadStudioLlm());
  const [githubCtx, setGithubCtx] = useState<GithubContextPayload | null>(null);
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubRefInput, setGithubRefInput] = useState("");
  const [githubAppPathInput, setGithubAppPathInput] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubErr, setGithubErr] = useState<string | null>(null);
  const [sessionLlm, setSessionLlm] = useState({ prompt: 0, completion: 0, total: 0, turns: 0 });
  const [sessionPreview, setSessionPreview] = useState({ specTokens: 0, builds: 0 });
  const [lastChatUsage, setLastChatUsage] = useState<ChatTokenUsage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Scroll anchor at end of transcript — scrollIntoView keeps the latest turn in view */
  const feedEndRef = useRef<HTMLDivElement>(null);
  /** User is near the bottom; if false, don’t yank scroll while they read older turns */
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  /** Native <details> misbehaves in nested sidebar flex/scroll; use explicit panel for App Spec JSON */
  const [specJsonExpanded, setSpecJsonExpanded] = useState(false);
  /** Local Web Speech only — no REACTIVE API usage */
  const [ttsPlayingIndex, setTtsPlayingIndex] = useState<number | null>(null);
  /** Last preview-build or preflight validation failure — sent to copilot so agents respond to real errors */
  const [previewBuildError, setPreviewBuildError] = useState<string | null>(null);

  const recordChatUsage = useCallback((u: ChatTokenUsage) => {
    setSessionLlm((s) => ({
      prompt: s.prompt + u.promptTokens,
      completion: s.completion + u.completionTokens,
      total: s.total + u.totalTokens,
      turns: s.turns + 1,
    }));
    setLastChatUsage(u);
  }, []);

  const recordPreviewSpecTokens = useCallback((specJsonTokens: number) => {
    setSessionPreview((s) => ({
      specTokens: s.specTokens + specJsonTokens,
      builds: s.builds + 1,
    }));
  }, []);

  const toggleAssistantListen = useCallback((messageIndex: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === "\u00a0") return;
    if (ttsPlayingIndex === messageIndex) {
      stopStudioSpeech();
      setTtsPlayingIndex(null);
      return;
    }
    setTtsPlayingIndex(messageIndex);
    speakAssistantContent(text, {
      onEnd: () => {
        setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
      },
    });
  }, [ttsPlayingIndex]);

  useEffect(() => {
    void ensureTtsVoicesLoaded();
    return () => {
      stopStudioSpeech();
    };
  }, []);

  const previewAbsUrl = previewUrl ? previewAbsoluteUrl(previewUrl) : null;
  const showLocalhostQrHint = Boolean(previewAbsUrl && isLocalhostHost());
  /** Canonical blocks (schema enum) for chat, preview POST, and JSON panel */
  const specCanonical = useMemo(() => normalizeAppSpecForSchema(spec), [spec]);
  const specCheck = useMemo(() => validateSpec(spec), [spec]);
  /** Current spec vs last assistant JSON block — both surface in the top bar */
  const specPillOk = specCheck.ok && !specValidationError;
  const specPillTitle = !specCheck.ok
    ? "Current App Spec fails schema — fix in wizard or edit JSON"
    : specValidationError
      ? "Last assistant JSON block did not validate — current file spec may still be ok"
      : "App Spec matches schema";

  const copilotContext = useMemo(() => {
    const userTurnCount = messages.filter((m) => m.role === "user").length;
    return {
      specPassesSchema: specCheck.ok,
      lastAssistantJsonError: specValidationError,
      lastPreviewBuildError: previewBuildError,
      successfulPreviewBuilds: sessionPreview.builds,
      userTurnCount,
    };
  }, [specCheck.ok, specValidationError, previewBuildError, sessionPreview.builds, messages]);

  /** Persist chat + spec + pending state locally (this browser only) */
  useEffect(() => {
    const id = window.setTimeout(() => {
      saveStudioPersisted({
        messages,
        spec,
        specValidationError,
        pendingSpec,
      });
    }, 450);
    return () => window.clearTimeout(id);
  }, [messages, spec, specValidationError, pendingSpec]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/health`);
        const j = (await r.json()) as {
          service?: string;
          version?: string;
          capabilities?: {
            chat?: boolean;
            chatStream?: boolean;
            serverOpenAiKey?: boolean;
            serverNvidiaKey?: boolean;
          };
          openaiModel?: string;
          nvidiaModel?: string;
        };
        if (!cancelled)
          setApiCaps({
            chat: Boolean(j.capabilities?.chat),
            chatStream: Boolean(j.capabilities?.chatStream),
            service: typeof j.service === "string" ? j.service : undefined,
            version: typeof j.version === "string" ? j.version : undefined,
            openaiModel: typeof j.openaiModel === "string" ? j.openaiModel : undefined,
            nvidiaModel: typeof j.nvidiaModel === "string" ? j.nvidiaModel : undefined,
            serverOpenAiKey: Boolean(j.capabilities?.serverOpenAiKey),
            serverNvidiaKey: Boolean(j.capabilities?.serverNvidiaKey),
          });
        if (!cancelled && j.service === "reactive-api" && j.capabilities?.chatStream === false) {
          setToast("API reports chatStream: false — streaming may not work. Update the API or use POST /api/chat only.");
        }
      } catch {
        if (!cancelled) setApiCaps({ chat: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveStudioLlm(llmSettings);
  }, [llmSettings]);

  /** Keep provider dropdown aligned with key prefix (OpenAI sk- vs NVIDIA nvapi-, etc.) */
  useEffect(() => {
    const k = sanitizeLlmApiKey(llmSettings.apiKey);
    if (!k) return;
    const p = inferProviderFromKey(k);
    if (p && p !== llmSettings.provider) {
      setLlmSettings((s) => ({ ...s, provider: p }));
    }
  }, [llmSettings.apiKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  useEffect(() => {
    if (!previewLoading) {
      setPreviewPhase(0);
      return;
    }
    const id = setInterval(() => {
      setPreviewPhase((p) => (p + 1) % PREVIEW_PHASES.length);
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

  const scrollFeedToLatest = useCallback(() => {
    const end = feedEndRef.current;
    const feed = listRef.current;
    if (end) {
      end.scrollIntoView({ block: "end", behavior: "auto" });
    } else if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  }, []);

  const FEED_STICK_THRESHOLD_PX = 140;
  const onFeedScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist <= FEED_STICK_THRESHOLD_PX;
  }, []);

  async function loadGithubContext(opts?: { repo?: string; ref?: string; appPath?: string }) {
    const repo = (opts?.repo ?? githubRepoInput).trim();
    const ref = (opts?.ref !== undefined ? opts.ref : githubRefInput).trim();
    const appPath = (opts?.appPath !== undefined ? opts.appPath : githubAppPathInput).trim();
    if (opts?.repo !== undefined) setGithubRepoInput(opts.repo);
    if (opts?.ref !== undefined) setGithubRefInput(opts.ref);
    if (opts?.appPath !== undefined) setGithubAppPathInput(opts.appPath);
    if (!repo) {
      setGithubErr("Enter owner/repo or a github.com URL.");
      return;
    }
    setGithubLoading(true);
    setGithubErr(null);
    try {
      const r = await fetch(`${apiBase}/api/github/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, ref: ref || undefined, appPath: appPath || undefined }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        fullName?: string;
        description?: string;
        topics?: string[];
        readme?: string;
        packageJson?: string;
        babelConfigPath?: string;
        babelConfig?: string;
        metroConfigPath?: string;
        metroConfig?: string;
        expoConfig?: string;
        tsconfigJson?: string;
        easJson?: string;
        appPath?: string;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        throw new Error(typeof j.error === "string" ? j.error : r.statusText);
      }
      setGithubCtx({
        fullName: j.fullName ?? "",
        description: j.description,
        topics: j.topics,
        readme: j.readme ?? "",
        packageJson: j.packageJson ?? "",
        babelConfigPath: j.babelConfigPath,
        babelConfig: j.babelConfig ?? "",
        metroConfigPath: j.metroConfigPath,
        metroConfig: j.metroConfig ?? "",
        expoConfig: j.expoConfig ?? "",
        tsconfigJson: j.tsconfigJson ?? "",
        easJson: j.easJson ?? "",
        appPath: j.appPath ?? appPath,
      });
      setToast(`GitHub context: ${j.fullName ?? repo}`);
    } catch (e) {
      setGithubErr(e instanceof Error ? e.message : String(e));
      setGithubCtx(null);
    } finally {
      setGithubLoading(false);
    }
  }

  async function sendChatFallback(body: object) {
    const r = await fetch(`${apiBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      throw new Error(await getErrorMessageFromResponse(r, "POST /api/chat"));
    }
    const j = (await r.json().catch(() => ({}))) as {
      reply?: string;
      proposedSpec?: AppSpec;
      specValidationError?: string | null;
      tokenUsage?: ChatTokenUsage;
      error?: string;
      hint?: string;
    };
    const reply = typeof j.reply === "string" ? j.reply : "";
    if (j.tokenUsage && typeof j.tokenUsage.totalTokens === "number") {
      recordChatUsage(j.tokenUsage);
    }
    stickToBottomRef.current = true;
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
    setSpecValidationError(
      typeof j.specValidationError === "string" && j.specValidationError ? j.specValidationError : null
    );
    if (j.proposedSpec && typeof j.proposedSpec === "object") {
      setPendingSpec(j.proposedSpec);
      setToast("Valid App Spec received — review and Apply below.");
    } else if (j.specValidationError) {
      setToast("Model returned JSON that didn’t validate — check the reply.");
    }
  }

  async function runChatFromMessages(nextMsgs: Msg[]) {
    setChatLoading(true);
    const body = {
      messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      spec: specCanonical,
      copilotContext,
      ...buildLlmRequestFields(llmSettings),
      ...(githubCtx
        ? {
            githubContext: {
              fullName: githubCtx.fullName,
              description: githubCtx.description,
              topics: githubCtx.topics,
              readme: githubCtx.readme,
              packageJson: githubCtx.packageJson,
              babelConfigPath: githubCtx.babelConfigPath,
              babelConfig: githubCtx.babelConfig,
              metroConfigPath: githubCtx.metroConfigPath,
              metroConfig: githubCtx.metroConfig,
              expoConfig: githubCtx.expoConfig,
              tsconfigJson: githubCtx.tsconfigJson,
              easJson: githubCtx.easJson,
              appPath: githubCtx.appPath,
            },
          }
        : {}),
    };

    try {
      const streamUrl = `${apiBase}/api/chat/stream`;
      const r = await fetch(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (r.status === 501) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
        setError(
          [j.error, j.hint].filter(Boolean).join(" — ") ||
            "No LLM key: set OPENAI_API_KEY or NVIDIA_API_KEY on the API, or add BYOK in the sidebar."
        );
        return;
      }

      if (!r.ok) {
        const streamErr = await getErrorMessageFromResponse(r, "POST /api/chat/stream");
        if (r.status === 404 || r.status === 405) {
          setError(streamErr);
          return;
        }
        try {
          await sendChatFallback(body);
          return;
        } catch {
          setError(streamErr);
          return;
        }
      }

      const ct = r.headers.get("content-type") || "";
      const looksLikeSse = /event-stream/i.test(ct) || (ct === "" && r.body);
      if (!looksLikeSse || !r.body) {
        await sendChatFallback(body);
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      try {
        await parseSSEStream(
          r,
          (chunk) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { role: "assistant", content: last.content + chunk };
              }
              return copy;
            });
          },
          ({ proposedSpec, specValidationError: sve, tokenUsage: tu }) => {
            setSpecValidationError(sve ?? null);
            if (tu && typeof tu.totalTokens === "number") {
              recordChatUsage(tu);
            }
            if (proposedSpec) {
              setPendingSpec(proposedSpec);
              setToast("Valid App Spec received — Apply or Apply & preview.");
            } else if (sve) {
              setToast("JSON block didn’t pass schema — see Copilot reply.");
            }
          }
        );
      } catch {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant" && last.content === "") return m.slice(0, -1);
          return m;
        });
        await sendChatFallback(body);
      }
    } catch {
      try {
        await sendChatFallback(body);
      } catch (err2) {
        const raw = err2 instanceof Error ? err2.message : String(err2);
        const hint =
          /failed to fetch|networkerror|load failed/i.test(raw) || err2 instanceof TypeError
            ? " Is the API running? Try: npm run dev:platform"
            : "";
        setError(raw + hint);
      }
    } finally {
      setChatLoading(false);
    }
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || chatLoading) return;

    const bare = tryParseBareApiKey(text);
    if (bare) {
      setLlmSettings((s) => ({ ...s, apiKey: bare.apiKey, provider: bare.provider }));
      setInput("");
      setToast("API key saved for this session — send a message to start chatting.");
      return;
    }

    const serverHasLlmKey = Boolean(apiCaps?.serverOpenAiKey || apiCaps?.serverNvidiaKey);
    if (apiCaps && !serverHasLlmKey && !llmSettings.apiKey.trim()) {
      setError(
        'Add your API key in the sidebar under “Bring your own API key”, or set OPENAI_API_KEY or NVIDIA_API_KEY on the API server.'
      );
      return;
    }

    setInput("");
    setError(null);
    setSpecValidationError(null);

    stickToBottomRef.current = true;
    const nextMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    await runChatFromMessages(nextMsgs);
  }

  async function regenerateLast() {
    if (chatLoading) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    const trimmed = messages.slice(0, -1);
    if (!trimmed.some((m) => m.role === "user")) return;
    stickToBottomRef.current = true;
    setMessages(trimmed);
    setError(null);
    setSpecValidationError(null);
    await runChatFromMessages(trimmed);
  }

  function applyPendingSpec() {
    if (!pendingSpec) return;
    const v = validateSpec(pendingSpec);
    if (!v.ok) {
      setError(`Proposed spec invalid:\n${v.message}`);
      return;
    }
    setSpec(stampTimes(pendingSpec as AppSpec));
    setPendingSpec(null);
    setSpecValidationError(null);
    setError(null);
    setPreviewBuildError(null);
    setToast("Spec applied.");
  }

  function applyAndPreview() {
    if (!pendingSpec) return;
    const v = validateSpec(pendingSpec);
    if (!v.ok) {
      setError(`Proposed spec invalid:\n${v.message}`);
      return;
    }
    const next = stampTimes(pendingSpec as AppSpec);
    setSpec(next);
    setPendingSpec(null);
    setSpecValidationError(null);
    setError(null);
    setPreviewBuildError(null);
    setToast("Spec applied — building preview…");
    void runPreviewWithSpec(next);
  }

  async function runPreviewWithSpec(s: AppSpec) {
    const finalSpec = stampTimes(normalizeAppSpecForSchema(s) as AppSpec);
    const v = validateSpec(finalSpec);
    if (!v.ok) {
      const msg = v.message;
      setError(msg);
      setPreviewBuildError(`Spec invalid — preview not started: ${msg}`);
      return;
    }
    setPreviewLoading(true);
    setError(null);
    setPreviewBuildError(null);
    setPreviewUrl(null);
    try {
      const r = await fetch(`${apiBase}/api/preview-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalSpec),
      });
      if (!r.ok) throw new Error(await getErrorMessageFromResponse(r, "POST /api/preview-build"));
      const j = (await r.json().catch(() => ({}))) as {
        previewId?: string;
        entry?: string;
        error?: string;
        tokenUsage?: { specJsonTokens?: number };
      };
      const id = j.previewId;
      const entry = j.entry ?? "index.html";
      if (!id) throw new Error("No previewId from server");
      if (typeof j.tokenUsage?.specJsonTokens === "number") {
        recordPreviewSpecTokens(j.tokenUsage.specJsonTokens);
      }
      setPreviewUrl(`${apiBase}/api/preview-frame/${id}/${entry}`);
      setToast("Preview ready.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPreviewBuildError(msg);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function buildPreview() {
    await runPreviewWithSpec(specCanonical);
  }

  async function copyPreviewLink() {
    if (!previewAbsUrl) return;
    try {
      await navigator.clipboard.writeText(previewAbsUrl);
      setToast("Link copied — open on your phone (same Wi‑Fi if using LAN IP).");
    } catch {
      setToast("Could not copy — select the URL below manually.");
    }
  }

  function clearChat() {
    stopStudioSpeech();
    setTtsPlayingIndex(null);
    setMessages([
      {
        role: "assistant",
        content: `[Discovery]
Clean slate — chat’s empty, your spec file’s whatever you left it. What are we building, and who’s actually going to use it? (Need the full Expo project + editor? That’s **Project build**.)`,
      },
    ]);
    setError(null);
    setPreviewBuildError(null);
    setSpecValidationError(null);
  }

  function eraseLocalStudioHistory() {
    stopStudioSpeech();
    setTtsPlayingIndex(null);
    clearStudioPersisted();
    setMessages(STUDIO_DEFAULT_WELCOME_MESSAGES);
    setSpec(initialSpec);
    setPendingSpec(null);
    setSpecValidationError(null);
    setPreviewBuildError(null);
    setError(null);
    setToast("Saved chat and spec on this device were cleared.");
  }

  const openDetailsId = useCallback((id: string) => {
    if (id === "studio-spec-json") {
      setSpecJsonExpanded(true);
      requestAnimationFrame(() => {
        document.getElementById("studio-spec-json")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }
    const el = document.getElementById(id);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, []);

  /** Nested scroll (sidebar rail + inner scroll) — ensure expanded panels scroll into view */
  const onSidebarDetailsToggle = useCallback((ev: SyntheticEvent<HTMLDetailsElement>) => {
    const d = ev.currentTarget;
    if (!d.open) return;
    requestAnimationFrame(() => {
      d.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const userTurnCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);
  const thinking =
    chatLoading &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "assistant" &&
    !messages[messages.length - 1]?.content.trim();

  useLayoutEffect(() => {
    if (chatLoading) {
      scrollFeedToLatest();
      return;
    }
    if (!stickToBottomRef.current) return;
    scrollFeedToLatest();
  }, [messages, chatLoading, thinking, scrollFeedToLatest]);

  function newTask() {
    clearChat();
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function shareStudio() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast("Link copied.");
    } catch {
      setToast("Could not copy link.");
    }
  }

  return (
    <div className="app-shell studio-mv2">
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
          <button type="button" className="studio-mv2-nav-item" onClick={() => newTask()}>
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
          <button type="button" className="studio-mv2-task-pill" onClick={() => void setPreviewOpen(true)} disabled={!specCheck.ok}>
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
                onClick={() =>
                  void loadGithubContext({ repo: p.repo, ref: p.ref ?? "", appPath: p.appPath ?? "" })
                }
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
              {githubCtx.appPath ? (
                <span className="studio-github-meta"> · path: {githubCtx.appPath}</span>
              ) : null}
              {githubCtx.expoConfig ? (
                <span className="studio-github-meta"> · Expo config</span>
              ) : null}
              {githubCtx.tsconfigJson ? <span className="studio-github-meta"> · tsconfig</span> : null}
              {githubCtx.easJson ? <span className="studio-github-meta"> · EAS</span> : null}
              {githubCtx.babelConfig ? <span className="studio-github-meta"> · Babel</span> : null}
              {githubCtx.metroConfig ? <span className="studio-github-meta"> · Metro</span> : null}
              {githubCtx.description ? ` — ${githubCtx.description.slice(0, 160)}${githubCtx.description.length > 160 ? "…" : ""}` : ""}
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

      <div className="studio-mv2-main">
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
              Spec{" "}
              {!specCheck.ok ? "fix" : specValidationError ? "JSON" : "ok"}
            </span>
            <button type="button" className="studio-mv2-bell" title="Notifications" aria-label="Notifications" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </button>
            <button
              type="button"
              className="studio-mv2-preview-cta"
              onClick={() => void setPreviewOpen(true)}
              disabled={!specCheck.ok}
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
              title="Eight teammates in a conference room — they talk to each other"
              onClick={(e) => {
                if (onOpenTeamRoom) {
                  e.preventDefault();
                  onOpenTeamRoom();
                }
              }}
            >
              Conference room
            </a>
            {apiCaps?.chat && sessionLlm.turns > 0 && (
              <span className="studio-mv2-tok-pill" title="Session tokens (estimate)">
                <span className="studio-mv2-tok-spark" aria-hidden>
                  ✦
                </span>
                {sessionLlm.total.toLocaleString()}
              </span>
            )}
            <button type="button" className="studio-mv2-icon-txt" onClick={() => void shareStudio()} title="Copy page link">
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
                  onClick={() => void regenerateLast()}
                >
                  Regenerate last
                </button>
                <button type="button" onClick={clearChat}>
                  Reset chat
                </button>
                <button type="button" onClick={eraseLocalStudioHistory} title="Removes locally saved transcript and spec snapshot">
                  Clear saved history (this device)
                </button>
                <p className="studio-mv2-menu-pipeline-title">Your team</p>
                <ul className="studio-mv2-menu-pipeline">
                  {STUDIO_AGENTS.map((a) => (
                    <li key={a.id}>
                      <strong className="studio-mv2-menu-team-name">
                        {a.fullName}
                        <span className="studio-mv2-menu-team-title"> — {a.title}</span>
                      </strong>
                      <span className="studio-mv2-menu-team-blurb">{a.blurb}</span>
                      <span className="studio-mv2-menu-team-personality">{a.personality}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        </header>

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
                  (Monaco + full file tree + ZIP). Otherwise: describe the app,{" "}
                  <strong>Apply</strong>, <strong>Preview</strong>.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`studio-mv2-turn studio-mv2-turn--${m.role}`}>
                {m.role === "assistant" ? (
                  <div className="studio-mv2-assistant">
                    <div className="studio-mv2-assistant-head">
                      <div className="studio-mv2-assistant-brand">REACTIVE Copilot</div>
                      {isBrowserTtsAvailable() && (
                        <button
                          type="button"
                          className="studio-mv2-listen"
                          aria-label={ttsPlayingIndex === i ? "Stop listening" : "Listen to the team (browser voices)"}
                          disabled={Boolean(chatLoading && i === messages.length - 1)}
                          title="Uses your browser’s built-in text-to-speech (device-local, no REACTIVE API usage)"
                          onClick={() =>
                            toggleAssistantListen(i, stripStudioHandwrittenCodeFences(m.content || ""))
                          }
                        >
                          {ttsPlayingIndex === i ? "Stop" : "Listen"}
                        </button>
                      )}
                    </div>
                    <AssistantContent
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
                  <button type="button" className="studio-mv2-btn-secondary" onClick={applyPendingSpec}>
                    Apply
                  </button>
                  <button type="button" className="studio-mv2-btn-primary" onClick={applyAndPreview}>
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
                      void sendChat();
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
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
                      onClick={() => void sendChat()}
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
      </div>

      {previewOpen && (
        <>
          <button
            type="button"
            className="studio-mv2-scrim"
            aria-label="Close preview"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="studio-mv2-drawer" role="dialog" aria-modal="true" aria-labelledby="studio-preview-title">
            <div className="studio-mv2-drawer-head">
              <h2 id="studio-preview-title">Expo web preview</h2>
              <div className="studio-mv2-drawer-actions">
                <button
                  type="button"
                  className="studio-mv2-btn-primary"
                  disabled={previewLoading || !specCheck.ok}
                  onClick={() => void buildPreview()}
                >
                  {previewLoading ? "Building…" : "Build preview"}
                </button>
                <button type="button" className="studio-mv2-drawer-x" onClick={() => setPreviewOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </div>
            <div className="studio-mv2-drawer-body">
              {/*
               Only use a 2-column grid when the QR aside is mounted; otherwise CSS Grid still
               reserves the second track and the preview column stays artificially narrow.
               */}
              <div
                className={`studio-preview-split studio-mv2-drawer-split${
                  previewAbsUrl && !previewLoading ? " studio-preview-split--with-qr" : ""
                }`}
              >
                <div className="studio-preview-frame-col">
                  <div className="studio-frame-wrap studio-mv2-frame">
                    {previewLoading && (
                      <div className="studio-preview-overlay">
                        <div className="studio-preview-spinner" aria-hidden />
                        <p>{PREVIEW_PHASES[previewPhase]}</p>
                      </div>
                    )}
                    {previewUrl ? (
                      <iframe
                        title="Expo web preview"
                        className="studio-frame"
                        src={previewUrl}
                        sandbox="allow-scripts allow-same-origin allow-forms"
                      />
                    ) : (
                      !previewLoading && (
                        <div className="studio-frame-placeholder">
                          <p className="studio-frame-placeholder-title">No preview yet</p>
                          <ol className="studio-frame-steps">
                            <li>
                              Fix any <strong>Spec</strong> issues in the sidebar or chat, then <strong>Apply</strong>.
                            </li>
                            <li>
                              Tap <strong>Build preview</strong> above — first run can take a few minutes.
                            </li>
                          </ol>
                        </div>
                      )
                    )}
                  </div>
                </div>
                {previewAbsUrl && !previewLoading && (
                  <aside className="studio-qr-aside studio-mv2-qr" aria-label="Phone preview">
                    {showLocalhostQrHint && (
                      <div className="studio-qr-warn">
                        <strong>Localhost.</strong> Use your LAN IP so the QR works on Wi‑Fi.
                      </div>
                    )}
                    {qrDataUrl && (
                      <div className="studio-qr-wrap">
                        <img
                          src={qrDataUrl}
                          width={200}
                          height={200}
                          alt="QR code for preview URL"
                          className="studio-qr-img"
                        />
                      </div>
                    )}
                    <button type="button" className="btn studio-qr-copy" onClick={() => void copyPreviewLink()}>
                      Copy preview link
                    </button>
                    <div className="studio-qr-url">
                      <code>{previewAbsUrl}</code>
                    </div>
                  </aside>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
