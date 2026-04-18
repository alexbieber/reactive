# REACTIVE Expo template

Opinionated **Expo SDK 54** starter with **Expo Router** (tabs + stack). Codegen agents should extend this tree rather than invent a new one.

## Conventions

| Area | Choice |
|------|--------|
| Router | `expo-router` — file-based routes under `app/` |
| Styling | `StyleSheet` + `constants/Colors.ts` theme tokens |
| Icons | `@expo/vector-icons` (FontAwesome) |
| Types | TypeScript strict (see `tsconfig.json`) |

## DO_NOT_TOUCH (unless spec explicitly requires app-wide architecture change)

- `app/_layout.tsx` root shell (fonts, splash) — **may** adjust `ThemeProvider` colors when implementing `design.*`
- `expo-router` entry and `app.json` bundle identifiers — change only if product slug / name is part of spec `meta`
- `package.json` dependency set — extend only per allowlist below

## Allowed dependency additions (when spec requires)

- `@react-native-async-storage/async-storage` — local persistence
- `zod` — runtime validation (optional)

Any other package: **do not add**; list under Deferred in `GENERATION_NOTES.md`.

## Codegen targets

- **Tabs / screens:** `app/(tabs)/` and additional routes under `app/` as needed for stack screens referenced in the App Spec.
- **Theme:** `constants/Colors.ts` — map `design.primary_color`, `design.color_mode`, `design.density`.
- **Components:** Prefer `components/` for reusable UI blocks (lists, forms).

## Preview

```bash
cd template/expo-starter
npm install
npx expo start
```

Scan with Expo Go or run iOS/Android simulator.
