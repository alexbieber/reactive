import { PROJECT_BUILD_CHIPS } from "./projectBuildConstants";

type Props = {
  prompt: string;
  onPromptChange: (v: string) => void;
  loadingClarify: boolean;
  llmReady: boolean;
  onGetQuestions: () => void;
};

export default function BuilderPromptCard({
  prompt,
  onPromptChange,
  loadingClarify,
  llmReady,
  onGetQuestions,
}: Props) {
  return (
    <section className="builder-card" aria-labelledby="qb-prompt">
      <h2 id="qb-prompt" className="builder-card__title">
        1 · What are you building?
      </h2>
      <textarea
        className="builder-textarea"
        rows={5}
        placeholder="e.g. A small app to track daily water intake with reminders…"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
      />
      <div className="builder-chips">
        {PROJECT_BUILD_CHIPS.map((c) => (
          <button key={c} type="button" className="btn builder-chip" onClick={() => onPromptChange(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="builder-actions">
        <button
          type="button"
          className="btn primary"
          disabled={loadingClarify || !prompt.trim() || !llmReady}
          onClick={() => void onGetQuestions()}
        >
          {loadingClarify ? "Asking the model…" : "Get clarifying questions"}
        </button>
      </div>
    </section>
  );
}
