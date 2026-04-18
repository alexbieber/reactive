import type { AppSpec } from "./types";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "app-$1") || "my-app";
}

export function createDefaultSpec(): AppSpec {
  const now = new Date().toISOString();
  return {
    meta: {
      name: "My App",
      slug: "my-app",
      archetype: "utility",
      spec_version: "1.0.0",
      created_at: now,
      updated_at: now,
    },
    audience: {
      summary: "People who need a focused tool for one main job.",
      primary_persona: "A mobile-first user who opens the app a few times a week.",
    },
    journeys: [
      {
        id: "primary",
        name: "Primary flow",
        steps: ["Open the app", "Complete the main task", "See confirmation"],
      },
    ],
    navigation: {
      type: "tabs",
      initial_route: "home",
      routes: [
        { id: "home", path: "/home", title: "Home", icon: "home" },
        { id: "settings", path: "/settings", title: "Settings", icon: "settings" },
      ],
    },
    screens: [
      {
        id: "screen_home",
        title: "Home",
        purpose: "Main surface for the core action.",
        route_id: "home",
        blocks: ["list", "hero"],
      },
      {
        id: "screen_settings",
        title: "Settings",
        purpose: "Preferences and account placeholders.",
        route_id: "settings",
        blocks: ["settings"],
      },
    ],
    data_model: {
      entities: [
        {
          name: "Item",
          description: "Generic domain object.",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "title", type: "string", required: true },
          ],
        },
      ],
    },
    auth: { mode: "none", notes: "" },
    backend: { mode: "none", notes: "" },
    integrations: {
      push: false,
      maps: false,
      camera: false,
      payments: false,
    },
    design: {
      primary_color: "#6366F1",
      color_mode: "system",
      density: "comfortable",
      adjectives: ["minimal", "clear"],
    },
    non_goals: ["Desktop app", "Offline-first sync", "Subscription billing"],
  };
}
