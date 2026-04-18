/** plannew.md-aligned builder state (full RN/Expo project from prompt). */

export type BuilderStep = "prompt" | "questions" | "generating" | "done";

export interface BuilderQuestion {
  id: number;
  question: string;
  type: "choice" | "text";
  options?: string[];
}

export interface BuilderAnswer {
  questionId: number;
  value: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

export interface BuilderState {
  step: BuilderStep;
  prompt: string;
  questions: BuilderQuestion[];
  answers: BuilderAnswer[];
  files: GeneratedFile[];
  activeFile: string | null;
  rawStream: string;
  isStreaming: boolean;
  error: string | null;
}
