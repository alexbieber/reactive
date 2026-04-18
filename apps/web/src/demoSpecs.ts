import type { AppSpec } from "./types";
import habit from "../../../docs/spec-schema/examples/habit-tracker.spec.json";
import recipe from "../../../docs/spec-schema/examples/recipe-browser.spec.json";

function clone(s: AppSpec): AppSpec {
  return JSON.parse(JSON.stringify(s)) as AppSpec;
}

/** One-click demos for investor / YC conversations */
export const DEMO_SPECS = {
  habit: clone(habit as AppSpec),
  recipe: clone(recipe as AppSpec),
} as const;
