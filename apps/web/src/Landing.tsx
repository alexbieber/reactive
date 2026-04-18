import BrandLogo from "./BrandLogo";
import PlatformLogoFight from "./PlatformLogoFight";
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

      <header className="landing-header">
        <div className="landing-logo-center landing-inner landing-inner--wide">
          <div className="landing-logo-scene">
            <BrandLogo variant="landing" />
            <PlatformLogoFight />
          </div>
        </div>
      </header>

      <div className="landing-inner landing-inner--wide">
        <p className="landing-scene-note">
          The header animation is decorative: it contrasts cross-platform stacks, with React Native “winning” the bout.
          REACTIVE itself is built for <strong>React Native on Expo</strong>—the wizard, Studio, and codegen all target
          that stack.
        </p>

        <section className="hero-ai hero-ai--headline-first" aria-labelledby="hero-heading">
          <div className="hero-ai-badge">
            <span className="hero-ai-badge-dot" aria-hidden />
            Spec-first React Native · Expo · BYOK
          </div>

          <h1 id="hero-heading" className="hero-ai-headline">
            <span className="hero-ai-headline-static">Specify once.</span>
            <span className="hero-ai-headline-gradient"> Ship real Expo apps.</span>
          </h1>

          <div className="hero-ai-intro">
            <p>
              <strong className="hero-ai-product-name">REACTIVE</strong> is a spec-first product for teams who want
              maintainable React Native code—not throwaway chat snippets, not an opaque black box. You keep one canonical{" "}
              <strong>App Spec</strong> (JSON, validated against a schema). The platform turns that document into{" "}
              <strong>TypeScript</strong>, <strong>Expo Router</strong> structure, and a project you can run, diff, and
              own.
            </p>
            <p>
              The motive is <strong>discipline before code</strong>: the model and the UI both work from the same
              validated spec, so you spend less time untangling hallucinated features and more time shipping. Optional
              AI in Studio proposes edits to the spec; generated output and exports only move forward when the document
              passes validation—no shortcut around the schema.
            </p>
          </div>

          <div className="hero-ai-cta">
            <button type="button" className="btn primary hero-ai-btn-primary" onClick={onStartWizard}>
              Start with the wizard
            </button>
            <button type="button" className="btn hero-ai-btn-secondary" onClick={() => onStartStudio()}>
              Open Studio
            </button>
          </div>

          <p className="hero-ai-hint">
            Local development: from the repo root, run{" "}
            <code className="inline-code">npm run dev:platform</code> to start the web app and API together. The API
            serves on port <strong className="hero-ai-mono">8787</strong> (for example{" "}
            <code className="inline-code">http://localhost:8787/api/health</code>
            ). Vite picks its own port for the browser UI, often <code className="inline-code">5173</code>.
          </p>

          <ul className="hero-ai-stack" aria-label="Technical stack">
            <li>JSON Schema validation</li>
            <li>TypeScript · Expo Router</li>
            <li>Wizard + Studio + ZIP export</li>
            <li>LLM-ready (OpenAI, Claude, Gemini, Groq, Mistral, NVIDIA NIM) · BYOK</li>
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
                  <span className="hero-ai-snippet-muted">// One spec → deterministic codegen → preview / export</span>
                </div>
                <div className="hero-ai-snippet">
                  <span className="hero-ai-snippet-k">AppSpec</span>
                  <span className="hero-ai-snippet-p">.</span>
                  <span className="hero-ai-snippet-k">validate</span>
                  <span className="hero-ai-snippet-p">() → </span>
                  <span className="hero-ai-snippet-k">expo</span>
                  <span className="hero-ai-snippet-p"> + </span>
                  <span className="hero-ai-snippet-k">router</span>
                </div>
                <div className="hero-ai-snippet">
                  <span className="hero-ai-snippet-k">meta.slug</span>
                  <span className="hero-ai-snippet-p">:</span>
                  <span className="hero-ai-snippet-v">&quot;my-app&quot;</span>
                  <span className="hero-ai-snippet-muted"> · tabs → screens → bundle</span>
                </div>
                <div className="hero-ai-progress">
                  <span className="hero-ai-progress-fill" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-card" aria-labelledby="what-heading">
          <h2 id="what-heading" className="landing-section-title">
            What REACTIVE is
          </h2>
          <div className="landing-prose">
            <p>
              REACTIVE combines a browser <strong>wizard</strong> (guided spec intake), a <strong>Studio</strong> with
              multi-operator chat and an in-browser preview, <strong>deterministic codegen</strong> into a bundled Expo
              template, <strong>ZIP download</strong> from Review, and an <strong>HTTP API</strong> for automation. Your
              App Spec holds meta, navigation, screens and blocks, data and auth modes, design tokens, and non-goals in
              one validated place.
            </p>
            <p>
              That separation matters: the generator does not improvise features outside the spec. You get normal source
              code and a stock template you can extend—the opposite of a proprietary runtime you cannot inspect.
            </p>
          </div>
        </section>

        <section className="landing-card" aria-labelledby="how-heading">
          <h2 id="how-heading" className="landing-section-title">
            How the pipeline works
          </h2>
          <ol className="landing-steps">
            <li>
              <strong>Define or edit the spec.</strong> Use the wizard, paste JSON, or work in Studio. Changes are
              checked against the JSON Schema before they count.
            </li>
            <li>
              <strong>Generate the project.</strong> Codegen materializes an Expo (React Native) project from the
              template plus your spec—predictable output, not a one-off script.
            </li>
            <li>
              <strong>Preview and refine.</strong> Studio can run a web preview and show a QR link where supported. Chat
              is organized into phases (Discovery, Architect, Craft, Build); proposed spec updates apply only when
              validation passes.
            </li>
            <li>
              <strong>Export and run.</strong> Download a ZIP from Review or call the API. Run the app with normal Expo
              tooling (<code className="inline-code">npx expo start</code>, Expo Go, EAS)—the same workflows you already
              use.
            </li>
          </ol>
        </section>

        <section className="landing-card" aria-labelledby="get-heading">
          <h2 id="get-heading" className="landing-section-title">
            What you should expect
          </h2>
          <ul className="landing-checklist">
            <li>A single schema-validated App Spec as the source of truth—not a pile of disconnected prompts.</li>
            <li>Standard Expo + TypeScript output you can open in an editor, commit, and maintain.</li>
            <li>Token usage estimates on AI calls so costs stay visible next to your provider dashboard.</li>
            <li>Bring your own API keys for supported model providers when you enable copilot features.</li>
            <li>
              Honest limits: validation and CI gates catch many issues, but no tool guarantees bug-free apps—plan for
              review and testing like any production codebase.
            </li>
          </ul>
        </section>

        <section className="landing-card landing-card--examples" aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="landing-section-title">
            Try an example
          </h2>
          <p className="landing-section-lead">
            Each demo is a full App Spec you can load instantly. Jump straight to <strong>Review</strong> to validate
            and export, or open <strong>Studio</strong> to explore chat and preview with the same document.
          </p>
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
