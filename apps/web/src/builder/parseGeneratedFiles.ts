import type { GeneratedFile } from "./types";

export function parseGeneratedFiles(raw: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const re = /===FILE:\s*(.+?)===\r?\n([\s\S]*?)===END===/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const path = match[1].trim();
    const content = match[2].trim();
    if (!path) continue;
    files.push({
      path,
      content,
      language: languageFromPath(path),
    });
  }
  return files;
}

function languageFromPath(path: string): string {
  if (/\.(tsx?|mts|cts)$/.test(path)) return "typescript";
  if (/\.jsonc?$/i.test(path)) return "json";
  if (/\.(jsx?|mjs|cjs)$/.test(path)) return "javascript";
  if (/\.md$/i.test(path)) return "markdown";
  if (/\.css$/i.test(path)) return "css";
  return "plaintext";
}
