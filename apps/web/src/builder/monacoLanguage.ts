/** Map generated file language tag → Monaco language id */
export function monacoLanguageForFile(lang: string): string {
  if (lang === "typescript" || lang === "javascript") return "typescript";
  if (lang === "json") return "json";
  if (lang === "css") return "css";
  if (lang === "markdown") return "markdown";
  return "plaintext";
}
