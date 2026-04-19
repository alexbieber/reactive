import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import type { AppSpec } from "./types";
import { previewAbsoluteUrl } from "./previewAbsoluteUrl";
import {
  clearStudioPersisted,
  getHydratedStudioState,
  saveStudioPersisted,
  STUDIO_DEFAULT_WELCOME_MESSAGES,
} from "./studioPersist";
import { ensureTtsVoicesLoaded, speakAssistantContent, stopStudioSpeech } from "./studioTts";
import { speakTeamOpenAiNeuralAsync, stopNeuralTeamSpeech } from "./neuralTeamTts";
import { preloadKokoroTts, speakTeamKokoroAsync, stopKokoroTeamSpeech } from "./kokoroTeamTts";
import {
  loadOpenAiVoiceKeyOnly,
  loadVoiceEngine,
  saveOpenAiVoiceKeyOnly,
  saveVoiceEngine,
  type VoiceEngineId,
} from "./voiceEnginePrefs";
import {
  buildLlmRequestFields,
  inferProviderFromKey,
  loadStudioLlm,
  sanitizeLlmApiKey,
  saveStudioLlm,
  tryParseBareApiKey,
  type StudioLlmSettings,
} from "./studioLlm";
import { normalizeAppSpecForSchema, stampTimes, validateSpec } from "./validateSpec";
import { getErrorMessageFromResponse } from "./apiFetchErrors";
import QRCode from "qrcode";
import { PREVIEW_PHASES } from "./studio/studioConstants";
import { parseSSEStream } from "./studio/studioChatStream";
import type { ChatTokenUsage, GithubContextPayload, StudioMsg, StudioShellProps } from "./studio/studioTypes";
import { StudioMainStage } from "./studio/StudioMainStage";
import { StudioPreviewDrawer } from "./studio/StudioPreviewDrawer";
import { StudioSidebar } from "./studio/StudioSidebar";
import { StudioTopBar } from "./studio/StudioTopBar";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

export default function Studio({ initialSpec, onBack, onOpenProjectBuild, onOpenTeamRoom }: StudioShellProps) {
  const [boot] = useState(() => getHydratedStudioState(initialSpec));
  const [spec, setSpec] = useState<AppSpec>(boot.spec);
  const [messages, setMessages] = useState<StudioMsg[]>(boot.messages);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPhase, setPreviewPhase] = useState(0);
  const [previewSnackFiles, setPreviewSnackFiles] = useState<{ path: string; content: string }[] | null>(null);
  const [studioSnackKey, setStudioSnackKey] = useState(0);
  const [expoGoUrl, setExpoGoUrl] = useState<string | null>(null);
  const [snackPreviewReady, setSnackPreviewReady] = useState(false);
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
  const feedEndRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [specJsonExpanded, setSpecJsonExpanded] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineId>(() => loadVoiceEngine());
  const [openaiVoiceKeyOnly, setOpenaiVoiceKeyOnly] = useState(() => loadOpenAiVoiceKeyOnly());
  const [ttsPlayingIndex, setTtsPlayingIndex] = useState<number | null>(null);
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

  const buildTtsRequestBody = useCallback(() => {
    const base = buildLlmRequestFields(llmSettings);
    const out: Record<string, unknown> = { ...base };
    const only = sanitizeLlmApiKey(openaiVoiceKeyOnly);
    if (only && inferProviderFromKey(sanitizeLlmApiKey(llmSettings.apiKey)) !== "openai") {
      out.openaiTtsApiKey = only;
    }
    return out;
  }, [llmSettings, openaiVoiceKeyOnly]);

  const stopAllAssistantTts = useCallback(() => {
    stopStudioSpeech();
    stopNeuralTeamSpeech();
    stopKokoroTeamSpeech();
  }, []);

  const toggleAssistantListen = useCallback(
    (messageIndex: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed === "\u00a0") return;
      if (ttsPlayingIndex === messageIndex) {
        stopAllAssistantTts();
        setTtsPlayingIndex(null);
        return;
      }
      stopAllAssistantTts();
      setTtsPlayingIndex(messageIndex);

      if (voiceEngine === "openai") {
        void (async () => {
          try {
            await speakTeamOpenAiNeuralAsync(trimmed, {
              apiBase,
              buildBody: buildTtsRequestBody,
              onEnd: () => {
                setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setToast(`Neural voice: ${msg} — switch to Browser or add an OpenAI key.`);
            setTtsPlayingIndex(null);
          }
        })();
        return;
      }

      if (voiceEngine === "kokoro") {
        void (async () => {
          try {
            await speakTeamKokoroAsync(trimmed, {
              onEnd: () => {
                setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setToast(`Kokoro voice: ${msg} — try Chrome or Edge, or switch to Browser.`);
            setTtsPlayingIndex(null);
          }
        })();
        return;
      }

      speakAssistantContent(text, {
        onEnd: () => {
          setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
        },
      });
    },
    [ttsPlayingIndex, voiceEngine, apiBase, buildTtsRequestBody, stopAllAssistantTts]
  );

  useEffect(() => {
    void ensureTtsVoicesLoaded();
    return () => {
      stopStudioSpeech();
      stopNeuralTeamSpeech();
      stopKokoroTeamSpeech();
    };
  }, []);

  useEffect(() => {
    saveVoiceEngine(voiceEngine);
  }, [voiceEngine]);

  useEffect(() => {
    saveOpenAiVoiceKeyOnly(openaiVoiceKeyOnly);
  }, [openaiVoiceKeyOnly]);

  useEffect(() => {
    if (voiceEngine === "kokoro") preloadKokoroTts();
  }, [voiceEngine]);

  const previewAbsUrl = expoGoUrl ? previewAbsoluteUrl(expoGoUrl) : null;
  const showLocalhostQrHint = false;
  const previewBusy =
    previewLoading ||
    (Boolean(previewSnackFiles?.length) && studioSnackKey > 0 && !snackPreviewReady);
  const specCanonical = useMemo(() => normalizeAppSpecForSchema(spec), [spec]);
  const specCheck = useMemo(() => validateSpec(spec), [spec]);
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
    if (!previewBusy) {
      setPreviewPhase(0);
      return;
    }
    const id = setInterval(() => {
      setPreviewPhase((p) => (p + 1) % PREVIEW_PHASES.length);
    }, 2800);
    return () => clearInterval(id);
  }, [previewBusy]);

  useEffect(() => {
    if (!previewAbsUrl || previewBusy) {
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
  }, [previewAbsUrl, previewBusy]);

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

  async function runChatFromMessages(nextMsgs: StudioMsg[]) {
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
    const nextMsgs: StudioMsg[] = [...messages, { role: "user", content: text }];
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
    setSnackPreviewReady(false);
    setExpoGoUrl(null);
    setError(null);
    setPreviewBuildError(null);
    try {
      const r = await fetch(`${apiBase}/api/preview-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalSpec),
      });
      if (!r.ok) throw new Error(await getErrorMessageFromResponse(r, "POST /api/preview-build"));
      const j = (await r.json().catch(() => ({}))) as {
        files?: { path: string; content: string }[];
        error?: string;
        tokenUsage?: { specJsonTokens?: number };
      };
      if (!j.files?.length) throw new Error("No source files from server — preview cannot load.");
      if (typeof j.tokenUsage?.specJsonTokens === "number") {
        recordPreviewSpecTokens(j.tokenUsage.specJsonTokens);
      }
      setPreviewSnackFiles(j.files);
      setStudioSnackKey((k) => k + 1);
      setToast("Preview loading in Snack…");
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
    stopAllAssistantTts();
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
    stopAllAssistantTts();
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
      <StudioSidebar
        onBack={onBack}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        onNewTask={newTask}
        onOpenProjectBuild={onOpenProjectBuild}
        openDetailsId={openDetailsId}
        inputRef={inputRef}
        specCheckOk={specCheck.ok}
        onOpenPreview={() => void setPreviewOpen(true)}
        onSidebarDetailsToggle={onSidebarDetailsToggle}
        llmSettings={llmSettings}
        setLlmSettings={setLlmSettings}
        voiceEngine={voiceEngine}
        setVoiceEngine={setVoiceEngine}
        openaiVoiceKeyOnly={openaiVoiceKeyOnly}
        setOpenaiVoiceKeyOnly={setOpenaiVoiceKeyOnly}
        githubRepoInput={githubRepoInput}
        setGithubRepoInput={setGithubRepoInput}
        githubRefInput={githubRefInput}
        setGithubRefInput={setGithubRefInput}
        githubAppPathInput={githubAppPathInput}
        setGithubAppPathInput={setGithubAppPathInput}
        githubLoading={githubLoading}
        githubErr={githubErr}
        githubCtx={githubCtx}
        setGithubCtx={setGithubCtx}
        setGithubErr={setGithubErr}
        loadGithubContext={loadGithubContext}
        setToast={setToast}
        specJsonExpanded={specJsonExpanded}
        setSpecJsonExpanded={setSpecJsonExpanded}
        specCanonical={specCanonical}
        apiCaps={apiCaps}
        lastChatUsage={lastChatUsage}
        sessionLlm={sessionLlm}
        sessionPreview={sessionPreview}
      />

      <div className="studio-mv2-main">
        <StudioTopBar
          llmSettings={llmSettings}
          setLlmSettings={setLlmSettings}
          apiCaps={apiCaps}
          specPillOk={specPillOk}
          specPillTitle={specPillTitle}
          specCheckOk={specCheck.ok}
          specValidationError={specValidationError}
          onOpenPreview={() => void setPreviewOpen(true)}
          onOpenProjectBuild={onOpenProjectBuild}
          onOpenTeamRoom={onOpenTeamRoom}
          sessionLlmTotal={sessionLlm.total}
          sessionLlmTurns={sessionLlm.turns}
          onShare={() => void shareStudio()}
          chatLoading={chatLoading}
          messages={messages}
          onRegenerateLast={() => void regenerateLast()}
          onClearChat={clearChat}
          onEraseLocalHistory={eraseLocalStudioHistory}
        />

        <StudioMainStage
          error={error}
          specValidationError={specValidationError}
          toast={toast}
          listRef={listRef}
          onFeedScroll={onFeedScroll}
          userTurnCount={userTurnCount}
          messages={messages}
          chatLoading={chatLoading}
          thinking={thinking}
          feedEndRef={feedEndRef}
          voiceEngine={voiceEngine}
          ttsPlayingIndex={ttsPlayingIndex}
          onToggleListen={toggleAssistantListen}
          onOpenProjectBuild={onOpenProjectBuild}
          pendingSpec={Boolean(pendingSpec)}
          onApplyPending={applyPendingSpec}
          onApplyAndPreview={applyAndPreview}
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          onSendChat={sendChat}
        />
      </div>

      <StudioPreviewDrawer
        previewOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        previewBusy={previewBusy}
        previewPhase={previewPhase}
        snackKey={studioSnackKey}
        snackFiles={previewSnackFiles}
        previewAbsUrl={previewAbsUrl}
        specCheckOk={specCheck.ok}
        qrDataUrl={qrDataUrl}
        showLocalhostQrHint={showLocalhostQrHint}
        splitWithQr={Boolean(previewAbsUrl && !previewBusy)}
        onBuildPreview={() => void buildPreview()}
        onCopyPreviewLink={() => void copyPreviewLink()}
        onSnackReady={() => setSnackPreviewReady(true)}
        onSnackError={(msg) => {
          setPreviewBuildError(msg);
          setSnackPreviewReady(true);
        }}
        onExpoGoUrl={setExpoGoUrl}
      />
    </div>
  );
}
