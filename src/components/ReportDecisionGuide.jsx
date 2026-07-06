export default function ReportDecisionGuide({ guide }) {
  if (!guide?.sections?.length) return null;

  return (
    <div className="mpr-decision-guide">
      <p className="mpr-decision-guide-title">Decision guide</p>
      <p className="mpr-decision-guide-hint">
        {guide.audience === "parent"
          ? "Answers to the questions parents ask most."
          : "Answers for your next lesson and intervention planning."}
      </p>
      <div className="mpr-decision-grid">
        {guide.sections.map((section) => (
          <div
            key={section.id}
            className={`mpr-decision-card mpr-decision-card--${section.tone || "gray"}`}
          >
            <p className="mpr-decision-q">{section.question}</p>
            <p className="mpr-decision-a">{section.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
