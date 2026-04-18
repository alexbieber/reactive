import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BrandLogo from "./BrandLogo";
import type { AppSpec } from "./types";
import { isLocalhostHost, previewAbsoluteUrl } from "./previewAbsoluteUrl";
import { parseAgentMessage, STUDIO_AGENTS } from "./studioAgents";
import { STUDIO_QUICK_PROMPTS } from "./studioQuickActions";
import {
  buildLlmRequestFields,
  inferProviderFromKey,
  LLM_PROVIDERS,
  loadStudioLlm,
  saveStudioLlm,
  tryParseBareApiKey,
  type StudioLlmSettings,
} from "./studioLlm";
import { GITHUB_CONTEXT_PRESETS } from "./studioGithubPresets";
import { stampTimes, validateSpec } from "./validateSpec";
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

function AssistantContent({ content }: { content: string }) {
  const { agentId, body } = useMemo(() => parseAgentMessage(content), [content]);
  const [copied, setCopied] = useState(false);
  const copyReply = useCallback(async () => {
    try {
      await navigator.clipboard.writeText((body || content).trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied */
    }
  }, [body, content]);

  const md = body || "\u00a0";
  const showCopy = Boolean(content) && content !== "…";

  return (
    <>
      {agentId && (
        <span className={`studio-agent-badge studio-agent-badge--${agentId.toLowerCase()}`}>{agentId}</span>
      )}
      <div className="studio-msg-md-wrap">
        <div className="studio-msg-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
            p: ({ children }) => <p className="studio-msg-md-p">{children}</p>,
            ul: ({ children }) => <ul className="studio-msg-md-ul">{children}</ul>,
            ol: ({ children }) => <ol className="studio-msg-md-ol">{children}</ol>,
            li: ({ children }) => <li className="studio-msg-md-li">{children}</li>,
            strong: ({ children }) => <strong>{children}</strong>,
            a: ({ href, children }) => (
              <a href={href} className="studio-msg-md-a" target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
            pre: ({ children }) => <pre className="studio-msg-md-pre">{children}</pre>,
            code: ({ className, children, ...props }) => {
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
          }}
          >
            {md}
          </ReactMarkdown>
        </div>
        {showCopy && (
          <button type="button" className="studio-msg-copy" onClick={() => void copyReply()}>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </>
  );
}

type Props = {
  initialSpec: AppSpec;
  onBack: () => void;
};

const PREVIEW_PHASES = [
  "Validating spec & generating project…",
  "Installing dependencies (npm)…",
  "Bundling Expo web export…",
  "Almost ready…",
] as const;

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
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (;;) {
      const i = buf.indexOf("\n\n");
      if (i < 0) break;
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = raw.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let j: {
        type?: string;
        text?: string;
        fullText?: string;
        proposedSpec?: AppSpec | null;
        specValidationError?: string | null;
        tokenUsage?: ChatTokenUsage;
        message?: string;
      };
      try {
        j = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (j.type === "delta" && typeof j.text === "string") onDelta(j.text);
      if (j.type === "done") {
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
    }
  }
}

export default function Studio({ initialSpec, onBack }: Props) {
  const [spec, setSpec] = useState<AppSpec>(initialSpec);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: `[Discovery]
**Recon** — What problem, who uses it daily, and what “done” looks like. I’ll ask until we can draft a **schema-valid App Spec** — then you **Apply** and **Build preview** (real Expo web export).

**Keys:** \`OPENAI_API_KEY\` or \`NVIDIA_API_KEY\` on the API, or expand **Bring your own API key** below. Paste a bare key in the box once to save it for this browser.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPhase, setPreviewPhase] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingSpec, setPendingSpec] = useState<AppSpec | null>(null);
  const [specValidationError, setSpecValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [apiCaps, setApiCaps] = useState<{
    chat: boolean;
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

  const previewAbsUrl = previewUrl ? previewAbsoluteUrl(previewUrl) : null;
  const showLocalhostQrHint = Boolean(previewAbsUrl && isLocalhostHost());
  const specCheck = useMemo(() => validateSpec(spec), [spec]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/health`);
        const j = (await r.json()) as {
          capabilities?: { chat?: boolean; serverOpenAiKey?: boolean; serverNvidiaKey?: boolean };
          openaiModel?: string;
          nvidiaModel?: string;
        };
        if (!cancelled)
          setApiCaps({
            chat: Boolean(j.capabilities?.chat),
            openaiModel: typeof j.openaiModel === "string" ? j.openaiModel : undefined,
            nvidiaModel: typeof j.nvidiaModel === "string" ? j.nvidiaModel : undefined,
            serverOpenAiKey: Boolean(j.capabilities?.serverOpenAiKey),
            serverNvidiaKey: Boolean(j.capabilities?.serverNvidiaKey),
          });
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

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

  const scrollChat = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
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
    scrollChat();
  }

  async function runChatFromMessages(nextMsgs: Msg[]) {
    setChatLoading(true);
    const body = {
      messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      spec,
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
            "No LLM key: set OPENAI_API_KEY or NVIDIA_API_KEY on the API, or add BYOK below."
        );
        return;
      }

      if (!r.ok) {
        await sendChatFallback(body);
        return;
      }

      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("event-stream") || !r.body) {
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
            scrollChat();
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
            scrollChat();
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
        'Add your API key under “Bring your own API key”, or set OPENAI_API_KEY or NVIDIA_API_KEY on the API server.'
      );
      return;
    }

    setInput("");
    setError(null);
    setSpecValidationError(null);

    const nextMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    scrollChat();
    await runChatFromMessages(nextMsgs);
  }

  async function regenerateLast() {
    if (chatLoading) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    const trimmed = messages.slice(0, -1);
    if (!trimmed.some((m) => m.role === "user")) return;
    setMessages(trimmed);
    setError(null);
    setSpecValidationError(null);
    scrollChat();
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
    setToast("Spec applied — building preview…");
    void runPreviewWithSpec(next);
  }

  async function runPreviewWithSpec(s: AppSpec) {
    const finalSpec = stampTimes(s);
    const v = validateSpec(finalSpec);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    setPreviewLoading(true);
    setError(null);
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function buildPreview() {
    await runPreviewWithSpec(spec);
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
    setMessages([
      {
        role: "assistant",
        content: `[Discovery]
**Recon** — Fresh pass. What problem, who uses it daily, and what does “done” look like? (Chat reset — your App Spec is unchanged until you Apply.)`,
      },
    ]);
    setError(null);
    setSpecValidationError(null);
  }

  return (
    <div className="app-shell studio-shell">
      <div className="brand brand-row brand-row--logo">
        <div className="brand-lockup">
          <BrandLogo variant="studio" />
          <div className="brand-lockup-text">
            <h1>Studio</h1>
            <span className="brand-lockup-sub">Copilot · preview</span>
          </div>
        </div>
        <button type="button" className="btn link-back" onClick={onBack}>
          ← Home
        </button>
      </div>

      <p className="tagline studio-lead">
        <strong>Loop:</strong> copilot chat → valid <strong>App Spec</strong> → <strong>Apply</strong> → <strong>Build preview</strong> → ZIP from the wizard. Keys:{" "}
        <code className="inline-code">OPENAI_API_KEY</code> or <code className="inline-code">NVIDIA_API_KEY</code> on the API or BYOK below.
      </p>

      <div className="studio-status-strip" aria-label="What blocks the loop">
        <span className={`studio-pill ${apiCaps == null ? "studio-pill--muted" : "studio-pill--ok"}`}>
          {apiCaps == null ? "API …" : "API OK"}
        </span>
        <span className={`studio-pill ${specCheck.ok ? "studio-pill--ok" : "studio-pill--warn"}`} title="Current App Spec must validate before a reliable preview">
          Spec {specCheck.ok ? "valid" : "needs fix"}
        </span>
        {apiCaps?.serverOpenAiKey || apiCaps?.serverNvidiaKey ? (
          <>
            <span className="studio-pill studio-pill--ok" title="Server can call the model without BYOK">
              Server key
            </span>
            {apiCaps.serverOpenAiKey && apiCaps.openaiModel && (
              <span className="studio-pill studio-pill--muted" title="Default model when using the server OpenAI key (OPENAI_MODEL)">
                {apiCaps.openaiModel}
              </span>
            )}
            {apiCaps.serverNvidiaKey && apiCaps.nvidiaModel && (
              <span className="studio-pill studio-pill--muted" title="Default model when using the server NVIDIA key (NVIDIA_MODEL)">
                {apiCaps.nvidiaModel}
              </span>
            )}
          </>
        ) : (
          <span className="studio-pill studio-pill--muted" title="Set OPENAI_API_KEY or NVIDIA_API_KEY on the API or use BYOK">
            No server key
          </span>
        )}
        <span
          className={`studio-pill ${llmSettings.apiKey.trim() ? "studio-pill--ok" : "studio-pill--muted"}`}
          title={
            apiCaps?.serverOpenAiKey || apiCaps?.serverNvidiaKey
              ? "Optional override — browser key is used when set"
              : "Required for chat unless the API has a server key"
          }
        >
          {llmSettings.apiKey.trim() ? "BYOK set" : "No BYOK"}
        </span>
      </div>

      {apiCaps?.chat && (
        <div className="studio-token-meter">
          <div className="studio-token-meter-title">Token consumption (estimated)</div>

          {lastChatUsage && (
            <div
              className="studio-token-block"
              aria-label={`Last copilot reply: ${lastChatUsage.promptTokens} input tokens, ${lastChatUsage.completionTokens} output tokens`}
            >
              <div className="studio-token-block-head">
                <span className="studio-token-block-label">Last copilot reply</span>
                <span className="studio-token-block-model" title={lastChatUsage.estimate}>
                  {lastChatUsage.model}
                </span>
              </div>
              <div className="studio-token-io-pair">
                <div
                  className="studio-token-io-box studio-token-io-box--in"
                  title="Input: system prompt + your conversation history sent to the model"
                >
                  <span className="studio-token-io-k">Input</span>
                  <span className="studio-token-io-n">{lastChatUsage.promptTokens.toLocaleString()}</span>
                  <span className="studio-token-io-unit">tokens</span>
                </div>
                <div
                  className="studio-token-io-box studio-token-io-box--out"
                  title="Output: text generated in this reply"
                >
                  <span className="studio-token-io-k">Output</span>
                  <span className="studio-token-io-n">{lastChatUsage.completionTokens.toLocaleString()}</span>
                  <span className="studio-token-io-unit">tokens</span>
                </div>
              </div>
              {lastChatUsage.estimate ? (
                <p className="studio-token-meter-warn">{lastChatUsage.estimate}</p>
              ) : null}
            </div>
          )}

          <div
            className="studio-token-block"
            aria-label={`Session copilot totals: ${sessionLlm.prompt} input, ${sessionLlm.completion} output`}
          >
            <span className="studio-token-block-label">This session (all copilot turns)</span>
            {sessionLlm.turns === 0 ? (
              <p className="studio-token-meter-empty">No copilot turns yet — input/output appear after each reply.</p>
            ) : (
              <>
                <div className="studio-token-io-pair">
                  <div
                    className="studio-token-io-box studio-token-io-box--in"
                    title="Sum of input tokens across every copilot request this session"
                  >
                    <span className="studio-token-io-k">Input</span>
                    <span className="studio-token-io-n">{sessionLlm.prompt.toLocaleString()}</span>
                    <span className="studio-token-io-unit">tokens (sum)</span>
                  </div>
                  <div
                    className="studio-token-io-box studio-token-io-box--out"
                    title="Sum of output tokens across every copilot reply this session"
                  >
                    <span className="studio-token-io-k">Output</span>
                    <span className="studio-token-io-n">{sessionLlm.completion.toLocaleString()}</span>
                    <span className="studio-token-io-unit">tokens (sum)</span>
                  </div>
                </div>
                <p className="studio-token-meter-meta">
                  {sessionLlm.turns} turn(s) · {sessionLlm.total.toLocaleString()} tokens total (input + output)
                </p>
              </>
            )}
          </div>

          <div className="studio-token-block studio-token-block--compact">
            <span className="studio-token-block-label">Preview build (no LLM)</span>
            <p className="studio-token-block-preview">
              {sessionPreview.builds === 0
                ? "Build a preview to count App Spec JSON size in tokens."
                : `${sessionPreview.builds} build(s) · ~${sessionPreview.specTokens.toLocaleString()} tokens (spec JSON, summed)`}
            </p>
          </div>

          <p className="studio-token-meter-note">
            Counts use <code className="inline-code">gpt-tokenizer</code> (gpt-4o-mini / o200k). Provider billing may use a
            different tokenizer.
          </p>
        </div>
      )}

      <details className="studio-byok">
        <summary>Bring your own API key (OpenAI, Claude, Gemini, Groq, Mistral, NVIDIA NIM)</summary>
        <div className="studio-byok-body">
          <p className="studio-byok-lead">
            Stored in this browser (session by default). Requests go to <strong>your</strong> provider through this app’s
            API — not to us for training. For production, prefer a server-side key or proxy.
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
            <strong>Tip:</strong> paste a bare key into the chat box once — we’ll detect the provider and save it here.{" "}
            {LLM_PROVIDERS.find((x) => x.id === llmSettings.provider)?.hint}
          </p>
        </div>
      </details>

      <details className="studio-github">
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

      {error && <div className="error-banner">{error}</div>}
      {specValidationError && (
        <div className="error-banner" style={{ borderColor: "rgba(234, 179, 8, 0.45)", color: "#fcd34d" }}>
          Schema check: {specValidationError}
        </div>
      )}

      {toast && <div className="studio-toast">{toast}</div>}

      <div className="studio-grid">
        <section className="studio-panel studio-chat">
          <div className="studio-panel-head">
            <div className="studio-panel-head-title">
              <h2>Copilot</h2>
              <span className="studio-panel-head-sub">Chat → App Spec JSON → Apply → Preview</span>
            </div>
            <div className="studio-panel-head-actions">
              <button
                type="button"
                className="btn ghost studio-btn-small"
                disabled={chatLoading || messages[messages.length - 1]?.role !== "assistant"}
                onClick={() => void regenerateLast()}
                title="Re-run the last assistant reply with the same conversation (after a bad answer)"
              >
                Regenerate
              </button>
              <button
                type="button"
                className="btn ghost studio-btn-small"
                onClick={clearChat}
                title="Start over in Discovery — does not change the App Spec until you Apply"
              >
                Reset chat
              </button>
            </div>
          </div>
          <div
            className="studio-pipeline"
            aria-label="Bracket tags on line 1 — hover a step for its role in the loop"
          >
            {STUDIO_AGENTS.map((a, i) => (
              <span key={a.id} className="studio-pipeline-step">
                {i > 0 && (
                  <span className="studio-pipeline-arrow" aria-hidden>
                    →
                  </span>
                )}
                <span className="studio-pipeline-label" title={`${a.codename}: ${a.blurb}`}>
                  {a.label}
                </span>
              </span>
            ))}
          </div>
          <div className="studio-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`studio-msg studio-msg--${m.role}`}>
                {m.role === "assistant" ? (
                  <AssistantContent
                    content={
                      m.content || (chatLoading && i === messages.length - 1 ? "…" : "")
                    }
                  />
                ) : (
                  <div className="studio-msg-text">{m.content}</div>
                )}
              </div>
            ))}
          </div>

          {pendingSpec && (
            <div className="studio-pending-bar" role="status">
              <div className="studio-pending-bar-text">
                <strong>Ready to apply</strong>
                <span>Valid JSON from chat — push it into the live spec, then build the preview (right).</span>
              </div>
              <div className="studio-pending-bar-actions">
                <button type="button" className="btn" onClick={applyPendingSpec}>
                  Apply spec
                </button>
                <button type="button" className="btn primary" onClick={applyAndPreview}>
                  Apply &amp; build preview
                </button>
              </div>
            </div>
          )}

          <div className="studio-quick-row" aria-label="Quick prompts">
            {STUDIO_QUICK_PROMPTS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="studio-quick-chip"
                disabled={chatLoading}
                onClick={() => setInput(p.text)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="studio-compose">
            <textarea
              value={input}
              placeholder="Describe the app or answer the copilot — goal is a valid App Spec you can Apply, then Build preview."
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
            <div className="studio-compose-actions">
              <button type="button" className="btn primary" disabled={chatLoading} onClick={() => void sendChat()}>
                {chatLoading ? "Thinking…" : "Send"}
              </button>
              <span className="studio-compose-hint" title="Enter sends; Shift+Enter adds a line">
                Enter — send · Shift+Enter — new line
              </span>
            </div>
          </div>
        </section>

        <section className="studio-panel studio-preview">
          <div className="studio-panel-head">
            <div className="studio-panel-head-title">
              <h2>Preview</h2>
              <span className="studio-panel-head-sub">Expo web export from the App Spec below</span>
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={previewLoading || !specCheck.ok}
              title={!specCheck.ok ? "Fix App Spec validation first (see strip above or JSON panel)" : "Run codegen + bundle for this spec"}
              onClick={() => void buildPreview()}
            >
              {previewLoading ? "Building…" : "Build preview"}
            </button>
          </div>
          <div className="studio-preview-split">
            <div className="studio-preview-frame-col">
              <div className="studio-frame-wrap">
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
                      <p className="studio-frame-placeholder-title">Preview after the spec is valid</p>
                      <ol className="studio-frame-steps">
                        <li>
                          <strong>Chat</strong> until the copilot emits valid App Spec JSON; use <strong>Apply</strong> in the banner.
                        </li>
                        <li>
                          <strong>Check</strong> <em>App Spec JSON</em> at the bottom — it drives codegen.
                        </li>
                        <li>
                          <strong>Build preview</strong> here (first run often 1–3 min). QR appears when the URL is reachable from your phone.
                        </li>
                      </ol>
                    </div>
                  )
                )}
              </div>
            </div>

            {previewAbsUrl && !previewLoading && (
              <aside className="studio-qr-aside" aria-label="Open preview on phone">
                {showLocalhostQrHint && (
                  <div className="studio-qr-warn">
                    <strong>Phone can’t open “localhost.”</strong> Open this site using your computer’s LAN IP (e.g.{" "}
                    <code className="inline-code">http://192.168.1.x:5173</code>) so the QR matches a URL your phone can
                    reach on Wi‑Fi. Or set <code className="inline-code">VITE_PUBLIC_PREVIEW_ORIGIN</code> in production.
                  </div>
                )}
                {qrDataUrl && (
                  <div className="studio-qr-wrap">
                    <img
                      src={qrDataUrl}
                      width={216}
                      height={216}
                      alt="QR code to open this preview on your phone"
                      className="studio-qr-img"
                    />
                  </div>
                )}
                <p className="studio-qr-lead">
                  <strong>On your phone:</strong> scan with the camera — opens the same <strong>Expo web</strong> build in
                  the browser (same UI as the desktop preview).
                </p>
                <button type="button" className="btn studio-qr-copy" onClick={() => void copyPreviewLink()}>
                  Copy preview link
                </button>
                <div className="studio-qr-url">
                  <code>{previewAbsUrl}</code>
                </div>
                <p className="studio-qr-foot">
                  <strong>Expo Go (native):</strong> download the ZIP from the wizard Review step, unzip, run{" "}
                  <code className="inline-code">npx expo start</code>, then scan the terminal QR with the Expo Go app.
                </p>
              </aside>
            )}
          </div>
        </section>
      </div>

      <details className="studio-spec-details">
        <summary>App Spec JSON — single source of truth for codegen &amp; preview</summary>
        <pre className="json-preview studio-spec-pre">{JSON.stringify(spec, null, 2)}</pre>
      </details>
    </div>
  );
}
