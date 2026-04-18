import { buildLlmRequestFields, loadStudioLlm } from "../studioLlm";
import type { BuilderAnswer, BuilderQuestion } from "./types";
import { getErrorMessageFromResponse } from "../apiFetchErrors";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

export async function postBuilderClarify(prompt: string): Promise<{ questions: BuilderQuestion[] }> {
  const llm = loadStudioLlm();
  const r = await fetch(`${apiBase}/api/builder/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...buildLlmRequestFields(llm) }),
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
  onError: (msg: string) => void
): Promise<void> {
  const llm = loadStudioLlm();
  const r = await fetch(`${apiBase}/api/builder/generate-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, answers, questions, ...buildLlmRequestFields(llm) }),
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
      let j: { type?: string; text?: string; fullText?: string; message?: string };
      try {
        j = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (j.type === "delta" && typeof j.text === "string") onDelta(j.text);
      if (j.type === "done") {
        onDone({ fullText: typeof j.fullText === "string" ? j.fullText : "" });
        return;
      }
      if (j.type === "error" && typeof j.message === "string") {
        onError(j.message);
        return;
      }
    }
  }
}
