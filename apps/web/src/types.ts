export type Archetype = "content" | "utility" | "social-lite" | "marketplace-lite" | "other";

export type Block =
  | "list"
  | "detail"
  | "form"
  | "settings"
  | "chart"
  | "hero"
  | "empty-state"
  | "custom";

export interface AppSpec {
  meta: {
    name: string;
    slug: string;
    archetype: Archetype;
    spec_version: string;
    created_at?: string;
    updated_at?: string;
  };
  audience: {
    summary: string;
    primary_persona: string;
  };
  journeys: Array<{
    id: string;
    name: string;
    steps: string[];
  }>;
  navigation: {
    type: "tabs" | "stack" | "tabs-stack";
    initial_route: string;
    routes: Array<{
      id: string;
      path: string;
      title: string;
      icon?: string;
    }>;
  };
  screens: Array<{
    id: string;
    title: string;
    purpose: string;
    route_id?: string;
    blocks: Block[];
  }>;
  data_model: {
    entities: Array<{
      name: string;
      description?: string;
      fields: Array<{
        name: string;
        type: "string" | "number" | "boolean" | "date" | "json";
        required?: boolean;
      }>;
    }>;
  };
  auth: {
    mode: "none" | "email" | "social" | "email-social";
    notes?: string;
  };
  backend: {
    mode: "none" | "rest" | "supabase-ready" | "firebase-ready";
    base_url_placeholder?: string;
    notes?: string;
  };
  integrations: {
    push: boolean;
    maps: boolean;
    camera: boolean;
    payments: boolean;
  };
  design: {
    primary_color: string;
    color_mode: "light" | "dark" | "system";
    density: "compact" | "comfortable" | "spacious";
    adjectives?: string[];
  };
  non_goals: string[];
}
