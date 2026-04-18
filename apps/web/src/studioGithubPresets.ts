/**
 * Curated public repos — align copilot with real Expo/RN stacks on GitHub.
 * Optional appPath for monorepos (loaded client → API).
 * Rationale for specific presets (CES-style stacks, json-render demos, AI Expo samples, etc.)
 * lives in-repo under docs/ for maintainers only — product behavior is these entries + copilot rules.
 */
export type GithubContextPreset = {
  id: string;
  label: string;
  repo: string;
  ref?: string;
  /** Monorepo subfolder (e.g. packages/app) */
  appPath?: string;
  hint: string;
};

export const GITHUB_CONTEXT_PRESETS: GithubContextPreset[] = [
  {
    id: "expo-router",
    label: "Expo Router",
    repo: "expo/expo-router",
    hint: "Official file-based routing",
  },
  {
    id: "expo",
    label: "Expo",
    repo: "expo/expo",
    hint: "Core SDK monorepo",
  },
  {
    id: "obytes",
    label: "Obytes starter",
    repo: "obytes/react-native-template-obytes",
    hint: "TS + NativeWind + router",
  },
  {
    id: "local-first",
    label: "Local-first",
    repo: "expo-starter/expo-local-first-template",
    hint: "Expo 54 + SQLite + Drizzle",
  },
  {
    id: "ces",
    label: "create-expo-stack",
    repo: "roninoss/create-expo-stack",
    hint: "CLI stack matrix",
  },
  {
    id: "app-builder",
    label: "AI app builder",
    repo: "EvanBacon/app-that-builds-apps",
    hint: "Expo Router + AI SDK",
  },
  {
    id: "expo-ai",
    label: "expo-ai (demo)",
    repo: "EvanBacon/expo-ai",
    hint: "Streaming + Expo Router AI patterns",
  },
  {
    id: "fast-expo",
    label: "fast-expo-app",
    repo: "Teczer/fast-expo-app",
    hint: "CLI template + modern defaults",
  },
  {
    id: "json-render",
    label: "JSON render (Expo)",
    repo: "CaiZongyuan/react-native-json-render",
    hint: "JSON-driven UI + Zod catalog",
  },
  {
    id: "erne",
    label: "ERNE harness",
    repo: "JubaKitiashvili/everything-react-native-expo",
    hint: "Multi-agent RN rules (reference)",
  },
  {
    id: "expo-genie",
    label: "Expo Genie CLI",
    repo: "refactorian/expo-genie-cli",
    hint: "Scaffold / feature CLI patterns",
  },
  {
    id: "rn-builder",
    label: "RN Apps Builder",
    repo: "CaiZongyuan/ReactNative-Apps-Builder",
    hint: "InstantDB + Expo builder tutorial",
  },
  {
    id: "navigation",
    label: "React Navigation",
    repo: "react-navigation/react-navigation",
    hint: "Navigation patterns & packages",
  },
  {
    id: "reanimated",
    label: "Reanimated",
    repo: "software-mansion/react-native-reanimated",
    hint: "Animation runtime expectations",
  },
  {
    id: "flash-list",
    label: "FlashList",
    repo: "Shopify/flash-list",
    hint: "High-performance lists",
  },
  {
    id: "bottom-tabs",
    label: "Native bottom tabs",
    repo: "callstack/react-native-bottom-tabs",
    hint: "Native tab bar (Expo-compatible)",
  },
  {
    id: "rn-web",
    label: "React Native Web",
    repo: "necolas/react-native-web",
    hint: "Web parity for RN primitives",
  },
  {
    id: "expo-examples",
    label: "Expo examples",
    repo: "expo/examples",
    hint: "Official minimal samples",
  },
  {
    id: "zerodays-tpl",
    label: "Zerodays template",
    repo: "zerodays/react-native-template",
    hint: "Expo Router + NativeWind starter",
  },
  {
    id: "ignite",
    label: "Ignite CLI",
    repo: "infinitered/ignite",
    hint: "RN app generator / opinionated structure",
  },
  {
    id: "nativewind",
    label: "NativeWind",
    repo: "nativewind/nativewind",
    hint: "Tailwind-style RN styling layer",
  },
  {
    id: "rn-screens",
    label: "react-native-screens",
    repo: "software-mansion/react-native-screens",
    hint: "Native screen primitives (navigation perf)",
  },
];
