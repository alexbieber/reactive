import { WEB_API_BASE } from "../apiBase";
import { buildLlmRequestFields, loadStudioLlm, type StudioLlmSettings } from "../studioLlm";
import type { BuilderAnswer, BuilderQuestion } from "./types";
import { getErrorMessageFromResponse } from "../apiFetchErrors";
import { parseSseDataBlock } from "./teamChatStream";

function llmForBuilder(override?: StudioLlmSettings) {
  return buildLlmRequestFields(override ?? loadStudioLlm());
}

export async function postBuilderClarify(
  prompt: string,
  llmSettings?: StudioLlmSettings
): Promise<{ questions: BuilderQuestion[] }> {
  const r = await fetch(`${WEB_API_BASE}/api/builder/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...llmForBuilder(llmSettings) }),
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(await getErrorMessageFromResponse(r, "POST /api/builder/clarify"));
  }
  const j = (await r.json()) as { questions?: BuilderQuestion[] };
  if (!Array.isArray(j.questions)) throw new Error("Invalid response: questions[]");
  return { questions: j.questions };
}

export async function streamBuilderGenerate(
  prompt: string,
  answers: BuilderAnswer[],
  questions: BuilderQuestion[],
  onDelta: (t: string) => void,
  onDone: (payload: { fullText: string }) => void,
  onError: (msg: string) => void,
  llmSettings?: StudioLlmSettings
): Promise<void> {
  try {
    const r = await fetch(`${WEB_API_BASE}/api/builder/generate-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ prompt, answers, questions, ...llmForBuilder(llmSettings) }),
      cache: "no-store",
    });

    if (r.status === 501) {
      const j = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
      onError([j.error, j.hint].filter(Boolean).join(" — ") || "No LLM key configured.");
      return;
    }

    if (!r.ok) {
      onError(await getErrorMessageFromResponse(r, "POST /api/builder/generate-stream"));
      return;
    }

    const reader = r.body?.getReader();
    if (!reader) {
      onError("No response body");
      return;
    }

    const dec = new TextDecoder();
    let buf = "";
    /** If the final SSE `done` is dropped by a proxy/client, we can still assemble output from deltas */
    let textFromDeltas = "";
    let sawDone = false;

    const handleRawBlock = (raw: string): boolean => {
      const j = parseSseDataBlock(raw);
      if (!j) return false;
      if (j.type === "delta" && typeof j.text === "string") {
        textFromDeltas += j.text;
        onDelta(j.text);
      }
      if (j.type === "done") {
        sawDone = true;
        const ft = typeof j.fullText === "string" ? j.fullText : "";
        onDone({ fullText: ft || textFromDeltas });
        return true;
      }
      if (j.type === "error" && typeof j.message === "string") {
        onError(j.message);
        return true;
      }
      return false;
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
        if (handleRawBlock(raw)) return;
      }
    }
    buf += dec.decode();
    buf = buf.replace(/\r\n/g, "\n").trim();
    if (buf) {
      if (buf.includes("\n\n")) {
        for (const part of buf.split("\n\n")) {
          if (part.trim() && handleRawBlock(part)) return;
        }
      } else if (handleRawBlock(buf)) {
        return;
      }
    }
    if (!sawDone && textFromDeltas.trim().length > 0) {
      onDone({ fullText: textFromDeltas });
      return;
    }
    onError(
      "Stream ended before generation finished (no final event). If this was a long run, try again — or increase dev proxy timeout so /api can complete."
    );
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
  }
}

