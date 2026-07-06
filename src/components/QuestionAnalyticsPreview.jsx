import { FiAlertTriangle, FiHelpCircle } from "react-icons/fi";

function pctTone(percent) {
  if (percent >= 60) return "green";
  if (percent >= 40) return "orange";
  return "red";
}

export default function QuestionAnalyticsPreview({
  analytics,
  includeStudentContext = false,
}) {
  const items = analytics?.lowestScoring || [];
  if (!items.length) return null;

  const extraIntervention = (analytics.requiringIntervention || []).filter(
    (q) => !items.some((i) => i.questionLabel === q.questionLabel)
  ).length;

  return (
    <div className="mpr-question-analytics">
      <div className="mpr-question-analytics-head">
        <FiHelpCircle size={15} />
        <span>Question-level analytics</span>
      </div>
      <p className="mpr-question-analytics-hint">
        Lowest-scoring questions with class-wide % correct, common mistakes, and
        intervention flags.
      </p>

      <ul className="mpr-question-list">
        {items.map((q) => {
          const tone = pctTone(q.correctPercent);
          return (
            <li
              key={q.questionLabel || q.questionNumber}
              className={`mpr-question-card mpr-question-card--${tone}`}
            >
              <div className="mpr-question-card-head">
                <strong>{q.questionLabel || `Question ${q.questionNumber}`}</strong>
                <span className={`mpr-question-pct mpr-question-pct--${tone}`}>
                  {q.correctPercent}% correct
                </span>
              </div>

              {includeStudentContext && q.studentMarks != null && (
                <p className="mpr-question-student">
                  Your child: {q.studentMarks}
                  {q.studentCorrect === true ? " (full marks)" : ""}
                </p>
              )}

              {q.commonMistake && (
                <p className="mpr-question-detail">{q.commonMistake}</p>
              )}

              {q.mostCommonMisconception &&
                q.mostCommonMisconception !== q.commonMistake && (
                  <p className="mpr-question-misconception">
                    Misconception: {q.mostCommonMisconception}
                  </p>
                )}

              {q.requiresIntervention && (
                <span className="mpr-question-flag">
                  <FiAlertTriangle size={12} />
                  Teacher intervention recommended
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {extraIntervention > 0 && (
        <p className="mpr-question-more">
          + {extraIntervention} more question{extraIntervention === 1 ? "" : "s"}{" "}
          flagged for teacher follow-up
        </p>
      )}
    </div>
  );
}
