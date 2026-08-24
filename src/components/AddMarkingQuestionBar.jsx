import { useState } from "react";
import { createManualQuestion } from "../utils/markingFormData";
import { isBackfilledStub } from "../utils/backfilledStub";

export default function AddMarkingQuestionBar({ onAdd, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [questionNumber, setQuestionNumber] = useState("");
  const [maxMarks, setMaxMarks] = useState("1");
  const [pageNumber, setPageNumber] = useState("1");

  const handleAdd = () => {
    const qNum = questionNumber.trim();
    if (!qNum) return;
    const max = Math.max(1, Number(maxMarks) || 1);
    const page = Math.max(1, Number(pageNumber) || 1);
    onAdd(
      createManualQuestion({
        questionNumber: qNum,
        maxMarks: max,
        pageNumber: page,
      })
    );
    setQuestionNumber("");
    setMaxMarks("1");
    setPageNumber("1");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="msv-btn-ai"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{
          alignSelf: "flex-start",
          marginBottom: 4,
          background: "rgba(59,130,246,0.12)",
          borderColor: "rgba(59,130,246,0.35)",
        }}
      >
        + Add missing question
      </button>
    );
  }

  return (
    <div
      className="msv-q-card"
      style={{
        padding: 12,
        border: "1px dashed rgba(59,130,246,0.35)",
        background: "rgba(59,130,246,0.06)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "rgba(255,255,255,0.7)" }}>
        Add a question the AI missed
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          Q
          <input
            type="text"
            value={questionNumber}
            onChange={(e) => setQuestionNumber(e.target.value)}
            placeholder="e.g. 3b"
            style={{
              marginLeft: 4,
              width: 72,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.2)",
              color: "#fff",
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          Max
          <input
            type="number"
            min={1}
            max={50}
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
            style={{
              marginLeft: 4,
              width: 52,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.2)",
              color: "#fff",
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          Page
          <input
            type="number"
            min={1}
            value={pageNumber}
            onChange={(e) => setPageNumber(e.target.value)}
            style={{
              marginLeft: 4,
              width: 52,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.2)",
              color: "#fff",
            }}
          />
        </label>
        <button type="button" className="msv-btn-ai" onClick={handleAdd} disabled={!questionNumber.trim()}>
          Add
        </button>
        <button
          type="button"
          className="msv-cancel-btn"
          onClick={() => setOpen(false)}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MarkingCompletenessNotice({ result, questionCount }) {
  const info = result?.markingCompleteness;
  const backfilled = (result?.questions || []).filter(isBackfilledStub).length;
  const added = info?.backfilledCount ?? backfilled;

  // REGRESSION: gradingv2's own advisory escape hatch (postProcess.js —
  // questions graded but absent from the assignment inventory, kept and
  // counted toward the total rather than suppressed, since the inventory
  // itself can be incomplete) computed this correctly all along but nothing
  // in the frontend ever rendered it — "excluded, optional or unrelated
  // questions could be included in the total" had no visible signal for a
  // reviewer to catch it.
  const offInventoryCount = result?.gradingV2Dedup?.offInventoryCount || 0;
  const offInventoryQuestions = result?.gradingV2Dedup?.offInventoryQuestions || [];

  if (!added && !offInventoryCount) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        background: "rgba(251,191,36,0.1)",
        border: "1px solid rgba(251,191,36,0.25)",
        color: "#fcd34d",
      }}
    >
      {added > 0 && (
        <div>
          {added} question{added === 1 ? "" : "s"} were not detected by AI and were added as blank rows —
          please review and adjust marks manually. ({questionCount} question rows total)
        </div>
      )}
      {offInventoryCount > 0 && (
        <div style={{ marginTop: added > 0 ? 6 : 0 }}>
          {offInventoryCount} question{offInventoryCount === 1 ? "" : "s"} graded (
          {offInventoryQuestions.join(", ")}) are not in the assignment's known question list —
          verify they're actually part of this assignment before confirming; their marks are
          currently counted toward the total.
        </div>
      )}
    </div>
  );
}
