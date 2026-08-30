import { useEffect, useMemo, useRef } from "react";
import { getOutOfScopeNotes } from "../utils/markingFormData";
import { cloneCriteriaGrade } from "../utils/markingQuestionEdits";

/**
 * Debounced annotated-PDF rebuild while the teacher edits (add/remove/move
 * questions, change marks, or auto-rebuilt summary). Without this, only the
 * grade total updates until Save & regenerate.
 */
export function useLiveAnnotatedPreviewSync({
  openSubmissionId,
  confirmedSnapshot,
  hasPendingEdits,
  questionsForPreviewEdits,
  buildEditedResult,
  effectiveMaxTotal,
  editingAnnotations,
  generatePreview,
}) {
  const livePreviewSig = useMemo(
    () =>
      JSON.stringify({
        count: questionsForPreviewEdits.length,
        rows: questionsForPreviewEdits.map(
          (q) =>
            `${q.questionNumber}@${q.pageNumber}@${q.yPercent}|${Number(q.marksAwarded) || 0}/${Number(q.maxMarks) || 0}|${q._manual ? "m" : ""}`
        ),
      }),
    [questionsForPreviewEdits]
  );

  const lastSigRef = useRef(null);
  const debounceRef = useRef(null);
  const confirmedSnapshotRef = useRef(confirmedSnapshot);
  confirmedSnapshotRef.current = confirmedSnapshot;
  const buildEditedResultRef = useRef(buildEditedResult);
  buildEditedResultRef.current = buildEditedResult;
  const editingAnnotationsRef = useRef(editingAnnotations);
  editingAnnotationsRef.current = editingAnnotations;
  const effectiveMaxTotalRef = useRef(effectiveMaxTotal);
  effectiveMaxTotalRef.current = effectiveMaxTotal;
  const generatePreviewRef = useRef(generatePreview);
  generatePreviewRef.current = generatePreview;

  useEffect(() => {
    if (!openSubmissionId || !confirmedSnapshot) {
      lastSigRef.current = livePreviewSig;
      return undefined;
    }
    if (!hasPendingEdits) {
      lastSigRef.current = livePreviewSig;
      return undefined;
    }
    if (livePreviewSig === lastSigRef.current) return undefined;
    lastSigRef.current = livePreviewSig;

    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const snap = confirmedSnapshotRef.current;
      if (!snap) return;
      const edited = buildEditedResultRef.current();
      if (!edited) return;
      const maxTotal = Math.max(
        1,
        Number(effectiveMaxTotalRef.current) || snap.maxTotal || 1
      );
      const teacherAnnotations = (
        editingAnnotationsRef.current ||
        snap.teacherAnnotations ||
        []
      ).map((a) => ({ ...a }));

      await generatePreviewRef.current(
        {
          submissionId: snap.submissionId,
          questions: (edited.questions || []).map((q) => ({ ...q })),
          maxTotal,
          summary: edited.summary || snap.summary || "",
          outOfScopeNotes: getOutOfScopeNotes(edited),
          teacherAnnotations,
          criteriaGrade: cloneCriteriaGrade(edited.criteriaGrade),
          finalObtainedMarks: edited.finalObtainedMarks,
          finalMaximumMarks: edited.finalMaximumMarks ?? maxTotal,
        },
        { lockPlacement: true }
      );
    }, 500);

    return () => window.clearTimeout(debounceRef.current);
  }, [
    livePreviewSig,
    hasPendingEdits,
    openSubmissionId,
    confirmedSnapshot,
  ]);
}
