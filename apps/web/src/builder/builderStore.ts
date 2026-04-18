import { create } from "zustand";
import type { BuilderAnswer, BuilderQuestion, BuilderState, BuilderStep, GeneratedFile } from "./types";

type BuilderStore = BuilderState & {
  setPrompt: (prompt: string) => void;
  setStep: (step: BuilderStep) => void;
  setQuestions: (questions: BuilderQuestion[]) => void;
  setAnswer: (questionId: number, value: string) => void;
  setFiles: (files: GeneratedFile[]) => void;
  updateFileContent: (path: string, content: string) => void;
  setActiveFile: (path: string | null) => void;
  appendRawStream: (chunk: string) => void;
  clearRawStream: () => void;
  setStreaming: (v: boolean) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
};

const initial: BuilderState = {
  step: "prompt",
  prompt: "",
  questions: [],
  answers: [],
  files: [],
  activeFile: null,
  rawStream: "",
  isStreaming: false,
  error: null,
};

export const useBuilderStore = create<BuilderStore>((set) => ({
  ...initial,
  setPrompt: (prompt) => set({ prompt }),
  setStep: (step) => set({ step }),
  setQuestions: (questions) =>
    set({
      questions,
      answers: [],
    }),
  setAnswer: (questionId, value) =>
    set((s) => {
      const rest = s.answers.filter((a) => a.questionId !== questionId);
      return { answers: [...rest, { questionId, value }] };
    }),
  setFiles: (files) =>
    set({
      files,
      activeFile: files[0]?.path ?? null,
    }),
  updateFileContent: (path, content) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, content } : f)),
    })),
  setActiveFile: (activeFile) => set({ activeFile }),
  appendRawStream: (chunk) => set((s) => ({ rawStream: s.rawStream + chunk })),
  clearRawStream: () => set({ rawStream: "" }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setError: (error) => set({ error }),
  reset: () => set(initial),
}));

export function answersComplete(questions: BuilderQuestion[], answers: BuilderAnswer[]): boolean {
  if (!questions.length) return false;
  for (const q of questions) {
    const a = answers.find((x) => x.questionId === q.id);
    if (!a || !String(a.value).trim()) return false;
  }
  return true;
}
