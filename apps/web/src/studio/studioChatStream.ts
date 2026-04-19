import type { AppSpec } from "../types";
import type { ChatTokenUsage } from "./studioTypes";

export function parseSseDataLine(rawBlock: string): {
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

export async function parseSSEStream(
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
