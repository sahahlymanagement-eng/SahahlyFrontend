import { FiSearch, FiX } from "react-icons/fi";

/** Match question id / printed label / topic for the results-modal search. */
export function questionMatchesSearch(question, query) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return true;
  const bare = raw.replace(/^q\s*/i, "");
  const fields = [
    question?.questionNumber,
    question?.printedQuestionNumber,
    question?.studyTopic,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .filter(Boolean);

  return fields.some(
    (field) =>
      field.includes(raw) ||
      (bare && field.includes(bare)) ||
      `q${field}`.includes(raw)
  );
}

export function filterMarkingQuestions(questions, query) {
  if (!String(query || "").trim()) return questions || [];
  return (questions || []).filter((q) => questionMatchesSearch(q, query));
}

/**
 * Search bar for jumping to a question card in the AI Marking Results left column.
 */
export default function MarkingQuestionSearchBar({
  value,
  onChange,
  matchCount = null,
  totalCount = null,
  placeholder = "Search question (e.g. 3a, Q12)…",
}) {
  const showCount =
    totalCount != null &&
    matchCount != null &&
    String(value || "").trim() !== "";

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        marginBottom: 12,
        paddingBottom: 4,
        background: "var(--surface, var(--bg, #0f1115))",
      }}
    >
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        Find question
      </label>
      <div style={{ position: "relative" }}>
        <FiSearch
          size={14}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            pointerEvents: "none",
          }}
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 34px 8px 32px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />
        {String(value || "").trim() !== "" && (
          <button
            type="button"
            title="Clear search"
            onClick={() => onChange("")}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              cursor: "pointer",
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <FiX size={14} />
          </button>
        )}
      </div>
      {showCount && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          {matchCount === 0
            ? `No questions match “${String(value).trim()}”`
            : `Showing ${matchCount} of ${totalCount}`}
        </div>
      )}
    </div>
  );
}
