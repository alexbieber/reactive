import type { AppSpec } from "../types";

/** Chat message row in Studio transcript */
export type StudioMsg = { role: "user" | "assistant"; content: string };

/** From POST /api/chat and /api/chat/stream done — gpt-tokenizer baseline */
export type ChatTokenUsage = {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  encoder?: string;
  estimate?: string;
};

/** Mirrors POST /api/github/context response — injected into copilot system prompt */
export type GithubContextPayload = {
  fullName: string;
  description?: string;
  topics?: string[];
  readme: string;
  packageJson: string;
  babelConfigPath?: string;
  babelConfig: string;
  metroConfigPath?: string;
  metroConfig: string;
  expoConfig: string;
  tsconfigJson: string;
  easJson: string;
  appPath: string;
};

export type StudioShellProps = {
  initialSpec: AppSpec;
  onBack: () => void;
  onOpenProjectBuild?: () => void;
  onOpenTeamRoom?: () => void;
};
