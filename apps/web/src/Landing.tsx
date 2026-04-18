import type { AppSpec } from "./types";
import { DEMO_SPECS } from "./demoSpecs";

type Props = {
  onStartWizard: () => void;
  onLoadDemo: (spec: AppSpec, options: { jumpToReview: boolean }) => void;
};

export default function Landing({ onStartWizard, onLoadDemo }: Props) {
  return (
    <div className="landing">
      <header className="landing-hero">
        <p className="landing-eyebrow">Developer tools · Mobile · AI</p>
        <h1>Specify once. Ship React Native.</h1>
        <p className="landing-lead">
          REACTIVE turns a <strong>validated App Spec</strong> into a real <strong>Expo</strong> codebase — not a black box.
          Built for founders who need <strong>repeatable</strong> mobile MVPs, not another chat thread that hallucinates
          architecture.
        </p>
        <div className="landing-cta-row">
          <button type="button" className="btn primary landing-cta-main" onClick={onStartWizard}>
            Start the spec wizard
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onLoadDemo(DEMO_SPECS.habit, { jumpToReview: true })}
          >
            Demo: Habit app → Review
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onLoadDemo(DEMO_SPECS.recipe, { jumpToReview: true })}
          >
            Demo: Recipe app → Review
          </button>
        </div>
        <p className="landing-hint">
          For the full loop (download ZIP), run <code className="inline-code">npm run dev:platform</code> locally.
        </p>
      </header>

      <section className="landing-section">
        <h2>The problem</h2>
        <ul className="landing-list">
          <li>
            <strong>Chat-only “AI app builders”</strong> optimize for speed of first pixel — not contracts, reviews, or
            CI. Enterprises and serious founders can’t ship “whatever the model guessed.”
          </li>
          <li>
            <strong>Mobile is harder than web</strong>: navigation, permissions, stores — one unconstrained prompt
            produces brittle React Native that breaks in production.
          </li>
        </ul>
      </section>

      <section className="landing-section">
        <h2>What REACTIVE does differently</h2>
        <div className="landing-compare">
          <div className="landing-compare-col">
            <h3>Typical AI mobile builder</h3>
            <ul>
              <li>Single prompt → opaque codegen</li>
              <li>Hard to diff, hard to review, hard to test</li>
              <li>Vendor owns the “truth” until export</li>
            </ul>
          </div>
          <div className="landing-compare-col landing-compare-us">
            <h3>REACTIVE</h3>
            <ul>
              <li>
                <strong>Structured intake</strong> → frozen <strong>JSON App Spec</strong> (schema-validated)
              </li>
              <li>
                <strong>Deterministic</strong> Expo codegen + optional LLM copy polish — same spec, same tree
              </li>
              <li>
                <strong>You own the repo</strong>; ZIP includes <code className="inline-code">generatedSpec.ts</code> for
                audit trails
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <h2>Why now</h2>
        <p>
          LLMs made everyone a “builder” — but <strong>shipping</strong> still requires specs, reviews, and regression
          safety. REACTIVE is the <strong>spec-first control plane</strong> for mobile: the same shift that happened in
          backend (OpenAPI) is overdue for app UI delivery.
        </p>
      </section>

      <section className="landing-section landing-yC">
        <h2>Vision</h2>
        <p>
          Become the <strong>default way</strong> product teams go from intent → reviewable mobile artifact → App Store —
          with AI filling implementation under <strong>hard guardrails</strong>, not replacing them.
        </p>
      </section>

      <footer className="landing-footer">
        <button type="button" className="btn primary" onClick={onStartWizard}>
          Build your App Spec
        </button>
        <a
          className="landing-github"
          href="https://github.com/alexbieber/reactive"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
