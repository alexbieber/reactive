# Related open-source tools (reference)

REACTIVE is **spec-first**: validated **App Spec JSON** → deterministic **codegen** → ZIP + **web preview** + **Studio** (multi-operator chat, BYOK, GitHub context). These projects overlap in *Expo / React Native / AI* but differ in architecture — we use them for **ideas**, **prompt patterns**, and **GitHub context presets**, not as vendored code.

**License:** Before copying code, read each repo’s **LICENSE** (most below are MIT; verify at source).

## AI + Expo / in-app generation

| Project | URL | Takeaway for REACTIVE |
|--------|-----|-------------------------|
| **app-that-builds-apps** | https://github.com/EvanBacon/app-that-builds-apps | Expo Router + AI SDK, streaming, dependency installs — compare **UX**; we stay **template-locked**. |
| **expo-ai** | https://github.com/EvanBacon/expo-ai | Streaming + Router + RSC demo — **streaming/error** patterns. |
| **ReactNative-Apps-Builder** | https://github.com/CaiZongyuan/ReactNative-Apps-Builder | Full “builder” product ideas (InstantDB, etc.). |
| **react-native-json-render** | https://github.com/CaiZongyuan/react-native-json-render | **JSON → UI** with Zod/catalog — if we add JSON-driven surfaces later, this is the pattern family (Vercel json-render ecosystem). |
| **react-native-openai-jsx** | https://github.com/cawfree/react-native-openai-jsx | Early **runtime codegen** experiment — historical interest only. |

## CLI / scaffolds (stack matrices)

| Project | URL | Takeaway |
|--------|-----|----------|
| **create-expo-stack** | https://github.com/roninoss/create-expo-stack | **Interactive stack** (Router vs RN nav, styling, Firebase/Supabase) — informs **wizard/quick prompts**. |
| **fast-expo-app** | https://github.com/Teczer/fast-expo-app | Modern CLI templates — **defaults** and **docs** tone. |
| **expo-genie-cli** | https://github.com/refactorian/expo-genie-cli | Feature scaffolding — **naming** of generated modules. |

## Agent / IDE harness

| Project | URL | Takeaway |
|--------|-----|----------|
| **ERNE** (everything-react-native-expo) | https://github.com/JubaKitiashvili/everything-react-native-expo | Many agents + **rules** for Claude Code — **operator prompts** and **checklists** (we do not bundle ERNE). |

## Generic codegen

| Project | URL | Takeaway |
|--------|-----|----------|
| **json-schema-codegen** | https://github.com/expobrain/json-schema-codegen | JSON Schema → code (generic) — parallels our **schema → TS** path. |

## Official

| Resource | URL |
|----------|-----|
| **Expo examples** | https://github.com/expo/examples |
| **Expo (org)** | https://github.com/expo |

## How we “integrate”

- **Studio → GitHub presets:** one-click load **README / package.json / Expo / tsconfig / eas / babel / metro** from public repos (including several listed above). The API derives a **dependency summary** for the copilot (token-efficient).
- **Quick prompts:** CES-style **stack** questions (styling, auth) plus **list/detail**, **integrations**, **onboarding** — without promising packages outside our **stock template**.
- **Copilot:** Always-on **builder-pattern playbook** (Discovery/Architect/Craft/Build) plus reminders that OSS stacks may use **extra** packages — REACTIVE **codegen** only emits what the **template** supports unless you extend the generator.

No automatic pull of third-party **application source** into this repo — only **documentation**, **API metadata from GitHub**, and **prompt / augment text**.
