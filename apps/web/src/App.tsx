import { useEffect, useMemo, useState } from "react";
import { createDefaultSpec, slugify } from "./defaultSpec";
import Landing from "./Landing";
import type { AppSpec, Archetype, Block } from "./types";
import { stampTimes, validateSpec } from "./validateSpec";

const STEPS = [
  "Project",
  "Audience",
  "Journeys",
  "Tabs",
  "Screens",
  "Data model",
  "Auth & cloud",
  "Design",
  "Non-goals",
  "Review",
] as const;

const ARCHETYPES: { id: Archetype; label: string }[] = [
  { id: "utility", label: "Utility" },
  { id: "content", label: "Content" },
  { id: "social-lite", label: "Social (light)" },
  { id: "marketplace-lite", label: "Marketplace (light)" },
  { id: "other", label: "Other" },
];

const BLOCKS: Block[] = [
  "list",
  "detail",
  "form",
  "settings",
  "chart",
  "hero",
  "empty-state",
  "custom",
];

const apiBase = import.meta.env.VITE_API_BASE ?? "";

function initialView(): "landing" | "wizard" {
  if (typeof window === "undefined") return "landing";
  const q = new URLSearchParams(window.location.search);
  if (q.get("wizard") === "1" || q.get("build") === "1") return "wizard";
  return "landing";
}

export default function App() {
  const [view, setView] = useState<"landing" | "wizard">(initialView);
  const [step, setStep] = useState(0);
  const [spec, setSpec] = useState<AppSpec>(() => createDefaultSpec());

  useEffect(() => {
    const onPop = () => setView(initialView());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipMessage, setZipMessage] = useState<string | null>(null);

  const v = useMemo(() => validateSpec(spec), [spec]);

  function update<K extends keyof AppSpec>(key: K, value: AppSpec[K]) {
    setSpec((s) => ({ ...s, [key]: value }));
    setValidationError(null);
  }

  function downloadJson() {
    const finalSpec = stampTimes(spec);
    const res = validateSpec(finalSpec);
    if (!res.ok) {
      setValidationError(res.message);
      return;
    }
    const blob = new Blob([JSON.stringify(finalSpec, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${finalSpec.meta.slug}.spec.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadExpoZip() {
    const finalSpec = stampTimes(spec);
    const res = validateSpec(finalSpec);
    if (!res.ok) {
      setValidationError(res.message);
      setZipMessage(null);
      return;
    }
    setZipLoading(true);
    setZipMessage(null);
    setValidationError(null);
    try {
      const url = `${apiBase}/api/generate`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalSpec),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const msg =
          typeof errJson.error === "string"
            ? errJson.error
            : typeof errJson.message === "string"
              ? errJson.message
              : (await response.text()) || response.statusText;
        throw new Error(msg);
      }
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${finalSpec.meta.slug}-expo.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setZipMessage("ZIP downloaded — unzip, then run: npm install && npx expo start");
    } catch (e) {
      setZipMessage(null);
      setValidationError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipLoading(false);
    }
  }

  if (view === "landing") {
    return (
      <div className="app-shell app-shell--wide">
        <Landing
          onStartWizard={() => {
            setSpec(createDefaultSpec());
            setStep(0);
            setView("wizard");
            setValidationError(null);
            window.history.pushState({}, "", "?wizard=1");
          }}
          onLoadDemo={(loaded, opts) => {
            setSpec(loaded);
            setStep(opts.jumpToReview ? 9 : 0);
            setView("wizard");
            setValidationError(null);
            window.history.pushState({}, "", "?wizard=1");
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="brand brand-row">
        <div>
          <h1>REACTIVE</h1>
          <span>beta</span>
        </div>
        <button
          type="button"
          className="btn link-back"
          onClick={() => {
            setView("landing");
            window.history.pushState({}, "", "/");
          }}
        >
          ← Product story
        </button>
      </div>
      <p className="tagline">
        Guided App Spec → frozen JSON → Expo project. Run <code className="inline-code">npm run dev:platform</code> for
        the API, then download a ready-to-run ZIP from the Review step.
      </p>

      <div className="step-indicator">
        {STEPS.map((label, i) => (
          <span key={label} className={`step-pill ${i === step ? "active" : ""}`}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {validationError && <div className="error-banner">{validationError}</div>}

      {step === 0 && (
        <ProjectStep
          spec={spec}
          onChange={setSpec}
          onMetaName={(name) =>
            setSpec((s) => ({
              ...s,
              meta: { ...s.meta, name, slug: slugify(name) },
            }))
          }
        />
      )}
      {step === 1 && (
        <div className="panel">
          <h2>Audience</h2>
          <div className="field">
            <label>Who is it for? (summary)</label>
            <textarea
              value={spec.audience.summary}
              onChange={(e) =>
                update("audience", { ...spec.audience, summary: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Primary persona</label>
            <textarea
              value={spec.audience.primary_persona}
              onChange={(e) =>
                update("audience", { ...spec.audience, primary_persona: e.target.value })
              }
            />
          </div>
        </div>
      )}
      {step === 2 && <JourneysStep spec={spec} onChange={setSpec} />}
      {step === 3 && <TabsStep spec={spec} onChange={setSpec} />}
      {step === 4 && <ScreensStep spec={spec} onChange={setSpec} />}
      {step === 5 && <DataStep spec={spec} onChange={setSpec} />}
      {step === 6 && (
        <div className="panel">
          <h2>Auth & backend</h2>
          <div className="row-2">
            <div className="field">
              <label>Auth</label>
              <select
                value={spec.auth.mode}
                onChange={(e) =>
                  update("auth", {
                    ...spec.auth,
                    mode: e.target.value as AppSpec["auth"]["mode"],
                  })
                }
              >
                <option value="none">None (local / guest)</option>
                <option value="email">Email</option>
                <option value="social">Social</option>
                <option value="email-social">Email + social</option>
              </select>
            </div>
            <div className="field">
              <label>Backend</label>
              <select
                value={spec.backend.mode}
                onChange={(e) =>
                  update("backend", {
                    ...spec.backend,
                    mode: e.target.value as AppSpec["backend"]["mode"],
                  })
                }
              >
                <option value="none">None (local only)</option>
                <option value="rest">REST API (bring your URL)</option>
                <option value="supabase-ready">Supabase-ready stub</option>
                <option value="firebase-ready">Firebase-ready stub</option>
              </select>
            </div>
          </div>
          {spec.backend.mode === "rest" && (
            <div className="field">
              <label>Env placeholder for API base</label>
              <input
                value={spec.backend.base_url_placeholder ?? ""}
                placeholder="EXPO_PUBLIC_API_URL"
                onChange={(e) =>
                  update("backend", {
                    ...spec.backend,
                    base_url_placeholder: e.target.value || undefined,
                  })
                }
              />
            </div>
          )}
          <div className="field">
            <label>Notes (optional)</label>
            <textarea
              value={spec.auth.notes ?? ""}
              onChange={(e) => update("auth", { ...spec.auth, notes: e.target.value })}
            />
          </div>
          <h2 style={{ marginTop: "1.25rem" }}>Device integrations</h2>
          <div className="chips">
            {(
              [
                ["push", "Push"],
                ["maps", "Maps"],
                ["camera", "Camera"],
                ["payments", "Payments"],
              ] as const
            ).map(([k, label]) => (
              <span
                key={k}
                className={`chip-toggle ${spec.integrations[k] ? "on" : ""}`}
                onClick={() =>
                  update("integrations", { ...spec.integrations, [k]: !spec.integrations[k] })
                }
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
      {step === 7 && (
        <div className="panel">
          <h2>Design</h2>
          <div className="row-2">
            <div className="field">
              <label>Primary color (#RRGGBB)</label>
              <input
                value={spec.design.primary_color}
                onChange={(e) =>
                  update("design", { ...spec.design, primary_color: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Color mode</label>
              <select
                value={spec.design.color_mode}
                onChange={(e) =>
                  update("design", {
                    ...spec.design,
                    color_mode: e.target.value as AppSpec["design"]["color_mode"],
                  })
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Density</label>
            <select
              value={spec.design.density}
              onChange={(e) =>
                update("design", {
                  ...spec.design,
                  density: e.target.value as AppSpec["design"]["density"],
                })
              }
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </select>
          </div>
          <div className="field">
            <label>Adjectives (comma-separated)</label>
            <input
              value={(spec.design.adjectives ?? []).join(", ")}
              onChange={(e) =>
                update("design", {
                  ...spec.design,
                  adjectives: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>
      )}
      {step === 8 && (
        <div className="panel">
          <h2>Non-goals (excluded from v1)</h2>
          <div className="field">
            <label>One per line — codegen must not build these</label>
            <textarea
              value={spec.non_goals.join("\n")}
              onChange={(e) =>
                update(
                  "non_goals",
                  e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean)
                )
              }
            />
          </div>
        </div>
      )}
      {step === 9 && (
        <div className="panel">
          <h2>Review</h2>
          {!v.ok && (
            <div className="error-banner" style={{ marginBottom: "0.75rem" }}>
              {v.message}
            </div>
          )}
          {v.ok && <p style={{ color: "var(--muted)", marginTop: 0 }}>Spec validates against the JSON Schema.</p>}
          <div className="json-preview">{JSON.stringify(spec, null, 2)}</div>
          <small className="hint" style={{ marginTop: "0.75rem" }}>
            CLI alternative:{" "}
            <code className="inline-code">
              npm run codegen -- path/to/{spec.meta.slug}.spec.json ./out/MyApp
            </code>
          </small>
          {zipMessage && (
            <p style={{ color: "var(--accent)", marginTop: "0.75rem", fontSize: "0.9rem" }}>{zipMessage}</p>
          )}
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </button>
        {step < STEPS.length - 1 && (
          <button type="button" className="btn primary" onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        )}
        {step === STEPS.length - 1 && (
          <>
            <button type="button" className="btn primary" onClick={downloadJson}>
              Download App Spec JSON
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!v.ok || zipLoading}
              onClick={downloadExpoZip}
            >
              {zipLoading ? "Building ZIP…" : "Download Expo project (ZIP)"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProjectStep({
  spec,
  onChange,
  onMetaName,
}: {
  spec: AppSpec;
  onChange: (s: AppSpec) => void;
  onMetaName: (name: string) => void;
}) {
  return (
    <div className="panel">
      <h2>Project</h2>
      <div className="field">
        <label>App name</label>
        <input
          value={spec.meta.name}
          onChange={(e) => onMetaName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Slug (lowercase, hyphens)</label>
        <input
          value={spec.meta.slug}
          onChange={(e) =>
            onChange({
              ...spec,
              meta: { ...spec.meta, slug: e.target.value },
            })
          }
        />
        <small className="hint">Used for package name and Expo slug.</small>
      </div>
      <div className="field">
        <label>Archetype</label>
        <select
          value={spec.meta.archetype}
          onChange={(e) =>
            onChange({
              ...spec,
              meta: { ...spec.meta, archetype: e.target.value as Archetype },
            })
          }
        >
          {ARCHETYPES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function JourneysStep({
  spec,
  onChange,
}: {
  spec: AppSpec;
  onChange: (s: AppSpec) => void;
}) {
  return (
    <div className="panel">
      <h2>User journeys</h2>
      <div className="list-editor">
        {spec.journeys.map((j, idx) => (
          <div key={j.id} className="list-item">
            <header>
              <span>Journey {idx + 1}</span>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() =>
                  onChange({
                    ...spec,
                    journeys: spec.journeys.filter((_, i) => i !== idx),
                  })
                }
              >
                Remove
              </button>
            </header>
            <div className="row-2">
              <div className="field">
                <label>ID (snake_case)</label>
                <input
                  value={j.id}
                  onChange={(e) => {
                    const next = [...spec.journeys];
                    next[idx] = { ...j, id: e.target.value };
                    onChange({ ...spec, journeys: next });
                  }}
                />
              </div>
              <div className="field">
                <label>Name</label>
                <input
                  value={j.name}
                  onChange={(e) => {
                    const next = [...spec.journeys];
                    next[idx] = { ...j, name: e.target.value };
                    onChange({ ...spec, journeys: next });
                  }}
                />
              </div>
            </div>
            <div className="field">
              <label>Steps (one per line)</label>
              <textarea
                value={j.steps.join("\n")}
                onChange={(e) => {
                  const next = [...spec.journeys];
                  next[idx] = {
                    ...j,
                    steps: e.target.value
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean),
                  };
                  onChange({ ...spec, journeys: next });
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange({
            ...spec,
            journeys: [
              ...spec.journeys,
              {
                id: `journey_${spec.journeys.length + 1}`,
                name: "New journey",
                steps: ["Step one"],
              },
            ],
          })
        }
      >
        Add journey
      </button>
    </div>
  );
}

function TabsStep({
  spec,
  onChange,
}: {
  spec: AppSpec;
  onChange: (s: AppSpec) => void;
}) {
  const routeIds = spec.navigation.routes.map((r) => r.id);
  return (
    <div className="panel">
      <h2>Tab bar</h2>
      <div className="field">
        <label>Initial tab (route id)</label>
        <select
          value={spec.navigation.initial_route}
          onChange={(e) =>
            onChange({
              ...spec,
              navigation: { ...spec.navigation, initial_route: e.target.value },
            })
          }
        >
          {routeIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
      <small className="hint" style={{ marginBottom: "1rem" }}>
        Codegen v1 supports <strong>tabs</strong> only. Keep navigation type as tabs in exported JSON (wizard keeps
        tabs).
      </small>
      <div className="list-editor">
        {spec.navigation.routes.map((r, idx) => (
          <div key={r.id} className="list-item">
            <header>
              <span>Tab {idx + 1}</span>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() => {
                  const routes = spec.navigation.routes.filter((_, i) => i !== idx);
                  onChange({
                    ...spec,
                    navigation: {
                      ...spec.navigation,
                      routes,
                      initial_route: routes.some((x) => x.id === spec.navigation.initial_route)
                        ? spec.navigation.initial_route
                        : routes[0]?.id ?? "home",
                    },
                  });
                }}
              >
                Remove
              </button>
            </header>
            <div className="row-2">
              <div className="field">
                <label>Route id</label>
                <input
                  value={r.id}
                  onChange={(e) => {
                    const routes = [...spec.navigation.routes];
                    const old = routes[idx].id;
                    routes[idx] = { ...r, id: e.target.value, path: `/${e.target.value}` };
                    onChange({
                      ...spec,
                      navigation: {
                        ...spec.navigation,
                        routes,
                        initial_route:
                          spec.navigation.initial_route === old ? e.target.value : spec.navigation.initial_route,
                      },
                    });
                  }}
                />
              </div>
              <div className="field">
                <label>Title</label>
                <input
                  value={r.title}
                  onChange={(e) => {
                    const routes = [...spec.navigation.routes];
                    routes[idx] = { ...r, title: e.target.value };
                    onChange({ ...spec, navigation: { ...spec.navigation, routes } });
                  }}
                />
              </div>
            </div>
            <div className="field">
              <label>Icon key (FontAwesome-style: home, cog, …)</label>
              <input
                value={r.icon ?? ""}
                onChange={(e) => {
                  const routes = [...spec.navigation.routes];
                  routes[idx] = { ...r, icon: e.target.value || undefined };
                  onChange({ ...spec, navigation: { ...spec.navigation, routes } });
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const n = spec.navigation.routes.length + 1;
          const id = `tab${n}`;
          onChange({
            ...spec,
            navigation: {
              ...spec.navigation,
              routes: [...spec.navigation.routes, { id, path: `/${id}`, title: `Tab ${n}`, icon: "home" }],
            },
          });
        }}
      >
        Add tab
      </button>
    </div>
  );
}

function ScreensStep({
  spec,
  onChange,
}: {
  spec: AppSpec;
  onChange: (s: AppSpec) => void;
}) {
  const routeIds = spec.navigation.routes.map((r) => r.id);
  return (
    <div className="panel">
      <h2>Screens</h2>
      <div className="list-editor">
        {spec.screens.map((sc, idx) => (
          <div key={sc.id} className="list-item">
            <header>
              <span>Screen {idx + 1}</span>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() =>
                  onChange({
                    ...spec,
                    screens: spec.screens.filter((_, i) => i !== idx),
                  })
                }
              >
                Remove
              </button>
            </header>
            <div className="row-2">
              <div className="field">
                <label>Screen id</label>
                <input
                  value={sc.id}
                  onChange={(e) => {
                    const screens = [...spec.screens];
                    screens[idx] = { ...sc, id: e.target.value };
                    onChange({ ...spec, screens });
                  }}
                />
              </div>
              <div className="field">
                <label>Title</label>
                <input
                  value={sc.title}
                  onChange={(e) => {
                    const screens = [...spec.screens];
                    screens[idx] = { ...sc, title: e.target.value };
                    onChange({ ...spec, screens });
                  }}
                />
              </div>
            </div>
            <div className="field">
              <label>Purpose</label>
              <textarea
                value={sc.purpose}
                onChange={(e) => {
                  const screens = [...spec.screens];
                  screens[idx] = { ...sc, purpose: e.target.value };
                  onChange({ ...spec, screens });
                }}
              />
            </div>
            <div className="field">
              <label>Tab (route_id)</label>
              <select
                value={sc.route_id ?? ""}
                onChange={(e) => {
                  const screens = [...spec.screens];
                  screens[idx] = { ...sc, route_id: e.target.value || undefined };
                  onChange({ ...spec, screens });
                }}
              >
                <option value="">— optional —</option>
                {routeIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>UI blocks</label>
              <div className="chips">
                {BLOCKS.map((b) => (
                  <span
                    key={b}
                    className={`chip-toggle ${sc.blocks.includes(b) ? "on" : ""}`}
                    onClick={() => {
                      const screens = [...spec.screens];
                      const blocks = sc.blocks.includes(b)
                        ? sc.blocks.filter((x) => x !== b)
                        : [...sc.blocks, b];
                      screens[idx] = { ...sc, blocks };
                      onChange({ ...spec, screens });
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange({
            ...spec,
            screens: [
              ...spec.screens,
              {
                id: `screen_${spec.screens.length + 1}`,
                title: "New screen",
                purpose: "Describe the purpose.",
                route_id: routeIds[0],
                blocks: ["list"],
              },
            ],
          })
        }
      >
        Add screen
      </button>
    </div>
  );
}

function DataStep({
  spec,
  onChange,
}: {
  spec: AppSpec;
  onChange: (s: AppSpec) => void;
}) {
  return (
    <div className="panel">
      <h2>Data model</h2>
      <div className="list-editor">
        {spec.data_model.entities.map((ent, ei) => (
          <div key={ei} className="list-item">
            <header>
              <span>Entity {ei + 1}</span>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                onClick={() =>
                  onChange({
                    ...spec,
                    data_model: {
                      entities: spec.data_model.entities.filter((_, i) => i !== ei),
                    },
                  })
                }
              >
                Remove
              </button>
            </header>
            <div className="field">
              <label>Name</label>
              <input
                value={ent.name}
                onChange={(e) => {
                  const entities = [...spec.data_model.entities];
                  entities[ei] = { ...ent, name: e.target.value };
                  onChange({ ...spec, data_model: { entities } });
                }}
              />
            </div>
            <div className="field">
              <label>Fields (one per line: name:type:required)</label>
              <textarea
                value={ent.fields
                  .map((f) => `${f.name}:${f.type}${f.required ? ":required" : ""}`)
                  .join("\n")}
                onChange={(e) => {
                  const lines = e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean);
                  const fields = lines.map((line) => {
                    const [name, type, req] = line.split(":").map((x) => x.trim());
                    return {
                      name: name || "field",
                      type: (type || "string") as "string" | "number" | "boolean" | "date" | "json",
                      required: req === "required",
                    };
                  });
                  const entities = [...spec.data_model.entities];
                  entities[ei] = { ...ent, fields };
                  onChange({ ...spec, data_model: { entities } });
                }}
              />
              <small className="hint">Example: id:string:required, title:string, count:number</small>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange({
            ...spec,
            data_model: {
              entities: [
                ...spec.data_model.entities,
                {
                  name: "Entity",
                  fields: [{ name: "id", type: "string", required: true }],
                },
              ],
            },
          })
        }
      >
        Add entity
      </button>
    </div>
  );
}
