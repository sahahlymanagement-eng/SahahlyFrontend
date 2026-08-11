import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { annotatePdf } from "../utils/annotatePdf";
import {
  applyTeacherEditsToResult,
  questionsHavePendingEdits,
  markingResultHasPendingCriteriaEdits,
  questionsForConfirmEdits,
  resolveDisplayMaxTotal,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  getApiErrorMessage,
} from "../utils/markingFormData";
import { cloneCriteriaGrade } from "../utils/markingQuestionEdits";
import { annotationsHavePendingEdits } from "../utils/teacherAnnotations";

function getSubmissionId(modal) {
  return modal?.submissionId || modal?.student?.submissionId || null;
}

const PREVIEW_TIMEOUT_MS = 120_000;
const LIVE_PREVIEW_DEBOUNCE_MS = 700;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Annotated PDF preview for the results modal.
 * Regenerates when the modal opens, after Confirm Edits, or when Classroom max points sync.
 */
export function useAnnotatedResultPreview({
  api,
  assignmentId,
  resultModal,
  editingQuestions,
  editingAnnotations,
  editingSummary,
  effectiveMaxTotal,
  assignmentMaxPoints,
  editingMaxTotal,
  resolvePdfSummary,
  pendingRemovedIndices = null,
  editingCriteriaGrade = null,
  outOfScopeNotesOverride = null,
}) {
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [confirmingEdits, setConfirmingEdits] = useState(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState(null);
  const [reportPageCount, setReportPageCount] = useState(0);
  const previewRequestRef = useRef(0);
  const previewUrlRef = useRef(null);
  const resolvePdfSummaryRef = useRef(resolvePdfSummary);
  resolvePdfSummaryRef.current = resolvePdfSummary;
  const resultModalRef = useRef(resultModal);
  resultModalRef.current = resultModal;
  const assignmentMaxPointsRef = useRef(assignmentMaxPoints);
  assignmentMaxPointsRef.current = assignmentMaxPoints;
  const editingMaxTotalRef = useRef(editingMaxTotal);
  editingMaxTotalRef.current = editingMaxTotal;
  const editingQuestionsRef = useRef(editingQuestions);
  editingQuestionsRef.current = editingQuestions;
  const editingAnnotationsRef = useRef(editingAnnotations);
  editingAnnotationsRef.current = editingAnnotations;
  const editingSummaryRef = useRef(editingSummary);
  editingSummaryRef.current = editingSummary;
  const editingCriteriaGradeRef = useRef(editingCriteriaGrade);
  editingCriteriaGradeRef.current = editingCriteriaGrade;
  const effectiveMaxTotalRef = useRef(effectiveMaxTotal);
  effectiveMaxTotalRef.current = effectiveMaxTotal;
  const outOfScopeNotesOverrideRef = useRef(outOfScopeNotesOverride);
  outOfScopeNotesOverrideRef.current = outOfScopeNotesOverride;

  const pendingRemovedRef = useRef(pendingRemovedIndices);
  pendingRemovedRef.current = pendingRemovedIndices;

  const questionsForPreviewEdits = useMemo(
    () => questionsForConfirmEdits(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

  const livePreviewSignature = useMemo(
    () =>
      JSON.stringify({
        questions: questionsForPreviewEdits.map((q) => [
          q.questionNumber,
          q.marksAwarded,
          q.maxMarks,
          q.reason,
          q.pageNumber,
          q.yPercent,
        ]),
        summary: editingSummary,
        maxTotal: effectiveMaxTotal,
        criteria: editingCriteriaGrade,
        annotations: editingAnnotations,
        outOfScope: outOfScopeNotesOverride,
        removed: pendingRemovedIndices ? [...pendingRemovedIndices].sort() : [],
      }),
    [
      questionsForPreviewEdits,
      editingSummary,
      effectiveMaxTotal,
      editingCriteriaGrade,
      editingAnnotations,
      outOfScopeNotesOverride,
      pendingRemovedIndices,
    ]
  );

  const buildLivePreviewSnapshot = useCallback(() => {
    const modal = resultModalRef.current;
    const base = confirmedSnapshot;
    if (!modal || !base) return null;
    const submissionId = getSubmissionId(modal);
    if (!submissionId) return null;

    const questions = questionsForConfirmEdits(
      editingQuestionsRef.current,
      pendingRemovedRef.current
    ).map((q) => ({ ...q }));
    const maxTotal = Math.max(1, Number(effectiveMaxTotalRef.current) || 1);
    const summary =
      String(editingSummaryRef.current ?? "").trim() || base.summary || "";
    const outOfScopeNotes = Array.isArray(outOfScopeNotesOverrideRef.current)
      ? outOfScopeNotesOverrideRef.current.map((n) => ({ ...n }))
      : base.outOfScopeNotes;
    const teacherAnnotations = (
      editingAnnotationsRef.current ||
      base.teacherAnnotations ||
      []
    ).map((a) => ({ ...a }));
    const criteriaGrade = cloneCriteriaGrade(
      editingCriteriaGradeRef.current ?? base.criteriaGrade
    );

    return {
      submissionId,
      questions,
      maxTotal,
      summary,
      outOfScopeNotes,
      teacherAnnotations,
      criteriaGrade,
      finalObtainedMarks: questions.reduce(
        (s, q) => s + (Number(q.marksAwarded) || 0),
        0
      ),
      finalMaximumMarks: maxTotal,
    };
  }, [confirmedSnapshot]);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAnnotatedPreviewUrl(null);
  }, []);

  const buildSnapshotFromModal = useCallback((modal, annotationOverride = null) => {
    if (!modal) return null;
    const submissionId = getSubmissionId(modal);
    if (!submissionId) return null;
    const questions = (modal.result?.questions || []).map((q) => ({ ...q }));
    const maxTotal = resolveDisplayMaxTotal({
      assignmentMaxPoints: assignmentMaxPointsRef.current,
      result: modal.result,
      editingMaxTotal: editingMaxTotalRef.current,
    });
    const summary = resolvePdfSummaryRef.current(submissionId, modal.result);
    const outOfScopeNotes = (modal.result?.outOfScopeNotes || []).map((n) => ({ ...n }));
    const teacherAnnotations = (
      annotationOverride != null
        ? annotationOverride
        : getTeacherAnnotations(modal.result)
    ).map((a) => ({ ...a }));
    const criteriaGrade = cloneCriteriaGrade(modal.result?.criteriaGrade);
    return {
      submissionId,
      questions,
      maxTotal,
      summary,
      outOfScopeNotes,
      teacherAnnotations,
      criteriaGrade,
      finalObtainedMarks: questions.reduce(
        (s, q) => s + (Number(q.marksAwarded) || 0),
        0
      ),
      finalMaximumMarks: maxTotal,
    };
  }, []);

  const generatePreview = useCallback(
    async (snapshot, { lockPlacement = false } = {}) => {
      if (!assignmentId || !snapshot?.submissionId) return;
      const requestId = ++previewRequestRef.current;
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const pdfRes = await withTimeout(
          api.get("/submission-files/pdf", {
            params: {
              assignmentId,
              submissionId: snapshot.submissionId,
            },
            responseType: "blob",
            timeout: 90_000,
          }),
          90_000,
          "Loading student PDF"
        );
        if (requestId !== previewRequestRef.current) return;

        const studentFile = new File(
          [pdfRes.data],
          `${snapshot.submissionId}.pdf`,
          { type: "application/pdf" }
        );
        const markingMode = resultModalRef.current?.result?.markingMode || "normal";
        const pdfBytes = await withTimeout(
          annotatePdf({
            studentFile,
            questions: snapshot.questions,
            maxTotalMarks: snapshot.maxTotal,
            summary: snapshot.summary,
            outOfScopeNotes: snapshot.outOfScopeNotes,
            teacherAnnotations: snapshot.teacherAnnotations,
            criteriaGrade: snapshot.criteriaGrade,
            markingMode,
            finalObtainedMarks: snapshot.finalObtainedMarks,
            finalMaximumMarks: snapshot.finalMaximumMarks ?? snapshot.maxTotal,
            skipCompress: true,
            lockPlacement,
          }),
          PREVIEW_TIMEOUT_MS,
          "Building annotated preview"
        );
        if (requestId !== previewRequestRef.current) return;

        revokePreviewUrl();
        const url = URL.createObjectURL(
          new Blob([pdfBytes], { type: "application/pdf" })
        );
        previewUrlRef.current = url;
        setAnnotatedPreviewUrl(url);
        setReportPageCount(Number(pdfBytes?.reportPageCount) || 0);
      } catch (err) {
        if (requestId === previewRequestRef.current) {
          const message = await getApiErrorMessage(err);
          console.error("Failed to generate annotated preview", err);
          setPreviewError(message || "Failed to generate preview");
        }
      } finally {
        if (requestId === previewRequestRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    [api, assignmentId, revokePreviewUrl]
  );

  const openSubmissionId =
    resultModal?.submissionId || resultModal?.student?.submissionId || null;

  useEffect(() => {
    if (!openSubmissionId || !assignmentId) {
      previewRequestRef.current += 1;
      revokePreviewUrl();
      setConfirmedSnapshot(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setReportPageCount(0);
      return;
    }

    if (!resultModalRef.current) return;

    const snapshot = buildSnapshotFromModal(resultModalRef.current);
    if (!snapshot) return;

    setConfirmedSnapshot(snapshot);
    generatePreview(snapshot, { lockPlacement: false });
  }, [
    openSubmissionId,
    assignmentId,
    assignmentMaxPoints,
    editingMaxTotal,
    buildSnapshotFromModal,
    generatePreview,
    revokePreviewUrl,
  ]);

  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  const hasPendingEdits = useMemo(() => {
    if (!confirmedSnapshot) return false;
    if (
      editingMaxTotal !== null &&
      Number(effectiveMaxTotal) !== Number(confirmedSnapshot.maxTotal)
    ) {
      return true;
    }
    if (questionsHavePendingEdits(questionsForPreviewEdits, confirmedSnapshot)) {
      return true;
    }
    if (
      markingResultHasPendingCriteriaEdits(
        editingCriteriaGrade,
        confirmedSnapshot
      )
    ) {
      return true;
    }
    if (
      annotationsHavePendingEdits(
        editingAnnotations,
        confirmedSnapshot.teacherAnnotations
      )
    ) {
      return true;
    }

    if (Array.isArray(outOfScopeNotesOverride)) {
      const sig = (notes) =>
        (notes || [])
          .map((n) => {
            const label = n?.label ?? "";
            const y = n?.yPercent ?? n?.ypercent ?? "";
            const q = n?.questionLabel ?? n?.questionNumber ?? "";
            return `${label}|${y}|${q}`;
          })
          .join("~");

      if (sig(outOfScopeNotesOverride) !== sig(confirmedSnapshot.outOfScopeNotes || [])) {
        return true;
      }
    }

    const currentSummary = String(editingSummary ?? "").trim();
    const confirmedSummary = String(confirmedSnapshot.summary ?? "").trim();
    return currentSummary !== confirmedSummary;
  }, [
    confirmedSnapshot,
    questionsForPreviewEdits,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    editingMaxTotal,
    editingCriteriaGrade,
    outOfScopeNotesOverride,
  ]);

  // Regenerate the preview from live editor state while edits are pending so
  // the cover-page total and question marks stay in sync with the header grade.
  useEffect(() => {
    if (!openSubmissionId || !assignmentId || !confirmedSnapshot || !hasPendingEdits) {
      return undefined;
    }

    const timer = setTimeout(() => {
      const snapshot = buildLivePreviewSnapshot();
      if (snapshot) generatePreview(snapshot, { lockPlacement: true });
    }, LIVE_PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    openSubmissionId,
    assignmentId,
    confirmedSnapshot,
    hasPendingEdits,
    livePreviewSignature,
    buildLivePreviewSnapshot,
    generatePreview,
  ]);

  /**
   * The current editor state as a marking-result blob — what Confirm Edits would
   * write. Exposed so the unconfirmed-edits autosave can snapshot the editor
   * without persisting anything or touching the preview.
   */
  const buildEditedResult = useCallback(() => {
    if (!resultModal) return null;
    const questions = questionsForConfirmEdits(
      editingQuestions,
      pendingRemovedRef.current
    ).map((q) => ({ ...q }));
    const finalResult = applyTeacherEditsToResult(
      resultModal.result,
      questions,
      Math.max(1, Number(effectiveMaxTotal) || 1),
      (editingAnnotations || []).map((a) => ({ ...a })),
      editingSummary,
      editingCriteriaGrade
    );
    if (Array.isArray(outOfScopeNotesOverride)) {
      finalResult.outOfScopeNotes = outOfScopeNotesOverride.map((n) => ({ ...n }));
    }
    return finalResult;
  }, [
    resultModal,
    editingQuestions,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    editingCriteriaGrade,
    outOfScopeNotesOverride,
  ]);

  const confirmEdits = useCallback(
    async (onPersist) => {
      if (!resultModal || !assignmentId) return null;
      const submissionId = getSubmissionId(resultModal);
      if (!submissionId) return null;

      setConfirmingEdits(true);
      // Supersede any preview still being built (the open-time one, when the
      // viewer auto-confirms a freshly marked paper) so it drops out at its next
      // checkpoint instead of spending an annotate pass on a stale snapshot.
      previewRequestRef.current += 1;
      try {
        const questions = questionsForConfirmEdits(
          editingQuestions,
          pendingRemovedRef.current
        ).map((q) => ({ ...q }));
        const teacherAnnotations = (editingAnnotations || []).map((a) => ({ ...a }));
        const maxTotal = Math.max(1, Number(effectiveMaxTotal) || 1);
        const finalResult = applyTeacherEditsToResult(
          resultModal.result,
          questions,
          maxTotal,
          teacherAnnotations,
          editingSummary,
          editingCriteriaGrade
        );

        if (Array.isArray(outOfScopeNotesOverride)) {
          // Allow assistants to delete out-of-scope ("Not included in your assignment")
          // entries in the preview before confirming edits.
          finalResult.outOfScopeNotes = outOfScopeNotesOverride.map((n) => ({ ...n }));
        }
        const summary =
          finalResult.summary || resolvePdfSummaryRef.current(submissionId, finalResult);
        const snapshot = {
          submissionId,
          questions,
          maxTotal,
          summary,
          outOfScopeNotes: getOutOfScopeNotes(finalResult),
          teacherAnnotations,
          criteriaGrade: cloneCriteriaGrade(finalResult.criteriaGrade),
          finalObtainedMarks: finalResult.finalObtainedMarks,
          finalMaximumMarks: finalResult.finalMaximumMarks ?? maxTotal,
        };

        if (onPersist) {
          try {
            const persisted = await onPersist({
              finalResult,
              submissionId,
              questions,
              maxTotal,
              teacherAnnotations,
            });
            if (persisted && typeof persisted === "object" && Array.isArray(persisted.questions)) {
              Object.assign(finalResult, persisted);
              snapshot.questions = (persisted.finalQuestions || persisted.questions).map((q) => ({
                ...q,
              }));
              snapshot.maxTotal =
                persisted.finalMaximumMarks ?? persisted.maxTotalMarks ?? maxTotal;
              snapshot.summary = persisted.summary || snapshot.summary;
              snapshot.criteriaGrade = cloneCriteriaGrade(persisted.criteriaGrade);
              snapshot.finalObtainedMarks = persisted.finalObtainedMarks;
              snapshot.finalMaximumMarks =
                persisted.finalMaximumMarks ?? snapshot.maxTotal;
              snapshot.outOfScopeNotes = getOutOfScopeNotes(persisted);
            }
          } catch (err) {
            // This confirm dropped whatever preview was in flight, so put the
            // last confirmed one back — a failed save must not leave the modal
            // stuck on a spinner.
            if (confirmedSnapshot) generatePreview(confirmedSnapshot, { lockPlacement: true });
            else setPreviewLoading(false);
            throw err;
          }
        }

        setConfirmedSnapshot(snapshot);
        await generatePreview(snapshot, { lockPlacement: true });
        return finalResult;
      } finally {
        setConfirmingEdits(false);
      }
    },
    [
      resultModal,
      assignmentId,
      editingQuestions,
      editingAnnotations,
      editingSummary,
      effectiveMaxTotal,
      generatePreview,
      editingCriteriaGrade,
      outOfScopeNotesOverride,
      confirmedSnapshot,
    ]
  );

  const resetToConfirmed = useCallback(() => {
    if (!confirmedSnapshot) return null;
    return {
      questions: confirmedSnapshot.questions.map((q) => ({ ...q })),
      maxTotal: confirmedSnapshot.maxTotal,
      summary: confirmedSnapshot.summary || "",
      teacherAnnotations: (confirmedSnapshot.teacherAnnotations || []).map((a) => ({
        ...a,
      })),
      criteriaGrade: cloneCriteriaGrade(confirmedSnapshot.criteriaGrade),
    };
  }, [confirmedSnapshot]);

  const revertPreviewToConfirmed = useCallback(() => {
    if (!confirmedSnapshot) return;
    generatePreview(confirmedSnapshot, { lockPlacement: true });
  }, [confirmedSnapshot, generatePreview]);

  /** After user drags a marking box — regenerate preview with locked positions. */
  const refreshPreviewFromQuestions = useCallback(
    async (questions) => {
      if (!confirmedSnapshot) return;
      const nextQuestions = (questions || []).map((q) => ({ ...q }));
      const snapshot = {
        ...confirmedSnapshot,
        questions: nextQuestions,
        summary:
          String(editingSummary ?? "").trim() || confirmedSnapshot.summary || "",
        teacherAnnotations: (
          editingAnnotations ||
          confirmedSnapshot.teacherAnnotations ||
          []
        ).map((a) => ({ ...a })),
        maxTotal: Math.max(
          1,
          Number(effectiveMaxTotal) || confirmedSnapshot.maxTotal || 1
        ),
      };
      await generatePreview(snapshot, { lockPlacement: true });
    },
    [
      confirmedSnapshot,
      editingSummary,
      editingAnnotations,
      effectiveMaxTotal,
      generatePreview,
    ]
  );

  return {
    annotatedPreviewUrl,
    previewLoading,
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmedSnapshot,
    confirmEdits,
    buildEditedResult,
    resetToConfirmed,
    revertPreviewToConfirmed,
    reportPageCount,
    refreshPreviewFromQuestions,
  };
}
