/** SSE parser for POST /api/chat/stream and /api/team-room/stream — same event shape */

/** Payload after `data:` (handles `data:{"x":1}` and `data: {"x":1}` per SSE). */
function lineAfterDataPrefix(line: string): string {
  const i = line.indexOf(":");
  return i >= 0 ? line.slice(i + 1).trimStart() : line;
}

/** Exported for POST /api/builder/generate-stream — same framing as chat SSE. */
export function parseSseDataBlock(rawBlock: string): {
  type?: string;
  text?: string;
  fullText?: string;
  message?: string;
} | null {
  const lines = rawBlock.split("\n").filter((l) => l.length > 0);
  const dataLines = lines.filter((l) => l.startsWith("data:"));
  if (!dataLines.length) return null;
  /* SSE: multiple `data:` lines are joined with \n */
  const payload =
    dataLines.length === 1
      ? lineAfterDataPrefix(dataLines[0])
      : dataLines.map(lineAfterDataPrefix).join("\n");
  if (payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as {
      type?: string;
      text?: string;
      fullText?: string;
      message?: string;
    };
  } catch {
    return null;
  }
}

export async function parseTeamChatSSEStream(
  res: Response,
  onDelta: (t: string) => void,
  onDone: (payload: { fullText: string }) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const dec = new TextDecoder();
  let buf = "";
  let sawDone = false;
  /** Sum of delta.text — used if the connection closes before a `done` frame (proxies, IDE preview, tab background) */
  let deltaAccum = "";

  const handleOneBlock = (raw: string) => {
    const j = parseSseDataBlock(raw);
    if (!j) return;
    if (j.type === "delta" && typeof j.text === "string") {
      deltaAccum += j.text;
      onDelta(j.text);
    }
    if (j.type === "done") {
      if (sawDone) return;
      sawDone = true;
      onDone({
        fullText: typeof j.fullText === "string" ? j.fullText : "",
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
    const trimmed = deltaAccum.trim();
    if (trimmed.length > 0) {
      onDone({ fullText: deltaAccum });
      return;
    }
    throw new Error(
      "Stream ended without a final done event and no text. Open this app in Chrome/Safari/Edge (not the Cursor/VS Code embedded preview), run `npm run dev:platform` so the API is on port 8788, then retry."
    );
  }
}
