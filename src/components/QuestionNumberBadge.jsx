import {
  formatMsLabelHint,
  getDisplayQuestionNumber,
} from "../utils/questionLabelDisplay";

export default function QuestionNumberBadge({ question, guidance, style = {} }) {
  const displayNumber = getDisplayQuestionNumber(question, guidance);
  const msHint = formatMsLabelHint(question, guidance);

  return (
    <>
      <span style={{ fontSize: 14, fontWeight: 700, ...style }}>Q{displayNumber}</span>
      {msHint && (
        <span
          title="Internal mark-scheme reference for this item"
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 500,
          }}
        >
          ({msHint})
        </span>
      )}
    </>
  );
}
