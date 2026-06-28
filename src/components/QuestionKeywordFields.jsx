import { keywordsArrayToText, textToKeywordsArray } from "../utils/questionKeywords";

const fieldStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.75)",
  fontSize: 12,
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
};

/** Editable Earned / Missing lines shown in the PDF examiner column. */
export default function QuestionKeywordFields({ question, onChange }) {
  const updateKeywords = (field, text) => {
    onChange({
      ...question,
      [field]: textToKeywordsArray(text),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
      <div>
        <div style={{ ...labelStyle, color: "rgba(34,197,94,0.85)" }}>Earned (PDF)</div>
        <textarea
          value={keywordsArrayToText(question.markedKeywords)}
          onChange={(e) => updateKeywords("markedKeywords", e.target.value)}
          rows={2}
          placeholder="One earned point per line (shown in green on the PDF)"
          style={{
            ...fieldStyle,
            borderColor: "rgba(34,197,94,0.2)",
          }}
        />
      </div>
      <div>
        <div style={{ ...labelStyle, color: "rgba(248,113,113,0.9)" }}>Missing (PDF)</div>
        <textarea
          value={keywordsArrayToText(question.missingKeywords)}
          onChange={(e) => updateKeywords("missingKeywords", e.target.value)}
          rows={2}
          placeholder="One missing point per line (shown in red on the PDF)"
          style={{
            ...fieldStyle,
            borderColor: "rgba(248,113,113,0.2)",
          }}
        />
      </div>
    </div>
  );
}
