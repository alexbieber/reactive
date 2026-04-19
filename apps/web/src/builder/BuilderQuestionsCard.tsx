import type { BuilderAnswer, BuilderQuestion } from "./types";
import { answersComplete } from "./builderStore";

type Props = {
  questions: BuilderQuestion[];
  answers: BuilderAnswer[];
  llmReady: boolean;
  onAnswer: (questionId: number, value: string) => void;
  onBack: () => void;
  onGenerate: () => void;
};

export default function BuilderQuestionsCard({
  questions,
  answers,
  llmReady,
  onAnswer,
  onBack,
  onGenerate,
}: Props) {
  const complete = answersComplete(questions, answers);
  return (
    <section className="builder-card" aria-labelledby="qb-q">
      <h2 id="qb-q" className="builder-card__title">
        2 · Answer the questions
      </h2>
      <ol className="builder-q-list">
        {questions.map((q) => (
          <li key={q.id} className="builder-q-item">
            <p className="builder-q-text">{q.question}</p>
            {q.type === "choice" && q.options?.length ? (
              <select
                className="builder-select"
                value={answers.find((a) => a.questionId === q.id)?.value ?? ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
              >
                <option value="">Choose…</option>
                {q.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="builder-input"
                value={answers.find((a) => a.questionId === q.id)?.value ?? ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                placeholder="Your answer"
              />
            )}
          </li>
        ))}
      </ol>
      <div className="builder-actions">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!complete || !llmReady}
          title={
            !llmReady
              ? "Add an API key in the section above (or server env key)"
              : complete
                ? "POST /api/builder/generate-stream — full Expo tree"
                : "Answer every question above to enable Generate"
          }
          onClick={() => void onGenerate()}
        >
          Generate app
        </button>
      </div>
    </section>
  );
}
