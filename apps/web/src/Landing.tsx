import BrandLogo from "./BrandLogo";
import type { AppSpec } from "./types";
import { DEMO_SPECS } from "./demoSpecs";

type Props = {
  onStartWizard: () => void;
  onStartStudio: (opts?: { demo?: AppSpec }) => void;
  onLoadDemo: (spec: AppSpec, options: { jumpToReview: boolean }) => void;
};

export default function Landing({ onStartWizard, onStartStudio, onLoadDemo }: Props) {
  return (
    <div className="landing-page">
      <div className="landing-mesh" aria-hidden />
      <div className="landing-grid-bg" aria-hidden />

      <header className="landing-nav">
        <div className="landing-nav-inner landing-inner landing-inner--wide">
          <div className="landing-nav-brand" aria-label="REACTIVE — App Spec to Expo">
            <BrandLogo variant="nav" />
            <div className="landing-nav-text">
              <span className="landing-nav-title">REACTIVE</span>
              <span className="landing-nav-sub">App Spec → Expo · React Native</span>
            </div>
          </div>
          <nav className="landing-nav-actions" aria-label="Primary actions">
            <button type="button" className="btn ghost landing-nav-btn" onClick={() => onStartStudio()}>
              Studio
            </button>
            <button type="button" className="btn primary landing-nav-btn" onClick={onStartWizard}>
              Start building
            </button>
          </nav>
        </div>
      </header>

      <div className="landing-inner landing-inner--wide">
        <section className="hero-ai" aria-labelledby="hero-heading">
          <BrandLogo variant="hero" />
          <div className="hero-ai-badge">
            <span className="hero-ai-badge-dot" aria-hidden />
            Spec-locked · Expo · BYOK
          </div>

          <h1 id="hero-heading" className="hero-ai-headline">
            <span className="hero-ai-headline-static">Ship RN apps</span>
            <span className="hero-ai-headline-gradient"> from a frozen spec.</span>
          </h1>

          <p className="hero-ai-sub">
            Most AI RN tools stop at chat or a zip dump. REACTIVE runs a <strong>schema-locked spec → codegen → preview</strong>{" "}
            loop — TypeScript, Expo Router, export + Studio — so you ship, not guess.
          </p>

          <div className="hero-ai-cta">
            <button type="button" className="btn primary hero-ai-btn-primary" onClick={onStartWizard}>
              Start building
            </button>
            <button type="button" className="btn hero-ai-btn-secondary" onClick={() => onStartStudio()}>
              Open Studio
            </button>
          </div>

          <p className="hero-ai-hint">
            Run <code className="inline-code">npm run dev:platform</code> · API on{" "}
            <strong className="hero-ai-mono">8787</strong>
          </p>

          <ul className="hero-ai-stack" aria-label="Stack">
            <li>JSON Schema</li>
            <li>TypeScript</li>
            <li>Expo Router</li>
            <li>OpenAI-ready</li>
          </ul>

          <div className="hero-ai-visual" aria-hidden>
            <div className="hero-ai-window">
              <div className="hero-ai-window-chrome">
                <span />
                <span />
                <span />
              </div>
              <div className="hero-ai-window-body">
                <div className="hero-ai-snippet">
                  <span className="hero-ai-snippet-k">meta.slug</span>
                  <span className="hero-ai-snippet-p">:</span>
                  <span className="hero-ai-snippet-v">&quot;my-app&quot;</span>
                  <span className="hero-ai-snippet-muted">,</span>
                </div>
                <div className="hero-ai-snippet">
                  <span className="hero-ai-snippet-k">navigation</span>
                  <span className="hero-ai-snippet-p">:</span>
                  <span className="hero-ai-snippet-muted"> tabs → screens → ZIP</span>
                </div>
                <div className="hero-ai-progress">
                  <span className="hero-ai-progress-fill" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-card landing-card--examples" aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="landing-section-title">
            Try an example
          </h2>
          <p className="landing-section-lead">Load a ready-made spec — jump to Review or open in Studio.</p>
          <div className="landing-cta-row landing-cta-row--examples">
            <button type="button" className="btn" onClick={() => onLoadDemo(DEMO_SPECS.habit, { jumpToReview: true })}>
              Habit app → Review
            </button>
            <button type="button" className="btn" onClick={() => onLoadDemo(DEMO_SPECS.recipe, { jumpToReview: true })}>
              Recipe app → Review
            </button>
            <button type="button" className="btn" onClick={() => onStartStudio({ demo: DEMO_SPECS.habit })}>
              Habit app → Studio
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
