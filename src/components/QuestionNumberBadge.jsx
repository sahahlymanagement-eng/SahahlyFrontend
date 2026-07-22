import { formatPrintedLabelHint, hasPrintedLabelMismatch } from "../utils/questionLabelDisplay";

export default function QuestionNumberBadge({ question, style = {} }) {
  const hint = formatPrintedLabelHint(question);

  return (
    <>
      <span style={{ fontSize: 14, fontWeight: 700, ...style }}>
        Q{question?.questionNumber}
      </span>
      {hint && (
        <span
          title="Label printed on the student page — mark scheme uses a different number"
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 500,
          }}
        >
          ({hint})
        </span>
      )}
      {question?._labelCorrected && !hasPrintedLabelMismatch(question) && (
        <span
          title="Question number was corrected from page label to mark-scheme id"
          style={{ fontSize: 11, color: "#60a5fa", fontWeight: 500 }}
        >
          (MS id)
        </span>
      )}
    </>
  );
}
