export const STUDIO_CODE_STRIPPED_NOTE =
  "\n\n> **No source code in Studio chat** — the UI hides fenced blocks except App Spec `json`. Use **[Project build](/?project=1)** for Monaco, the file tree, and ZIP.\n\n";

/** True when an unlabeled fence is clearly App Spec JSON (assistant sometimes omits `json`). */
export function looksLikeAppSpecJson(body: string): boolean {
  const t = body.trim();
  if (!t.startsWith("{")) return false;
  return (
    t.includes('"meta"') &&
    (t.includes('"screens"') || t.includes('"navigation"') || t.includes('"data_model"'))
  );
}

/**
 * Strip every markdown fenced block except ```json (and bare ``` that look like App Spec).
 * Models still emit ```ts / ```tsx / ``` — users should never see that in Studio.
 */
export function stripStudioHandwrittenCodeFences(text: string): string {
  let out = "";
  let pos = 0;
  while (pos < text.length) {
    const fenceStart = text.indexOf("```", pos);
    if (fenceStart < 0) {
      out += text.slice(pos);
      break;
    }
    out += text.slice(pos, fenceStart);
    const afterOpen = fenceStart + 3;
    const lineEnd = text.indexOf("\n", afterOpen);
    if (lineEnd < 0) {
      out += text.slice(fenceStart);
      break;
    }
    const firstLine = text.slice(afterOpen, lineEnd);
    const langToken = firstLine.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const bodyStart = lineEnd + 1;
    const close = text.indexOf("```", bodyStart);
    if (close < 0) {
      out += text.slice(fenceStart);
      break;
    }
    const body = text.slice(bodyStart, close);
    const fullBlock = text.slice(fenceStart, close + 3);
    const keepJson =
      langToken === "json" ||
      langToken === "jsonc" ||
      (langToken === "" && looksLikeAppSpecJson(body));
    out += keepJson ? fullBlock : STUDIO_CODE_STRIPPED_NOTE;
    pos = close + 3;
  }
  return out;
}
