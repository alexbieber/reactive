import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAgentEmployeeLine, parseAgentSegments } from "../studioAgents";
import { stripStudioHandwrittenCodeFences } from "./studioStripCode";

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

type AssistantContentProps = {
  content: string;
  onOpenProjectBuild?: () => void;
};

export function StudioAssistantContent({ content, onOpenProjectBuild }: AssistantContentProps) {
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
