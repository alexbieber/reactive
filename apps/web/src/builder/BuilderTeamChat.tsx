import { Fragment, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AppSpec } from "../types";
import { WEB_API_BASE } from "../apiBase";
import { buildLlmRequestFields, loadStudioLlm } from "../studioLlm";
import { getAgentEmployeeLine, parseAgentSegments } from "../studioAgents";
import { getErrorMessageFromResponse } from "../apiFetchErrors";
import type { GeneratedFile } from "./types";
import { parseTeamChatSSEStream } from "./teamChatStream";

type Msg = { role: "user" | "assistant"; content: string };

const INITIAL_ASSISTANT = `[Build]
Files are in the tree — open one on the right, or paste **terminal / Metro / TypeScript errors** here. We’ll iterate until \`expo start\` is clean or you’re ready to move to **Studio** for REACTIVE’s web preview.

[Discovery]
What’s the first thing that breaks — red screen, bundler error, or “it runs but looks wrong”?`;

const mdComponents = {
  p: ({ children }: { children?: ReactNode }) => <p className="builder-team-md-p">{children}</p>,
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
      <code className="builder-team-inline-code" {...props}>
        {children}
      </code>
    );
  },
};

function TeamBubble({ content }: { content: string }) {
  const segments = useMemo(() => parseAgentSegments(content), [content]);
  return (
    <div className="builder-team-segments">
      {segments.map((seg, i) => (
        <Fragment key={i}>
          <div className="builder-team-seg">
            {seg.agentId && (
              <span className={`builder-team-badge builder-team-badge--${seg.agentId.toLowerCase()}`}>
                {getAgentEmployeeLine(seg.agentId) ?? seg.agentId}
              </span>
            )}
            <div className="builder-team-md">
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
  files: GeneratedFile[];
  /** Shown in system context — keep stable */
  spec: AppSpec;
  onOpenStudio: () => void;
};

export default function BuilderTeamChat({ files, spec, onOpenStudio }: Props) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: INITIAL_ASSISTANT }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const paths = useMemo(() => files.map((f) => f.path), [files]);

  async function sendTeamMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setErr(null);
    const nextMsgs: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    setLoading(true);

    const body = {
      messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      spec,
      copilotContext: {
        phase: "project-build-post",
        projectBuildFileCount: files.length,
        projectBuildPaths: paths,
      },
      ...buildLlmRequestFields(loadStudioLlm()),
    };

    try {
      const r = await fetch(`${WEB_API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (r.status === 501) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
        setErr(
          [j.error, j.hint].filter(Boolean).join(" — ") ||
            "No LLM key — add OPENAI_API_KEY on the API or BYOK in Studio."
        );
        return;
      }

      if (!r.ok) {
        setErr(await getErrorMessageFromResponse(r, "POST /api/chat/stream"));
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      await parseTeamChatSSEStream(
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
        () => {
          /* done */
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "assistant" && last.content === "") return m.slice(0, -1);
        return m;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="builder-team-chat">
      <div className="builder-team-chat__head">
        <h3 className="builder-team-chat__title">Your team — live fixes</h3>
        <p className="builder-team-chat__sub">
          Same eight specialists as Studio (multi-agent). They stay with you until the run / preview is good. REACTIVE web preview →{" "}
          <button type="button" className="btn-inline" onClick={onOpenStudio}>
            Open Studio
          </button>
          .
        </p>
      </div>
      {err && <div className="error-banner builder-team-chat__err">{err}</div>}
      <div className="builder-team-chat__feed">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`builder-team-turn builder-team-turn--${m.role}`}
          >
            {m.role === "assistant" ? (
              <TeamBubble content={m.content || (loading && i === messages.length - 1 ? "…" : "")} />
            ) : (
              <p className="builder-team-user">{m.content}</p>
            )}
          </div>
        ))}
      </div>
      <div className="builder-team-chat__composer">
        <textarea
          className="builder-team-chat__input"
          rows={2}
          placeholder="Paste errors, ask for a fix, or say when preview works…"
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendTeamMessage();
            }
          }}
        />
        <button type="button" className="btn primary builder-team-chat__send" disabled={loading || !input.trim()} onClick={() => void sendTeamMessage()}>
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
