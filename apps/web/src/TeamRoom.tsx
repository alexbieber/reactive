import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BrandLogo from "./BrandLogo";
import {
  buildLlmRequestFields,
  inferProviderFromKey,
  LLM_PROVIDERS,
  loadStudioLlm,
  saveStudioLlm,
  sanitizeLlmApiKey,
  type StudioLlmSettings,
} from "./studioLlm";
import AgentPortrait from "./AgentPortrait";
import { STUDIO_AGENTS, type AgentBracketId, getAgentEmployeeLine, parseAgentSegments } from "./studioAgents";
import { getErrorMessageFromResponse } from "./apiFetchErrors";
import {
  ensureTtsVoicesLoaded,
  isBrowserTtsAvailable,
  speakAssistantContent,
  speakAssistantContentAsync,
  stopStudioSpeech,
} from "./studioTts";
import { speakTeamOpenAiNeuralAsync, stopNeuralTeamSpeech } from "./neuralTeamTts";
import { preloadKokoroTts, speakTeamKokoroAsync, stopKokoroTeamSpeech } from "./kokoroTeamTts";
import {
  loadOpenAiVoiceKeyOnly,
  loadVoiceEngine,
  saveOpenAiVoiceKeyOnly,
  saveVoiceEngine,
  type VoiceEngineId,
} from "./voiceEnginePrefs";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

const LS_SPACE_PREFIX = "reactive-space:";
const SHARE_JOIN_PARAM = "join";

function generateSpaceCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function formatStreamOrNetworkError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (name === "AbortError" || lower.includes("aborted")) {
    return "Stream cancelled — use Chrome, Safari, or Edge (not the Cursor/VS Code embedded preview). Paste your API key under Model API key on this page, then retry.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed") ||
    lower.includes("fetch failed")
  ) {
    return `Network error (${msg}). Start the stack with \`npm run dev:platform\` (API on 8788, Vite proxies /api). Use a normal browser window, not the embedded preview. If you set VITE_API_BASE, that origin must serve this repo’s API.`;
  }
  return msg;
}

function hasStoredLlmKey(): boolean {
  try {
    return Boolean(loadStudioLlm().apiKey.trim());
  } catch {
    return false;
  }
}

function conferenceRoomApiVersionOk(version: string): boolean {
  const m = /^(\d+)\.(\d+)/.exec(version.trim());
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 1) return true;
  return major === 1 && minor >= 3;
}

type Msg = { role: "user" | "assistant"; content: string };

const DEFAULT_TOPIC =
  "Quick space: what we’re shipping next in REACTIVE (App Spec, preview, Project build) — risks and owners.";

/** Single-turn API should return one tag; if the model returns more, keep only the first speaker block. */
function firstTaggedTurnOnly(text: string): string {
  const segs = parseAgentSegments(text);
  const tagged = segs.find((s) => s.agentId);
  if (tagged?.agentId) {
    return `[${tagged.agentId}]\n${tagged.body.trim()}`;
  }
  return text.trim().slice(0, 4000);
}

/** Max teammate lines between host messages (avoids runaway API use; host mic resets the counter). */
const MAX_ASSISTANT_BETWEEN_HOST = 48;

const mdComponents = {
  p: ({ children }: { children?: ReactNode }) => <p className="team-room-md-p">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="team-room-md-ul">{children}</ul>,
  li: ({ children }: { children?: ReactNode }) => <li className="team-room-md-li">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong>{children}</strong>,
};

function TeamBubble({ content }: { content: string }) {
  const segments = useMemo(() => parseAgentSegments(content), [content]);
  const taggedCount = useMemo(() => segments.filter((s) => s.agentId).length, [segments]);

  return (
    <div className="team-room-segments">
      {taggedCount < 2 && content.trim().length > 80 && (
        <p className="team-room__parse-hint" role="status">
          Little <code className="inline-code">[Tag]</code> structure — try <strong>Continue without me</strong> or adjust model under Model API key.
        </p>
      )}
      {segments.map((seg, i) => (
        <Fragment key={i}>
          <div className="team-room-seg">
            {seg.agentId && (
              <span className={`team-room-badge team-room-badge--${seg.agentId.toLowerCase()}`}>
                {getAgentEmployeeLine(seg.agentId) ?? seg.agentId}
              </span>
            )}
            <div className="team-room-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {seg.body || "\u00a0"}
              </ReactMarkdown>
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

type Props = {
  onBack: () => void;
  onOpenStudio: () => void;
};

type ApiProbe = "checking" | "ok" | "stale" | "offline";
type GateMode = "start" | "join";

export default function TeamRoom({ onBack, onOpenStudio }: Props) {
  const [gateMode, setGateMode] = useState<GateMode>("start");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [hostName, setHostName] = useState("You");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinHint, setJoinHint] = useState<string | null>(null);

  const [inSpace, setInSpace] = useState(false);
  const [spaceCode, setSpaceCode] = useState<string | null>(null);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [apiProbe, setApiProbe] = useState<ApiProbe>("checking");
  /** True when health has teamRoomStream but not teamRoomOneShot (old API — restart for v1.4.1+) */
  const [apiStaleMissingOneShot, setApiStaleMissingOneShot] = useState(false);
  const [apiHealthVersion, setApiHealthVersion] = useState<string | null>(null);
  const [serverHasLlmKey, setServerHasLlmKey] = useState<boolean | null>(null);
  const [hasLocalByok, setHasLocalByok] = useState(hasStoredLlmKey);
  const [llmSettings, setLlmSettings] = useState<StudioLlmSettings>(() => loadStudioLlm());
  const [showApiKey, setShowApiKey] = useState(false);
  /** True when /api/team-room/complete was used (SSE blocked, e.g. IDE embedded browser) */
  const [streamCompatMode, setStreamCompatMode] = useState(false);
  /** Local Web Speech only — same as Studio Listen */
  const [ttsPlayingIndex, setTtsPlayingIndex] = useState<number | null>(null);
  /** Which teammate is “on mic” during Listen (Spaces-style speaking indicator) */
  const [speakingAgentId, setSpeakingAgentId] = useState<AgentBracketId | null>(null);
  /** Pause auto back-and-forth (API + auto voice) without leaving */
  const [convPaused, setConvPaused] = useState(false);
  /** Host muted — “Continue without me” — server uses autonomousRound */
  const [hostMuted, setHostMuted] = useState(false);
  /** After each teammate line, speak their line with the browser (can turn off to read only) */
  const [autoPlayVoices, setAutoPlayVoices] = useState(true);
  /**
   * Browser = free Web Speech. Kokoro = on-device OSS neural (no voice API key). OpenAI = neural MP3 via `/api/tts/openai`.
   */
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineId>(loadVoiceEngine);
  /** Only when chat uses a non-OpenAI provider — optional sk-… for TTS-only */
  const [openaiVoiceKeyOnly, setOpenaiVoiceKeyOnly] = useState(loadOpenAiVoiceKeyOnly);
  const voiceEngineRef = useRef<"browser" | "openai" | "kokoro">(loadVoiceEngine());
  const messagesRef = useRef<Msg[]>([]);
  const chainGenRef = useRef(0);
  const convPausedRef = useRef(false);
  const hostMutedRef = useRef(false);
  const inSpaceRef = useRef(false);
  const autoPlayVoicesRef = useRef(true);
  /** Resets when the host sends a message — limits runaway auto dialogue */
  const assistantSinceHostRef = useRef(0);
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveStudioLlm(llmSettings);
    setHasLocalByok(Boolean(sanitizeLlmApiKey(llmSettings.apiKey).length));
  }, [llmSettings]);

  useEffect(() => {
    const k = sanitizeLlmApiKey(llmSettings.apiKey);
    const inferred = inferProviderFromKey(k);
    if (inferred) {
      setLlmSettings((s) => (inferred !== s.provider ? { ...s, provider: inferred } : s));
    }
  }, [llmSettings.apiKey]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    convPausedRef.current = convPaused;
  }, [convPaused]);

  useEffect(() => {
    hostMutedRef.current = hostMuted;
  }, [hostMuted]);

  useEffect(() => {
    inSpaceRef.current = inSpace;
  }, [inSpace]);

  useEffect(() => {
    autoPlayVoicesRef.current = autoPlayVoices;
  }, [autoPlayVoices]);

  useEffect(() => {
    voiceEngineRef.current = voiceEngine;
    saveVoiceEngine(voiceEngine);
  }, [voiceEngine]);

  useEffect(() => {
    saveOpenAiVoiceKeyOnly(openaiVoiceKeyOnly);
  }, [openaiVoiceKeyOnly]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get(SHARE_JOIN_PARAM)?.trim().toUpperCase();
    if (code && /^[A-Z0-9]{6,10}$/.test(code)) {
      setJoinCodeInput(code);
      setGateMode("join");
    }
  }, []);

  const probeTeamRoomApi = useCallback(async () => {
    setApiProbe("checking");
    setApiStaleMissingOneShot(false);
    setApiHealthVersion(null);
    setServerHasLlmKey(null);
    try {
      const acHealth = new AbortController();
      const tHealth = window.setTimeout(() => acHealth.abort(), 15000);
      let hr: Response;
      try {
        hr = await fetch(`${apiBase}/api/health`, { signal: acHealth.signal });
      } finally {
        window.clearTimeout(tHealth);
      }

      if (hr.ok) {
        const h = (await hr.json().catch(() => ({}))) as {
          version?: string;
          capabilities?: {
            teamRoomStream?: boolean;
            teamRoomOneShot?: boolean;
            serverOpenAiKey?: boolean;
            serverNvidiaKey?: boolean;
          };
        };
        const ver = typeof h.version === "string" ? h.version : "";
        if (ver) setApiHealthVersion(ver);
        const cap = h.capabilities;
        setServerHasLlmKey(Boolean(cap?.serverOpenAiKey || cap?.serverNvidiaKey));
        const hasTeamRoomCap = cap?.teamRoomStream === true;
        const hasOneShotCap = cap?.teamRoomOneShot === true;
        if (ver && !conferenceRoomApiVersionOk(ver)) {
          setApiProbe("stale");
          return;
        }
        if (ver && conferenceRoomApiVersionOk(ver) && !hasTeamRoomCap) {
          setApiProbe("stale");
          return;
        }
        if (ver && conferenceRoomApiVersionOk(ver) && hasTeamRoomCap && !hasOneShotCap) {
          setApiStaleMissingOneShot(true);
          setApiProbe("stale");
          return;
        }
        if (ver && conferenceRoomApiVersionOk(ver) && hasTeamRoomCap && hasOneShotCap) {
          setApiProbe("ok");
          return;
        }
      }

      const acProbe = new AbortController();
      const tProbe = window.setTimeout(() => acProbe.abort(), 15000);
      try {
        const r = await fetch(`${apiBase}/api/team-room`, { method: "GET", signal: acProbe.signal });
        if (r.ok) {
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
          setApiProbe(j.ok === true ? "ok" : "stale");
          return;
        }
        if (r.status === 404) {
          setApiProbe("stale");
          return;
        }
        setApiProbe("offline");
      } finally {
        window.clearTimeout(tProbe);
      }
    } catch {
      setApiProbe("offline");
    }
  }, []);

  useEffect(() => {
    void probeTeamRoomApi();
  }, [probeTeamRoomApi]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void probeTeamRoomApi();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [probeTeamRoomApi]);

  useEffect(() => {
    const sync = () => {
      setLlmSettings(loadStudioLlm());
      setHasLocalByok(hasStoredLlmKey());
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    void ensureTtsVoicesLoaded();
    return () => {
      stopStudioSpeech();
      stopNeuralTeamSpeech();
      stopKokoroTeamSpeech();
    };
  }, []);

  useEffect(() => {
    if (voiceEngine === "kokoro") preloadKokoroTts();
  }, [voiceEngine]);

  const buildTtsRequestBody = useCallback(() => {
    const base = buildLlmRequestFields(llmSettings);
    const out: Record<string, unknown> = { ...base };
    const only = sanitizeLlmApiKey(openaiVoiceKeyOnly);
    if (only && inferProviderFromKey(sanitizeLlmApiKey(llmSettings.apiKey)) !== "openai") {
      out.openaiTtsApiKey = only;
    }
    return out;
  }, [llmSettings, openaiVoiceKeyOnly]);

  const bumpChain = useCallback(() => {
    chainGenRef.current += 1;
    streamAbortRef.current?.abort();
    stopStudioSpeech();
    stopNeuralTeamSpeech();
    stopKokoroTeamSpeech();
    setSpeakingAgentId(null);
    setTtsPlayingIndex(null);
  }, []);

  const toggleTeamListen = useCallback(
    (messageIndex: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed === "…") return;
      if (ttsPlayingIndex === messageIndex) {
        stopStudioSpeech();
        stopNeuralTeamSpeech();
        stopKokoroTeamSpeech();
        setSpeakingAgentId(null);
        setTtsPlayingIndex(null);
        return;
      }
      bumpChain();
      setSpeakingAgentId(null);
      setTtsPlayingIndex(messageIndex);

      if (voiceEngine === "openai") {
        void (async () => {
          try {
            await speakTeamOpenAiNeuralAsync(trimmed, {
              apiBase,
              buildBody: buildTtsRequestBody,
              onSegmentStart: ({ agentId }) => setSpeakingAgentId(agentId),
              onEnd: () => {
                setSpeakingAgentId(null);
                setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(`Neural voice: ${msg} — switch to Browser voices or add an OpenAI key.`);
            setSpeakingAgentId(null);
            setTtsPlayingIndex(null);
          }
        })();
        return;
      }

      if (voiceEngine === "kokoro") {
        void (async () => {
          try {
            await speakTeamKokoroAsync(trimmed, {
              onSegmentStart: ({ agentId }) => setSpeakingAgentId(agentId),
              onEnd: () => {
                setSpeakingAgentId(null);
                setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(`Kokoro voice: ${msg} — try Chrome or Edge, stable network for first model download, or switch to Browser voices.`);
            setSpeakingAgentId(null);
            setTtsPlayingIndex(null);
          }
        })();
        return;
      }

      speakAssistantContent(text, {
        onSegmentStart: ({ agentId }) => setSpeakingAgentId(agentId),
        onEnd: () => {
          setSpeakingAgentId(null);
          setTtsPlayingIndex((cur) => (cur === messageIndex ? null : cur));
        },
      });
    },
    [ttsPlayingIndex, bumpChain, voiceEngine, apiBase, buildTtsRequestBody]
  );

  const scrollFeed = useCallback(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      feedEndRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "end" });
    });
  }, [messages, loading]);

  /**
   * One API call = one teammate line (`teamRoomSingleTurn`). The client loops: fetch → caption → optional TTS → repeat,
   * so the room feels like an ongoing conversation. Host messages bump the chain (interrupt).
   */
  const runConversationChain = useCallback(
    (gen: number) => {
      void (async () => {
        while (inSpaceRef.current && chainGenRef.current === gen) {
          if (convPausedRef.current) {
            setLoading(false);
            return;
          }

          if (assistantSinceHostRef.current >= MAX_ASSISTANT_BETWEEN_HOST) {
            setErr(
              `Paused after ${MAX_ASSISTANT_BETWEEN_HOST} teammate lines in a row. Use the mic (or Continue without me) to keep going.`
            );
            setLoading(false);
            return;
          }

          const msgs = messagesRef.current;
          if (msgs.length === 0) {
            setLoading(false);
            return;
          }

          setErr(null);
          setLoading(true);
          const ac = new AbortController();
          streamAbortRef.current = ac;
          const timeoutId = window.setTimeout(() => ac.abort(), 180000);

          const llm = buildLlmRequestFields(llmSettings);
          const body: Record<string, unknown> = {
            ...llm,
            teamRoomSingleTurn: true,
            autonomousRound: hostMutedRef.current,
            messages: msgs.map((m) => ({ role: m.role, content: m.content })),
          };

          let fullText = "";
          try {
            const r = await fetch(`${apiBase}/api/team-room/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              signal: ac.signal,
            });

            if (r.status === 501) {
              const j = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
              const base = [j.error, j.hint].filter(Boolean).join(" — ") || "No API key.";
              setErr(`${base} Paste your key under Model API key on this page, or set OPENAI_API_KEY / NVIDIA_API_KEY on the API.`);
              setLoading(false);
              return;
            }

            if (r.status === 404) {
              setApiStaleMissingOneShot(true);
              setApiProbe("stale");
              setErr(
                "Team Space needs POST /api/team-room/complete (API v1.4.1+). Stop any old process on port 8788, then run npm run dev:platform:fresh — confirm GET /api/health includes capabilities.teamRoomOneShot: true."
              );
              setLoading(false);
              return;
            }

            if (!r.ok) {
              setErr(await getErrorMessageFromResponse(r, "POST /api/team-room/complete"));
              setLoading(false);
              return;
            }

            const j = (await r.json().catch(() => ({}))) as { fullText?: string; ok?: boolean };
            fullText = typeof j.fullText === "string" ? j.fullText : "";
            if (!fullText.trim()) {
              setErr("No text came back from the model. Check the API key, provider, and model under Model API key above.");
              setLoading(false);
              return;
            }
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
              setLoading(false);
              return;
            }
            setErr(formatStreamOrNetworkError(e));
            setLoading(false);
            return;
          } finally {
            window.clearTimeout(timeoutId);
            if (streamAbortRef.current === ac) {
              streamAbortRef.current = null;
            }
          }

          if (chainGenRef.current !== gen) {
            setLoading(false);
            return;
          }

          const trimmed = firstTaggedTurnOnly(fullText);
          const assistantMsg: Msg = { role: "assistant", content: trimmed };
          setStreamCompatMode(true);
          setMessages((prev) => {
            const next = [...prev, assistantMsg];
            messagesRef.current = next;
            assistantSinceHostRef.current += 1;
            return next;
          });
          requestAnimationFrame(scrollFeed);
          setLoading(false);

          if (chainGenRef.current !== gen) return;
          if (convPausedRef.current) return;

          if (autoPlayVoicesRef.current) {
            const idx = messagesRef.current.length - 1;
            setTtsPlayingIndex(idx);
            try {
              if (voiceEngineRef.current === "openai") {
                await speakTeamOpenAiNeuralAsync(trimmed, {
                  apiBase,
                  buildBody: buildTtsRequestBody,
                  onSegmentStart: ({ agentId }) => setSpeakingAgentId(agentId),
                });
              } else if (voiceEngineRef.current === "kokoro") {
                await speakTeamKokoroAsync(trimmed, {
                  onSegmentStart: ({ agentId }) => setSpeakingAgentId(agentId),
                });
              } else if (isBrowserTtsAvailable()) {
                await speakAssistantContentAsync(trimmed, {
                  onSegmentStart: ({ agentId }) => setSpeakingAgentId(agentId),
                });
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setErr(
                `Voice playback: ${msg} — try Browser or Kokoro (on-device), or check your OpenAI key for neural TTS.`
              );
            }
            setSpeakingAgentId(null);
            setTtsPlayingIndex(null);
          }

          if (chainGenRef.current !== gen) return;
          if (convPausedRef.current) return;
        }
        setLoading(false);
      })();
    },
    [apiBase, llmSettings, scrollFeed, buildTtsRequestBody]
  );

  const leaveSpace = useCallback(() => {
    inSpaceRef.current = false;
    bumpChain();
    setSpeakingAgentId(null);
    setTtsPlayingIndex(null);
    streamAbortRef.current = null;
    setMessages([]);
    messagesRef.current = [];
    assistantSinceHostRef.current = 0;
    setErr(null);
    setInput("");
    setLoading(false);
    setInSpace(false);
    setSpaceCode(null);
    setJoinHint(null);
    setStreamCompatMode(false);
    setConvPaused(false);
    convPausedRef.current = false;
    setHostMuted(false);
    hostMutedRef.current = false;
  }, [bumpChain]);

  const startSpace = useCallback(() => {
    const t = topic.trim() || DEFAULT_TOPIC;
    const code = generateSpaceCode();
    const name = hostName.trim() || "Host";
    try {
      localStorage.setItem(
        LS_SPACE_PREFIX + code,
        JSON.stringify({ topic: t, hostName: name, ts: Date.now() })
      );
    } catch {
      /* quota / private mode */
    }
    setSpaceCode(code);
    setInSpace(true);
    /** Must set before `runConversationChain` — the effect that syncs `inSpaceRef` runs after paint, so the loop would skip every turn. */
    inSpaceRef.current = true;
    setConvPaused(false);
    convPausedRef.current = false;
    setHostMuted(false);
    hostMutedRef.current = false;
    const initial: Msg[] = [{ role: "user", content: t }];
    assistantSinceHostRef.current = 0;
    setMessages(initial);
    messagesRef.current = initial;
    setStreamCompatMode(true);
    bumpChain();
    const gen = chainGenRef.current;
    void runConversationChain(gen);
  }, [topic, hostName, bumpChain, runConversationChain]);

  const joinWithCode = useCallback(() => {
    const raw = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw.length < 6) {
      setJoinHint("Enter a valid space code (letters and numbers).");
      return;
    }
    let parsed: { topic?: string; hostName?: string };
    try {
      const s = localStorage.getItem(LS_SPACE_PREFIX + raw);
      if (!s) {
        setJoinHint(
          "No space found for that code on this browser. Codes work when you start a space in another tab here, or ask the host to share the topic and start your own space."
        );
        return;
      }
      parsed = JSON.parse(s) as { topic?: string; hostName?: string };
    } catch {
      setJoinHint("Could not read that space.");
      return;
    }
    const t = typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic.trim() : DEFAULT_TOPIC;
    setTopic(t);
    if (typeof parsed.hostName === "string" && parsed.hostName.trim()) setHostName(parsed.hostName.trim());
    setSpaceCode(raw);
    setInSpace(true);
    inSpaceRef.current = true;
    setJoinHint(null);
    setConvPaused(false);
    convPausedRef.current = false;
    setHostMuted(false);
    hostMutedRef.current = false;
    const initial: Msg[] = [{ role: "user", content: t }];
    assistantSinceHostRef.current = 0;
    setMessages(initial);
    messagesRef.current = initial;
    setStreamCompatMode(true);
    bumpChain();
    const gen = chainGenRef.current;
    void runConversationChain(gen);
  }, [joinCodeInput, bumpChain, runConversationChain]);

  const sendHostMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    hostMutedRef.current = false;
    setHostMuted(false);
    assistantSinceHostRef.current = 0;
    convPausedRef.current = false;
    setConvPaused(false);
    bumpChain();
    const next: Msg[] = [...messagesRef.current, { role: "user", content: text }];
    setInput("");
    setMessages(next);
    messagesRef.current = next;
    const gen = chainGenRef.current;
    void runConversationChain(gen);
  }, [input, bumpChain, runConversationChain]);

  const continueWithoutHost = useCallback(() => {
    if (messages.length < 2) return;
    hostMutedRef.current = true;
    setHostMuted(true);
    convPausedRef.current = false;
    setConvPaused(false);
    bumpChain();
    const gen = chainGenRef.current;
    void runConversationChain(gen);
  }, [messages.length, bumpChain, runConversationChain]);

  const pauseConversation = useCallback(() => {
    convPausedRef.current = true;
    setConvPaused(true);
    bumpChain();
  }, [bumpChain]);

  const resumeConversation = useCallback(() => {
    if (!inSpace) return;
    setErr(null);
    assistantSinceHostRef.current = 0;
    convPausedRef.current = false;
    setConvPaused(false);
    chainGenRef.current += 1;
    const gen = chainGenRef.current;
    void runConversationChain(gen);
  }, [inSpace, runConversationChain]);

  const shareLink = useMemo(() => {
    if (typeof window === "undefined" || !spaceCode) return "";
    const u = new URL(window.location.href);
    u.searchParams.set("teamroom", "1");
    u.searchParams.set(SHARE_JOIN_PARAM, spaceCode);
    return u.toString();
  }, [spaceCode]);

  const copyShare = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      /* ignore */
    }
  }, [shareLink]);

  const roomTitle = useMemo(() => {
    const t = topic.trim();
    if (t) return t.length > 120 ? `${t.slice(0, 117)}…` : t;
    const first = messages.find((m) => m.role === "user")?.content?.trim();
    if (first) return first.length > 120 ? `${first.slice(0, 117)}…` : first;
    return "Space";
  }, [topic, messages]);

  const sessionTopicText = useMemo(() => {
    const t = topic.trim();
    if (t) return t;
    const first = messages.find((m) => m.role === "user")?.content?.trim();
    return first ?? "";
  }, [topic, messages]);

  return (
    <div className="app-shell team-space team-space--pro">
      <div className="team-space__pro-bg" aria-hidden />
      <header className="team-space__head">
        <div className="brand brand-row brand-row--logo team-space__brand">
          <BrandLogo variant="studio" />
          <div className="brand-lockup-text">
            <span className="team-space__eyebrow">Live audio workspace · BYOK</span>
            <h1>Team Space</h1>
            <span className="brand-lockup-sub team-space__tagline">
              Facilitated turn-taking on your topic — neural or browser voices, host interrupt anytime.
            </span>
          </div>
        </div>
        <div className="team-space__actions">
          {inSpace && (
            <button type="button" className="btn link-back" onClick={leaveSpace} disabled={loading} title="Leave space">
              Leave
            </button>
          )}
          <button type="button" className="btn link-back" onClick={onOpenStudio}>
            Studio
          </button>
          <button type="button" className="btn link-back" onClick={onBack}>
            ← Home
          </button>
        </div>
      </header>

      <p className={`team-space__lead ${inSpace ? "team-space__lead--compact" : ""}`}>
        {inSpace ? (
          <>
            <strong>Live.</strong> Teammates stay on your session topic; use the mic to steer.{" "}
            <span className="team-space__lead-muted">Pause / Resume · Listen per line · Auto-play optional.</span>
          </>
        ) : (
          <>
            Run a <strong>Spaces-style</strong> session: one teammate line per turn, anchored to <strong>your topic</strong>. Voices can follow automatically, or tap <strong>Listen</strong> on any caption.{" "}
            <span className="team-space__lead-muted">Share codes work in this browser only.</span>
          </>
        )}
      </p>

      <section className={`team-space__byok ${inSpace ? "team-space__byok--room" : ""}`} aria-labelledby="team-space-byok-title">
        <h2 id="team-space-byok-title" className="team-space__byok-title">
          Model & voice
        </h2>
        <p className="team-space__byok-lead">
          Same secure BYOK flow as Studio. Required unless your API already has <code className="inline-code">OPENAI_API_KEY</code> or{" "}
          <code className="inline-code">NVIDIA_API_KEY</code>.
        </p>
        <div className="team-space__byok-grid">
          <label className="team-space__label">
            Provider
            <select
              className="team-space__input"
              value={llmSettings.provider}
              onChange={(e) =>
                setLlmSettings((s) => ({ ...s, provider: e.target.value as StudioLlmSettings["provider"] }))
              }
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="team-space__label team-space__label--full">
            API key
            <div className="team-space__key-row">
              <input
                className="team-space__input team-space__input--flex"
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                name="team-space-llm-key"
                value={llmSettings.apiKey}
                onChange={(e) => setLlmSettings((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder="Paste key (sk-…, AIza…, gsk_…, sk-ant-…, nvapi-…)"
              />
              <button type="button" className="btn link-back team-space__key-toggle" onClick={() => setShowApiKey((v) => !v)}>
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label className="team-space__label">
            Model <span className="team-space__optional">(optional)</span>
            <input
              className="team-space__input"
              value={llmSettings.model}
              onChange={(e) => setLlmSettings((s) => ({ ...s, model: e.target.value }))}
              placeholder="e.g. gpt-4o-mini · gemini-2.5-flash · claude-…"
            />
          </label>
          <label className="team-space__remember">
            <input
              type="checkbox"
              checked={llmSettings.rememberOnDevice}
              onChange={(e) => setLlmSettings((s) => ({ ...s, rememberOnDevice: e.target.checked }))}
            />
            Remember on this device
          </label>
          <label className="team-space__label team-space__label--full">
            Voice engine
            <select
              className="team-space__input"
              value={voiceEngine}
              onChange={(e) => {
                const v = e.target.value;
                setVoiceEngine(v === "openai" ? "openai" : v === "kokoro" ? "kokoro" : "browser");
              }}
            >
              <option value="browser">Browser (free, device voices)</option>
              <option value="kokoro">Kokoro (on-device, OSS — no voice API key)</option>
              <option value="openai">OpenAI neural (natural MP3 — OpenAI TTS pricing)</option>
            </select>
          </label>
          {voiceEngine === "openai" &&
            inferProviderFromKey(sanitizeLlmApiKey(llmSettings.apiKey)) !== "openai" && (
              <label className="team-space__label team-space__label--full">
                OpenAI key for voice only
                <input
                  className="team-space__input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={openaiVoiceKeyOnly}
                  onChange={(e) => setOpenaiVoiceKeyOnly(e.target.value)}
                  placeholder="sk-… (only if chat uses Claude / Gemini / etc.)"
                />
              </label>
            )}
        </div>
        <p className="team-space__byok-hint">{LLM_PROVIDERS.find((x) => x.id === llmSettings.provider)?.hint}</p>
        {voiceEngine === "kokoro" && (
          <p className="team-space__voice-hint">
            <strong>Kokoro 82M</strong> runs in your browser (Apache-2.0). The first run downloads the model (large; can take a minute). Chrome or Edge recommended. No separate voice API key — your chat key can be any provider.
          </p>
        )}
        {voiceEngine === "openai" && (
          <p className="team-space__voice-hint">
            Neural speech uses <code className="inline-code">POST /api/tts/openai</code> with your OpenAI key (same as chat if Provider is OpenAI, or the voice-only field above). It’s billed by OpenAI per character — not ElevenLabs, but much closer to natural dialogue than browser TTS.
          </p>
        )}
      </section>

      {!inSpace && (
        <div className="team-space__gate">
          <div className="team-space__gate-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={gateMode === "start"}
              className={`team-space__tab ${gateMode === "start" ? "team-space__tab--on" : ""}`}
              onClick={() => setGateMode("start")}
            >
              Start a space
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={gateMode === "join"}
              className={`team-space__tab ${gateMode === "join" ? "team-space__tab--on" : ""}`}
              onClick={() => setGateMode("join")}
            >
              Join with code
            </button>
          </div>

          {gateMode === "start" ? (
            <section className="team-space__panel" aria-labelledby="space-start-title">
              <h2 id="space-start-title" className="team-space__panel-title">
                Go live
              </h2>
              <label className="team-space__label">
                Host name
                <input
                  className="team-space__input"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="How you appear on stage"
                />
              </label>
              <label className="team-space__label">
                What’s the space about?
                <textarea
                  className="team-space__textarea"
                  rows={4}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Topic for the team…"
                />
              </label>
              <button
                type="button"
                className="btn primary team-space__cta"
                disabled={loading}
                onClick={startSpace}
              >
                {loading ? "Starting…" : "Start space"}
              </button>
            </section>
          ) : (
            <section className="team-space__panel" aria-labelledby="space-join-title">
              <h2 id="space-join-title" className="team-space__panel-title">
                Join a space
              </h2>
              <p className="team-space__hint">
                Paste the 8-character code from the host (same browser where they started the space), or open a shared link with <code className="inline-code">?join=CODE</code>.
              </p>
              <label className="team-space__label">
                Space code
                <input
                  className="team-space__input team-space__input--mono"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. K7P2M9QX"
                  maxLength={12}
                />
              </label>
              {joinHint && <p className="team-space__join-err">{joinHint}</p>}
              <button type="button" className="btn primary team-space__cta" disabled={loading} onClick={joinWithCode}>
                {loading ? "Joining…" : "Join space"}
              </button>
            </section>
          )}
        </div>
      )}

      {apiProbe === "ok" && serverHasLlmKey === false && !hasLocalByok && (
        <div className="team-room__api-banner team-room__api-banner--warn" role="status">
          <strong>No API key in this page.</strong> Paste your key under <strong>Model API key</strong> above, or set <code className="inline-code">OPENAI_API_KEY</code> on the
          API. You can also open{" "}
          <button type="button" className="team-room__inline-link" onClick={onOpenStudio}>
            Studio
          </button>{" "}
          — it uses the same saved key.
        </div>
      )}

      {apiProbe === "stale" && (
        <div className="team-room__api-banner" role="status">
          <strong>Wrong API process.</strong>
          {apiHealthVersion ? (
            <>
              {" "}
              <code className="inline-code">{apiHealthVersion}</code>
              {apiStaleMissingOneShot ? (
                <>
                  {" "}
                  — Team Space needs <code className="inline-code">POST /api/team-room/complete</code> (capability{" "}
                  <code className="inline-code">teamRoomOneShot</code>). Stop the old Node process on port 8788 and run{" "}
                  <code className="inline-code">npm run dev:platform:fresh</code> from this repo.
                </>
              ) : conferenceRoomApiVersionOk(apiHealthVersion) ? (
                <> — missing <code className="inline-code">teamRoomStream</code>.</>
              ) : (
                <> — needs API <strong>1.3+</strong>.</>
              )}{" "}
            </>
          ) : null}
          {!apiStaleMissingOneShot ? (
            <> Run <code className="inline-code">npm run dev:platform:fresh</code> from this repo.</>
          ) : null}
        </div>
      )}

      {apiProbe === "offline" && (
        <div className="team-room__api-banner team-room__api-banner--warn" role="status">
          <strong>Can’t reach the API.</strong> Run <code className="inline-code">npm run dev:platform</code> (API on 8788).
        </div>
      )}

      {err && <div className="error-banner team-room__err">{err}</div>}

      {streamCompatMode && (
        <div className="team-space__compat-banner" role="status">
          <strong>One teammate line per request</strong> — the app calls <code className="inline-code">POST /api/team-room/complete</code> in a loop (no SSE) so each turn is one JSON response. Restart the API if your build doesn’t support <code className="inline-code">teamRoomSingleTurn</code>.
        </div>
      )}

      {inSpace && (
        <>
          <section className="team-space__room-shell" aria-label="Live space">
            <div className="team-space__room-hero">
              <div className="team-space__room-title-row">
                <span className="team-space__live-pill" title="This session is live">
                  <span className="team-space__live-dot" aria-hidden />
                  <span className="team-space__live-text">Broadcast live</span>
                </span>
                <h2 className="team-space__room-title">{roomTitle}</h2>
              </div>
              {sessionTopicText ? (
                <div className="team-space__session-focus">
                  <span className="team-space__session-focus-label">Session focus</span>
                  <p className="team-space__session-focus-text">{sessionTopicText}</p>
                </div>
              ) : null}
              <p className="team-space__room-sub">
                Hosted by <strong>{hostName.trim() || "You"}</strong>
                <span className="team-space__room-sub-sep" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
                <span className="team-space__room-sub-muted">Eight specialists on stage · host can step back with Continue without me</span>
              </p>
              <div className="team-space__room-meta">
                <span className="team-space__listeners" title="In a full Spaces backend, listener count would update here">
                  <span className="team-space__listeners-icon" aria-hidden>
                    👂
                  </span>
                  Listening in · <strong>1</strong>
                </span>
                {spaceCode && (
                  <>
                    <span className="team-space__code-pill" title="Share so someone can join on this browser">
                      Code {spaceCode}
                    </span>
                    <button type="button" className="btn link-back team-space__copy" onClick={() => void copyShare()}>
                      Copy link
                    </button>
                  </>
                )}
              </div>
            </div>

            <h3 className="team-space__section-label">Speakers</h3>
            <div className="team-space__stage" aria-label="Speakers on stage">
              <div className="team-space__stage-ring">
                {STUDIO_AGENTS.map((a) => (
                  <div
                    key={a.id}
                    className={`team-space__avatar team-space__avatar--${a.id.toLowerCase()}${
                      speakingAgentId === a.id ? " team-space__avatar--speaking" : ""
                    }`}
                    title={speakingAgentId === a.id ? `${a.fullName} — speaking` : a.blurb}
                  >
                    <AgentPortrait agent={a} variant="team-stage" />
                    <span className="team-space__avatar-name">{a.fullName.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <div className="team-space__host">
                <div className="team-space__host-circle" aria-hidden>
                  🎙
                </div>
                <span className="team-space__host-label">Host (you) · {hostName.trim() || "You"}</span>
              </div>
            </div>

            <div className="team-space__reactions" aria-hidden="true" title="Reactions are decorative here — X Spaces uses emoji reactions">
              <span className="team-space__reaction-chip">❤️</span>
              <span className="team-space__reaction-chip">🔥</span>
              <span className="team-space__reaction-chip">👏</span>
              <span className="team-space__reaction-chip">😂</span>
            </div>

            <h3 className="team-space__section-label team-space__section-label--captions">Live captions</h3>
          </section>

          <div className="team-room__feed team-space__feed">
            {messages.map((m, i) => (
              <div key={i} className={`team-room__turn team-room__turn--${m.role}`}>
                {m.role === "user" ? (
                  <div className="team-room__user team-space__host-bubble">
                    <span className="team-room__user-label">Host</span>
                    <p>{m.content}</p>
                  </div>
                ) : (
                  <div className="team-space__assistant-wrap">
                    {(voiceEngine === "openai" || voiceEngine === "kokoro" || isBrowserTtsAvailable()) && (
                      <div className="team-space__assistant-toolbar">
                        <button
                          type="button"
                          className="btn link-back studio-mv2-listen"
                          aria-label={
                            ttsPlayingIndex === i
                              ? "Stop listening"
                              : voiceEngine === "openai"
                                ? "Listen to teammates (OpenAI neural)"
                                : voiceEngine === "kokoro"
                                  ? "Listen to teammates (Kokoro on-device)"
                                  : "Listen to teammates (browser voices)"
                          }
                          title={
                            voiceEngine === "openai"
                              ? "Neural TTS via your OpenAI key (API usage)"
                              : voiceEngine === "kokoro"
                                ? "Kokoro runs locally in the browser — no voice API key"
                                : "Uses your browser’s built-in text-to-speech (device-local, no REACTIVE API usage)"
                          }
                          onClick={() => toggleTeamListen(i, m.content || "")}
                        >
                          {ttsPlayingIndex === i ? "Stop" : "Listen"}
                        </button>
                      </div>
                    )}
                    <TeamBubble content={m.content || (loading && i === messages.length - 1 ? "…" : "")} />
                  </div>
                )}
              </div>
            ))}
            <div ref={feedEndRef} className="team-room__feed-end" aria-hidden />
          </div>

          <div className="team-space__controls">
            <label className="team-space__auto-voice">
              <input
                type="checkbox"
                checked={autoPlayVoices}
                onChange={(e) => setAutoPlayVoices(e.target.checked)}
              />
              Auto-play voices
            </label>
            <button
              type="button"
              className="btn link-back team-space__ghost-btn"
              disabled={!inSpace || convPaused}
              onClick={pauseConversation}
              title="Stop automatic teammate turns (fetch + optional speech)"
            >
              Pause
            </button>
            <button
              type="button"
              className="btn link-back team-space__ghost-btn"
              disabled={!inSpace || !convPaused}
              onClick={resumeConversation}
              title="Resume automatic back-and-forth"
            >
              Resume
            </button>
            <button
              type="button"
              className="btn link-back team-space__ghost-btn"
              disabled={messages.length < 2}
              onClick={continueWithoutHost}
              title="Teammates continue talking — you stay muted as host"
            >
              Continue without me
            </button>
          </div>

          <div className="team-room__composer team-space__composer">
            <label className="team-space__composer-label" htmlFor="team-space-host-mic">
              Host microphone
            </label>
            <div className="team-space__composer-row">
              <textarea
                id="team-space-host-mic"
                className="team-room__input"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Steer the discussion on-topic — e.g. “Priya, what’s the smallest trust bar for v1?”"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendHostMessage();
                  }
                }}
              />
              <button type="button" className="btn primary team-room__send" disabled={!input.trim()} onClick={sendHostMessage}>
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
