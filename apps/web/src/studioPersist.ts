import type { AppSpec } from "./types";

const STORAGE_KEY = "reactive.studio.persist.v1";
const VERSION = 1;
/** Avoid blowing localStorage on huge threads */
const MAX_MESSAGES = 120;

export type StudioChatMsg = { role: "user" | "assistant"; content: string };

export type StudioPersistedV1 = {
  version: number;
  savedAt: string;
  messages: StudioChatMsg[];
  spec: AppSpec;
  specValidationError: string | null;
  pendingSpec: AppSpec | null;
};

/** Default welcome when there is no saved session or the project slug changed */
export const STUDIO_DEFAULT_WELCOME_MESSAGES: StudioChatMsg[] = [
  {
    role: "assistant",
    content: `[Discovery]
Hey — you’ve got a **multi-agent room** here (like Cursor or Claude Code): Maya, Jordan, Sam, Alex, plus Priya (Security), Riley (QA), Casey (Docs), Morgan (Perf). We talk like a real team until the spec’s worth shipping.

[Architect]
If you want **full RN source** in Monaco + ZIP, that’s **Project build** on the home page. **In here** we only ship **App Spec** as \`json\`, then **Apply** → **Preview**.

[Build]
Keys live in the sidebar (BYOK) or on the API. Once we’re rolling: **Apply** → **Build preview** and kick the tires.`,
  },
];

function trimMessages(msgs: StudioChatMsg[]): StudioChatMsg[] {
  if (msgs.length <= MAX_MESSAGES) return msgs;
  return msgs.slice(-MAX_MESSAGES);
}

function safeParse(raw: string | null): StudioPersistedV1 | null {
  if (raw == null || raw === "") return null;
  try {
    const o = JSON.parse(raw) as StudioPersistedV1;
    if (o.version !== VERSION || !Array.isArray(o.messages) || !o.spec?.meta?.slug) return null;
    return o;
  } catch {
    return null;
  }
}

export function loadStudioPersisted(): StudioPersistedV1 | null {
  if (typeof window === "undefined") return null;
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearStudioPersisted(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function saveStudioPersisted(partial: {
  messages: StudioChatMsg[];
  spec: AppSpec;
  specValidationError: string | null;
  pendingSpec: AppSpec | null;
}): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StudioPersistedV1 = {
      version: VERSION,
      savedAt: new Date().toISOString(),
      messages: trimMessages(partial.messages),
      spec: partial.spec,
      specValidationError: partial.specValidationError,
      pendingSpec: partial.pendingSpec,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      try {
        const payload: StudioPersistedV1 = {
          version: VERSION,
          savedAt: new Date().toISOString(),
          messages: trimMessages(partial.messages).slice(-40),
          spec: partial.spec,
          specValidationError: partial.specValidationError,
          pendingSpec: partial.pendingSpec,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* give up */
      }
    }
  }
}

export type HydratedStudioBoot = {
  messages: StudioChatMsg[];
  spec: AppSpec;
  specValidationError: string | null;
  pendingSpec: AppSpec | null;
};

/**
 * Restore last session when the editor spec slug matches; otherwise start fresh for a new project/demo.
 */
export function getHydratedStudioState(initialSpec: AppSpec): HydratedStudioBoot {
  const p = loadStudioPersisted();
  const fresh: HydratedStudioBoot = {
    messages: STUDIO_DEFAULT_WELCOME_MESSAGES,
    spec: initialSpec,
    specValidationError: null,
    pendingSpec: null,
  };
  if (!p || p.messages.length === 0) return fresh;

  const persistedSlug = p.spec?.meta?.slug;
  const initialSlug = initialSpec?.meta?.slug;
  if (typeof persistedSlug !== "string" || typeof initialSlug !== "string") return fresh;

  if (persistedSlug !== initialSlug) {
    return fresh;
  }

  return {
    messages: p.messages,
    spec: p.spec,
    specValidationError: p.specValidationError ?? null,
    pendingSpec: p.pendingSpec ?? null,
  };
}
