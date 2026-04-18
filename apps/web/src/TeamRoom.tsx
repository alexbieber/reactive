import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BrandLogo from "./BrandLogo";
import { buildLlmRequestFields, loadStudioLlm } from "./studioLlm";
import { STUDIO_AGENTS, getAgentEmployeeLine, parseAgentSegments } from "./studioAgents";
import { getErrorMessageFromResponse } from "./apiFetchErrors";
import { parseTeamChatSSEStream } from "./builder/teamChatStream";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

function formatStreamOrNetworkError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (name === "AbortError" || lower.includes("aborted")) {
    return "Stream cancelled — use a normal browser tab (not the IDE preview), or retry. BYOK key must be set in Studio.";
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

/** Conference room shipped in API 1.3+; capabilities.teamRoomStream marks the build */
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
  "Stand-up in the big conference room: what we're prioritizing for REACTIVE (App Spec, Expo preview, Project build) and who's worried about what.";

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
          Little <code className="inline-code">[Tag]</code> structure in this reply — ask for “more bracket tags, each speaker one turn” in a follow‑up, or switch model in Studio.
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

export default function TeamRoom({ onBack, onOpenStudio }: Props) {
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Bytes appended in this stream — avoids false “empty reply” if React hasn’t flushed delta state yet */
  const teamRoomStreamCharsRef = useRef(0);
  const [apiProbe, setApiProbe] = useState<ApiProbe>("checking");
  /** From GET /api/health — e.g. 1.2.0 means wrong binary, not this repo */
  const [apiHealthVersion, setApiHealthVersion] = useState<string | null>(null);
  /** From /api/health capabilities — if false and no local BYOK, POST /team-room/stream returns 501 */
  const [serverHasLlmKey, setServerHasLlmKey] = useState<boolean | null>(null);
  const [hasLocalByok, setHasLocalByok] = useState(hasStoredLlmKey);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const probeTeamRoomApi = useCallback(async () => {
    setApiProbe("checking");
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
            serverOpenAiKey?: boolean;
            serverNvidiaKey?: boolean;
          };
        };
        const ver = typeof h.version === "string" ? h.version : "";
        if (ver) setApiHealthVersion(ver);
        const cap = h.capabilities;
        setServerHasLlmKey(Boolean(cap?.serverOpenAiKey || cap?.serverNvidiaKey));
        const hasTeamRoomCap = cap?.teamRoomStream === true;
        if (ver && !conferenceRoomApiVersionOk(ver)) {
          setApiProbe("stale");
          return;
        }
        if (ver && conferenceRoomApiVersionOk(ver) && !hasTeamRoomCap) {
          setApiProbe("stale");
          return;
        }
        if (ver && conferenceRoomApiVersionOk(ver) && hasTeamRoomCap) {
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

  /** BYOK lives in session/localStorage — not shared across Chrome vs Safari vs Cursor preview */
  useEffect(() => {
    const sync = () => setHasLocalByok(hasStoredLlmKey());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const scrollFeed = useCallback(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const runStream = useCallback(
    async (payload: { topic?: string; messages?: Msg[] }) => {
      setErr(null);
      setLoading(true);
      teamRoomStreamCharsRef.current = 0;
      const llm = buildLlmRequestFields(loadStudioLlm());
      const body: Record<string, unknown> = { ...llm };
      if (payload.messages?.length) {
        body.messages = payload.messages.map((m) => ({ role: m.role, content: m.content }));
      } else if (typeof payload.topic === "string") {
        body.topic = payload.topic;
      }

      try {
        const r = await fetch(`${apiBase}/api/team-room/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (r.status === 501) {
          const j = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
          const base = [j.error, j.hint].filter(Boolean).join(" — ") || "No API key.";
          setErr(`${base} Add your key in Studio (BYOK) in this browser, or OPENAI_API_KEY on the server.`);
          return;
        }

        if (!r.ok) {
          if (r.status === 404) {
            setApiProbe("stale");
            const baseNote = apiBase.trim()
              ? ` VITE_API_BASE is set to ${apiBase} — that origin must run this repo’s API (v1.3+), or unset it so requests use the Vite /api proxy to 8788.`
              : " With no VITE_API_BASE, /api goes to 127.0.0.1:8788 — the process there must be this checkout (see banner for /api/health).";
            setErr(`Conference room API missing (404).${baseNote} From repo root: npm run dev:platform:fresh — health must show teamRoomStream.`);
            return;
          }
          setErr(await getErrorMessageFromResponse(r, "POST /api/team-room/stream"));
          return;
        }

        setMessages((m) => [...m, { role: "assistant", content: "" }]);

        await parseTeamChatSSEStream(
          r,
          (chunk) => {
            if (chunk) teamRoomStreamCharsRef.current += chunk.length;
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { role: "assistant", content: last.content + chunk };
              }
              return copy;
            });
          },
          ({ fullText }) => {
            const got = fullText.trim().length > 0 || teamRoomStreamCharsRef.current > 0;
            if (!got) {
              setErr("No text came back from the model. Check Studio BYOK key, model name, and try again.");
              setMessages((m) => {
                const last = m[m.length - 1];
                if (last?.role === "assistant" && last.content === "") return m.slice(0, -1);
                return m;
              });
            }
          }
        );
        requestAnimationFrame(scrollFeed);
      } catch (e) {
        setErr(formatStreamOrNetworkError(e));
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant" && last.content === "") return m.slice(0, -1);
          return m;
        });
      } finally {
        setLoading(false);
      }
    },
    [scrollFeed]
  );

  const startConference = useCallback(() => {
    const t = topic.trim() || DEFAULT_TOPIC;
    setMessages([{ role: "user", content: t }]);
    void runStream({ topic: t });
  }, [topic, runStream]);

  const sendFollowUp = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setInput("");
    setMessages(next);
    void runStream({ messages: next });
  }, [input, loading, messages, runStream]);

  return (
    <div className="app-shell team-room">
      <header className="team-room__head">
        <div className="brand brand-row brand-row--logo team-room__brand">
          <BrandLogo variant="studio" />
          <div className="brand-lockup-text">
            <h1>Conference room</h1>
            <span className="brand-lockup-sub">Your eight teammates — talking to each other, not at you</span>
          </div>
        </div>
        <div className="team-room__actions">
          <button type="button" className="btn link-back" onClick={onOpenStudio}>
            Studio (BYOK)
          </button>
          <button type="button" className="btn link-back" onClick={onBack}>
            ← Home
          </button>
        </div>
      </header>

      <p className="team-room__lead">
        Same roster as Copilot — <strong>Maya, Jordan, Sam, Alex, Priya, Riley, Casey, Morgan</strong> — in a stand-up style
        meeting. They address each other by name and react like coworkers. Uses your Studio LLM keys. No App Spec output
        here — just the conversation.
      </p>

      <div className="team-room__roster" aria-label="Team roster">
        {STUDIO_AGENTS.map((a) => (
          <span key={a.id} className={`team-room__chip team-room__chip--${a.id.toLowerCase()}`} title={a.blurb}>
            {a.fullName.split(" ")[0]}
          </span>
        ))}
      </div>

      {apiProbe === "ok" && serverHasLlmKey === false && !hasLocalByok && (
        <div className="team-room__api-banner team-room__api-banner--warn" role="status">
          <strong>No LLM key in this browser.</strong> Studio keys do not sync between Chrome, Safari, or the IDE preview — open{" "}
          <button type="button" className="team-room__inline-link" onClick={onOpenStudio}>
            Studio (BYOK)
          </button>{" "}
          here and paste your API key, or start the API with <code className="inline-code">OPENAI_API_KEY</code> set in the shell.
        </div>
      )}

      {apiProbe === "stale" && (
        <div className="team-room__api-banner" role="status">
          <strong>Wrong API process.</strong>
          {apiHealthVersion ? (
            <>
              {" "}
              Yours reports <code className="inline-code">version: &quot;{apiHealthVersion}&quot;</code>
              {conferenceRoomApiVersionOk(apiHealthVersion) ? (
                <> — missing <code className="inline-code">teamRoomStream</code> (stale build).</>
              ) : (
                <> — Conference room needs <strong>1.3+</strong> (this repo: <strong>1.4.0</strong>).</>
              )}{" "}
            </>
          ) : null}
          Stop Node on <strong>8788</strong>, then from <strong>this</strong> repo:{" "}
          <code className="inline-code">npm run dev:platform:fresh</code>. Reload — health should show{" "}
          <code className="inline-code">teamRoomStream: true</code>.
        </div>
      )}

      {apiProbe === "offline" && (
        <div className="team-room__api-banner team-room__api-banner--warn" role="status">
          <strong>Can’t reach the API.</strong> Start it with <code className="inline-code">npm run dev -w api</code> (port 8788) or{" "}
          <code className="inline-code">npm run dev:platform</code>. If you use a custom URL, set <code className="inline-code">VITE_API_BASE</code>{" "}
          and rebuild the web app.
        </div>
      )}

      {err && <div className="error-banner team-room__err">{err}</div>}

      {messages.length === 0 ? (
        <section className="team-room__starter" aria-labelledby="team-room-topic">
          <h2 id="team-room-topic" className="team-room__starter-title">
            What’s the meeting about?
          </h2>
          <textarea
            className="team-room__topic"
            rows={4}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. We need to ship a calculator demo without embarrassing placeholders…"
          />
          <button
            type="button"
            className="btn primary"
            disabled={loading}
            title={
              apiProbe === "stale" || apiProbe === "offline"
                ? "API may still be old or down — you can try anyway, or restart the API per the banner above."
                : undefined
            }
            onClick={startConference}
          >
            {loading ? "Opening the room…" : "Start stand-up"}
          </button>
        </section>
      ) : (
        <>
          <div className="team-room__feed">
            {messages.map((m, i) => (
              <div key={i} className={`team-room__turn team-room__turn--${m.role}`}>
                {m.role === "user" ? (
                  <div className="team-room__user">
                    <span className="team-room__user-label">Facilitator (you)</span>
                    <p>{m.content}</p>
                  </div>
                ) : (
                  <TeamBubble content={m.content || (loading && i === messages.length - 1 ? "…" : "")} />
                )}
              </div>
            ))}
            <div ref={feedEndRef} className="team-room__feed-end" aria-hidden />
          </div>

          <div className="team-room__composer">
            <textarea
              className="team-room__input"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Jump in: e.g. “Maya, can you own the demo scope?”"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendFollowUp();
                }
              }}
            />
            <button type="button" className="btn primary team-room__send" disabled={loading || !input.trim()} onClick={sendFollowUp}>
              {loading ? "…" : "Send"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
