import { useState } from "react";
import { createTeacherAnnotation } from "../utils/teacherAnnotations";

export default function TeacherAnnotationsEditor({
  annotations,
  onChange,
  questions = [],
}) {
  const [text, setText] = useState("");
  const [anchorType, setAnchorType] = useState("question");
  const [questionNumber, setQuestionNumber] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [yPercent, setYPercent] = useState(30);

  const questionOptions = (questions || []).map((q) => String(q.questionNumber));

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (anchorType === "question") {
      if (!questionNumber) return;
      onChange([
        ...annotations,
        createTeacherAnnotation({
          text: trimmed,
          anchorType: "question",
          questionNumber,
        }),
      ]);
    } else {
      onChange([
        ...annotations,
        createTeacherAnnotation({
          text: trimmed,
          anchorType: "custom",
          pageNumber,
          yPercent,
        }),
      ]);
    }

    setText("");
  };

  const handleRemove = (id) => {
    onChange(annotations.filter((a) => a.id !== id));
  };

  const placementLabel = (a) => {
    if (a.anchorType === "question" && a.questionNumber) {
      return `Beside Q${a.questionNumber}`;
    }
    return `Page ${a.pageNumber}, ${a.yPercent}% down`;
  };

  return (
    <div className="msv-teacher-annotations">
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.4)",
          marginBottom: 8,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Extra annotations (add-only)
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Write an extra note for the student paper…"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(99,102,241,0.25)",
          background: "rgba(99,102,241,0.06)",
          color: "rgba(255,255,255,0.8)",
          fontSize: 12,
          resize: "vertical",
          boxSizing: "border-box",
          fontFamily: "inherit",
          outline: "none",
          marginBottom: 8,
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <select
          className="msv-annotation-select"
          value={anchorType}
          onChange={(e) => setAnchorType(e.target.value)}
        >
          <option value="question">Beside a question</option>
          <option value="custom">Custom position</option>
        </select>

        {anchorType === "question" ? (
          <select
            className="msv-annotation-select"
            value={questionNumber}
            onChange={(e) => setQuestionNumber(e.target.value)}
            style={{ minWidth: 90 }}
          >
            <option value="">Select question</option>
            {questionOptions.map((qn) => (
              <option key={qn} value={qn}>
                Q{qn}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="number"
              className="msv-annotation-input"
              min={1}
              value={pageNumber}
              onChange={(e) => setPageNumber(Math.max(1, Number(e.target.value) || 1))}
              title="Page number"
              style={{ width: 56 }}
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Page</span>
            <input
              type="number"
              className="msv-annotation-input"
              min={0}
              max={100}
              value={yPercent}
              onChange={(e) =>
                setYPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
              title="Position % down the page"
              style={{ width: 56 }}
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>% down</span>
          </>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={!text.trim() || (anchorType === "question" && !questionNumber)}
          className="msv-btn-ai"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "6px 12px",
            background: "rgba(99,102,241,0.15)",
            borderColor: "rgba(99,102,241,0.35)",
          }}
        >
          Add annotation
        </button>
      </div>

      {annotations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {annotations.map((a) => (
            <div
              key={a.id}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(99,102,241,0.2)",
                background: "rgba(99,102,241,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "rgba(165,180,252,0.95)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Teacher · {placementLabel(a)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#f87171",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Remove
                </button>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {a.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
