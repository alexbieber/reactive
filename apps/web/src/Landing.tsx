import { useState } from "react";
import BrandLogo from "./BrandLogo";
import PlatformLogoFight from "./PlatformLogoFight";
import { useBuilderStore } from "./builder/builderStore";
import type { AppSpec } from "./types";
import { DEMO_SPECS } from "./demoSpecs";

type Props = {
  onStartWizard: () => void;
  onStartStudio: (opts?: { demo?: AppSpec }) => void;
  onLoadDemo: (spec: AppSpec, options: { jumpToReview: boolean }) => void;
  onProjectBuild: () => void;
  onTeamRoom: () => void;
};

const SEED_CHIPS = [
  "A fitness tracker with workouts and streaks",
  "A recipe browser with favorites",
  "A habit tracker with reminders",
];

export default function Landing({ onStartWizard, onStartStudio, onLoadDemo, onProjectBuild, onTeamRoom }: Props) {
  const [seedPrompt, setSeedPrompt] = useState("");
  const resetBuilder = useBuilderStore((s) => s.reset);
  const setBuilderPrompt = useBuilderStore((s) => s.setPrompt);
  return (
    <div className="landing-page">
      <div className="landing-mesh" aria-hidden />
      <div className="landing-grid-bg" aria-hidden />

      <header className="landing-header">
        <div className="landing-logo-center landing-inner landing-inner--wide">
          <div className="landing-logo-scene">
            <BrandLogo variant="landing" />
            <PlatformLogoFight />
          </div>
        </div>
      </header>

      <div className="landing-inner landing-inner--wide">
        <section className="hero-ai hero-ai--headline-first" aria-labelledby="hero-heading">
          <div className="hero-ai-badge">
            <span className="hero-ai-badge-dot" aria-hidden />
            Expo · React Native · App Spec → code
          </div>

          <h1 id="hero-heading" className="hero-ai-headline">
            <span className="hero-ai-headline-static">Describe your app.</span>
            <span className="hero-ai-headline-gradient"> Get a real Expo project.</span>
          </h1>

          <p className="hero-ai-sub hero-ai-sub--single">
            Fill the wizard to produce a validated <strong>App Spec</strong>, then generate TypeScript + Expo Router and
            download a ZIP. Use <strong>Studio</strong> when you want copilot help on the spec.
          </p>

          <div className="hero-ai-cta">
            <button type="button" className="btn primary hero-ai-btn-primary" onClick={onStartWizard}>
              Start building
            </button>
            <button type="button" className="btn hero-ai-btn-secondary" onClick={() => onStartStudio()}>
              Open Studio
            </button>
            <button type="button" className="btn hero-ai-btn-secondary" onClick={onTeamRoom}>
              Team Space
            </button>
          </div>

          <p className="hero-ai-hint">
            Dev: <code className="inline-code">npm run dev:platform</code> · API{" "}
            <strong className="hero-ai-mono">8788</strong>
          </p>

          <ul className="hero-ai-stack" aria-label="Stack">
            <li>Wizard</li>
            <li>Project build (full Expo tree)</li>
            <li>Studio</li>
            <li>Team Space (host + join)</li>
            <li>ZIP export</li>
          </ul>
        </section>

        <section className="landing-card landing-card--project" aria-labelledby="project-heading">
          <h2 id="project-heading" className="landing-section-title">
            Project build
          </h2>
          <p className="landing-section-lead">
            Prompt → clarifying questions → streamed <code className="inline-code">===FILE===</code> blocks → full Expo project in
            Monaco + ZIP. Same API keys as Studio.
          </p>
          <textarea
            className="landing-project-textarea"
            rows={3}
            placeholder="Describe your app in one or two sentences…"
            value={seedPrompt}
            onChange={(e) => setSeedPrompt(e.target.value)}
          />
          <div className="landing-cta-row landing-chips">
            {SEED_CHIPS.map((c) => (
              <button key={c} type="button" className="btn landing-chip" onClick={() => setSeedPrompt(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="landing-cta-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                resetBuilder();
                setBuilderPrompt(seedPrompt.trim() || SEED_CHIPS[0]);
                onProjectBuild();
              }}
            >
              Continue to project build
            </button>
          </div>
        </section>

        <section className="landing-card landing-card--examples" aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="landing-section-title">
            Try an example
          </h2>
          <p className="landing-section-lead">Load a demo spec — Review to export or Studio to iterate.</p>
          <div className="landing-cta-row landing-cta-row--examples">
            <button type="button" className="btn" onClick={() => onLoadDemo(DEMO_SPECS.habit, { jumpToReview: true })}>
              Habit → Review
            </button>
            <button type="button" className="btn" onClick={() => onLoadDemo(DEMO_SPECS.recipe, { jumpToReview: true })}>
              Recipe → Review
            </button>
            <button type="button" className="btn" onClick={() => onStartStudio({ demo: DEMO_SPECS.habit })}>
              Habit → Studio
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
