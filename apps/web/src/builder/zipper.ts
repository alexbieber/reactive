import JSZip from "jszip";
import type { GeneratedFile } from "./types";

export async function zipGeneratedFiles(files: GeneratedFile[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  return zip.generateAsync({ type: "blob" });
}

export function downloadZip(blob: Blob, projectName: string) {
  const safe = projectName.replace(/[^\w\-]+/g, "-").slice(0, 64) || "rn-app";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
