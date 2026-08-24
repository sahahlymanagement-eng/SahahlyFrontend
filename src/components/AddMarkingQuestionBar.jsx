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
  // gradingv2 keeps questions that were graded but are absent from the
  // assignment inventory, counting them toward the total rather than
  // suppressing them (the inventory itself can be incomplete). It computed
  // this all along and nothing rendered it, so "unrelated questions could be
  // included in the total" had no visible signal for a reviewer.
  const offInventoryCount = result?.gradingV2Dedup?.offInventoryCount || 0;
  const offInventoryQuestions = result?.gradingV2Dedup?.offInventoryQuestions || [];

  const failed = Boolean(result?.markingFailed || info?.markingFailed);
  const incomplete = Boolean(result?.markingIncomplete || info?.markingIncomplete);
  const suppressed = Boolean(info?.suppressedOtherPaper);
  const coverage =
    typeof info?.marksCoverage === "number" ? info.marksCoverage : null;

  if (!failed && !incomplete && !info?.backfilledCount && !backfilled && !suppressed && !offInventoryCount) {
    return null;
  }

  const added = info?.backfilledCount ?? backfilled;
  const isSevere = failed || incomplete;
  const bg = isSevere ? "rgba(239,68,68,0.12)" : "rgba(251,191,36,0.1)";
  const border = isSevere ? "rgba(239,68,68,0.35)" : "rgba(251,191,36,0.25)";
  const color = isSevere ? "#fca5a5" : "#fcd34d";

  let body;
  if (failed) {
    body =
      "Automated marking failed — no questions were matched on this script. Re-mark before returning or publishing; do not treat zeros as student blanks.";
  } else if (incomplete) {
    const cov =
      coverage != null ? ` Coverage of the mark scheme is about ${Math.round(coverage * 100)}%.` : "";
    body =
      `Marking incomplete — the AI skipped many mark-scheme questions.${cov}` +
      (added
        ? ` ${added} blank row${added === 1 ? " was" : "s were"} added for review.`
        : "") +
      ` Re-mark or finish every question before publishing. (${questionCount} question rows total)`;
  } else if (added) {
    body = `${added} question${added === 1 ? "" : "s"} were not detected by AI and were added as blank rows — please review and adjust marks manually. (${questionCount} question rows total)`;
  } else {
    body =
      "Some mark-scheme items were treated as another booklet and not added as zeros. Confirm this paper was fully marked before publishing.";
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        background: bg,
        border: `1px solid ${border}`,
        color,
      }}
    >
      {body}
      {offInventoryCount > 0 && (
        <div style={{ marginTop: 6 }}>
          {offInventoryCount} question{offInventoryCount === 1 ? "" : "s"} graded (
          {offInventoryQuestions.join(", ")}) are not in the assignment's known question list —
          verify they're actually part of this assignment before confirming; their marks are
          currently counted toward the total.
        </div>
      )}
    </div>
  );
}
