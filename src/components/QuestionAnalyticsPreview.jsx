import { FiHelpCircle } from "react-icons/fi";

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

  return (
    <div className="mpr-question-analytics">
      <div className="mpr-question-analytics-head">
        <FiHelpCircle size={15} />
        <span>Question-level analytics</span>
      </div>
      <p className="mpr-question-analytics-hint">
        Lowest-scoring questions with common mistakes and misconceptions.
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

            </li>
          );
        })}
      </ul>
    </div>
  );
}
