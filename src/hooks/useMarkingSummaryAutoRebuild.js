import { useEffect, useMemo, useRef } from "react";
import { rebuildMarkingSummary } from "../utils/markingFormData";

/**
 * Rebuild the editable PDF summary from question rows + totals.
 * Stops overwriting while the teacher types in the box — unless rows/marks
 * change (e.g. adding a missing question).
 */
export function useMarkingSummaryAutoRebuild({
  enabled = true,
  resultModal,
  questionsForDisplay,
  effectiveMaxTotal,
  editingTotal,
  editingSummary,
  setEditingSummary,
  summaryTouched,
  previousSummary = "",
}) {
  const editingSummaryRef = useRef(editingSummary);
  editingSummaryRef.current = editingSummary;

  const marksSourceSig = useMemo(
    () =>
      JSON.stringify({
        count: questionsForDisplay.length,
        rows: questionsForDisplay.map(
          (q) =>
            `${q.questionNumber}|${Number(q.marksAwarded) || 0}|${Number(q.maxMarks) || 0}`
        ),
        total: editingTotal,
        max: effectiveMaxTotal,
      }),
    [questionsForDisplay, editingTotal, effectiveMaxTotal]
  );

  const prevMarksSourceSigRef = useRef("");

  useEffect(() => {
    if (!enabled || !resultModal) return;
    const marksChanged = marksSourceSig !== prevMarksSourceSigRef.current;
    prevMarksSourceSigRef.current = marksSourceSig;
    if (summaryTouched && !marksChanged) return;

    setEditingSummary(
      rebuildMarkingSummary({
        questions: questionsForDisplay,
        maxTotalMarks: effectiveMaxTotal,
        previousSummary: summaryTouched
          ? editingSummaryRef.current
          : previousSummary,
        totalMarksOverride:
          editingTotal !== null && Number.isFinite(Number(editingTotal))
            ? Number(editingTotal)
            : null,
      })
    );
  }, [
    enabled,
    resultModal,
    marksSourceSig,
    questionsForDisplay,
    effectiveMaxTotal,
    editingTotal,
    summaryTouched,
    previousSummary,
    setEditingSummary,
  ]);
}
