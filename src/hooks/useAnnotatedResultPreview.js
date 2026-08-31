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
import { fetchStudentPdf } from "../utils/studentPdfCache";
import { studentGoogleUserId } from "../utils/returnAllExecution";
import { questionMarksSignature, buildLivePreviewSnapshot } from "../utils/buildEditorPreviewBaseline";

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
 * Regenerates when the modal opens, while the teacher edits (debounced), or when
 * Save & regenerate PDF is clicked.
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
  editingTotal = null,
  summaryTouched = false,
  resolvePdfSummary,
  pendingRemovedIndices = null,
  editingCriteriaGrade = null,
  outOfScopeNotesOverride = null,
  editorReadySubmissionId = null,
  getEditorBaseline = null,
}) {
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [confirmingEdits, setConfirmingEdits] = useState(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState(null);
  const [reportPageCount, setReportPageCount] = useState(0);
  const previewRequestRef = useRef(0);
  const previewUrlRef = useRef(null);
  // Which submission the preview currently on screen was built from. Needed to
  // tell "a preview for this paper is already up" from "that is the previous
  // student's PDF still showing while this one loads".
  const previewSubmissionIdRef = useRef(null);
  const resolvePdfSummaryRef = useRef(resolvePdfSummary);
  resolvePdfSummaryRef.current = resolvePdfSummary;
  const resultModalRef = useRef(resultModal);
  resultModalRef.current = resultModal;
  const assignmentMaxPointsRef = useRef(assignmentMaxPoints);
  assignmentMaxPointsRef.current = assignmentMaxPoints;
  const editingMaxTotalRef = useRef(editingMaxTotal);
  editingMaxTotalRef.current = editingMaxTotal;
  const editingTotalRef = useRef(editingTotal);
  editingTotalRef.current = editingTotal;
  const summaryTouchedRef = useRef(summaryTouched);
  summaryTouchedRef.current = summaryTouched;
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
  const getEditorBaselineRef = useRef(getEditorBaseline);
  getEditorBaselineRef.current = getEditorBaseline;

  const pendingRemovedRef = useRef(pendingRemovedIndices);
  pendingRemovedRef.current = pendingRemovedIndices;

  const questionsForPreviewEdits = useMemo(
    () => questionsForConfirmEdits(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    previewSubmissionIdRef.current = null;
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
    const summed = questions.reduce(
      (s, q) => s + (Number(q.marksAwarded) || 0),
      0
    );
    const finalObtainedMarks =
      editingTotalRef.current != null &&
      Number.isFinite(Number(editingTotalRef.current))
        ? Number(editingTotalRef.current)
        : summed;
    return {
      submissionId,
      questions,
      maxTotal,
      summary,
      outOfScopeNotes,
      teacherAnnotations,
      criteriaGrade,
      finalObtainedMarks,
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
        // Cached per paper for the session: a preview is rebuilt several times
        // while one modal is open, and the student's file cannot change under
        // it. See utils/studentPdfCache.js.
        const googleUserId = studentGoogleUserId(resultModalRef.current?.student);
        const studentFile = await withTimeout(
          fetchStudentPdf(api, {
            assignmentId,
            submissionId: snapshot.submissionId,
            googleUserId: googleUserId || undefined,
          }),
          90_000,
          "Loading student PDF"
        );
        if (requestId !== previewRequestRef.current) return;

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
        if (getSubmissionId(resultModalRef.current) !== snapshot.submissionId) return;

        // Swap the object URL without clearing state first. Revoking the previous
        // blob while AnnotatedPdfPreview is still fetching it shows up as a bare
        // "Network Error" in the middle pane (mark scheme can still look fine).
        const previousUrl = previewUrlRef.current;
        const url = URL.createObjectURL(
          new Blob([pdfBytes], { type: "application/pdf" })
        );
        previewUrlRef.current = url;
        previewSubmissionIdRef.current = snapshot.submissionId;
        setAnnotatedPreviewUrl(url);
        setReportPageCount(Number(pdfBytes?.reportPageCount) || 0);
        if (previousUrl && previousUrl !== url) {
          requestAnimationFrame(() => {
            setTimeout(() => URL.revokeObjectURL(previousUrl), 0);
          });
        }
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
    [api, assignmentId]
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
      setConfirmingEdits(false);
      setReportPageCount(0);
      return;
    }

    // Wait until the editor holds THIS paper — otherwise the baseline is built
    // from raw stored JSON while the cards show prepareEditingQuestions output.
    if (editorReadySubmissionId !== openSubmissionId) return;

    const snapshot =
      getEditorBaselineRef.current?.() ||
      buildSnapshotFromModal(resultModalRef.current);
    if (!snapshot) return;

    setConfirmedSnapshot(snapshot);
    generatePreview(snapshot, { lockPlacement: false });
  }, [
    openSubmissionId,
    assignmentId,
    editorReadySubmissionId,
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
    if (
      editingTotal !== null &&
      Number(editingTotal) !== Number(confirmedSnapshot.finalObtainedMarks)
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
    if (summaryTouched && currentSummary !== confirmedSummary) {
      return true;
    }
    return false;
  }, [
    confirmedSnapshot,
    questionsForPreviewEdits,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    editingMaxTotal,
    editingTotal,
    editingCriteriaGrade,
    outOfScopeNotesOverride,
    summaryTouched,
  ]);

  const buildLiveSnapshot = useCallback(() => {
    if (!confirmedSnapshot || !resultModal) return null;
    const submissionId = getSubmissionId(resultModal);
    if (!submissionId) return null;
    return buildLivePreviewSnapshot({
      confirmedSnapshot,
      submissionId,
      editingQuestions: editingQuestionsRef.current,
      pendingRemovedIndices: pendingRemovedRef.current,
      editingSummary: editingSummaryRef.current,
      summaryTouched: summaryTouchedRef.current,
      effectiveMaxTotal: effectiveMaxTotalRef.current,
      editingTotal: editingTotalRef.current,
      editingCriteriaGrade: editingCriteriaGradeRef.current,
      editingAnnotations: editingAnnotationsRef.current,
      editingOutOfScopeNotes: outOfScopeNotesOverrideRef.current,
    });
  }, [confirmedSnapshot, resultModal]);

  const livePreviewSignature = useMemo(() => {
    const removed = pendingRemovedIndices
      ? [...pendingRemovedIndices].sort((a, b) => a - b).join(",")
      : "";
    return JSON.stringify({
      q: `${questionMarksSignature(questionsForPreviewEdits)}|len:${questionsForPreviewEdits.length}`,
      s: summaryTouched ? String(editingSummary ?? "") : "",
      t: editingTotal,
      m: effectiveMaxTotal,
      r: removed,
      a: (editingAnnotations || []).length,
    });
  }, [
    questionsForPreviewEdits,
    editingSummary,
    summaryTouched,
    editingTotal,
    effectiveMaxTotal,
    pendingRemovedIndices,
    editingAnnotations,
  ]);

  useEffect(() => {
    if (
      !openSubmissionId ||
      !assignmentId ||
      !confirmedSnapshot ||
      !hasPendingEdits ||
      confirmingEdits
    ) {
      return undefined;
    }

    const timer = setTimeout(() => {
      const snapshot = buildLiveSnapshot();
      if (snapshot) generatePreview(snapshot, { lockPlacement: true });
    }, LIVE_PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    openSubmissionId,
    assignmentId,
    confirmedSnapshot,
    hasPendingEdits,
    confirmingEdits,
    livePreviewSignature,
    buildLiveSnapshot,
    generatePreview,
  ]);

  /**
   * The current editor state as a marking-result blob — what Save & regenerate
   * would write. Not persisted until the teacher clicks that button.
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
      editingCriteriaGrade,
      editingTotal,
      summaryTouchedRef.current
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
    editingTotal,
  ]);

  const confirmEdits = useCallback(
    async (onPersist, { skipPreview = false } = {}) => {
      if (!resultModal || !assignmentId) return null;
      const submissionId = getSubmissionId(resultModal);
      if (!submissionId) return null;
      const stillThisPaper = () => getSubmissionId(resultModalRef.current) === submissionId;

      if (!skipPreview) setConfirmingEdits(true);
      if (!skipPreview) previewRequestRef.current += 1;
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
          editingCriteriaGrade,
          editingTotal,
          summaryTouchedRef.current
        );

        if (
          editingTotal === null &&
          confirmedSnapshot &&
          questionMarksSignature(questions) ===
            questionMarksSignature(confirmedSnapshot.questions)
        ) {
          finalResult.totalMarks = confirmedSnapshot.finalObtainedMarks;
          finalResult.finalObtainedMarks = confirmedSnapshot.finalObtainedMarks;
          if (finalResult.criteriaGrade) {
            finalResult.criteriaGrade = {
              ...finalResult.criteriaGrade,
              totalMarks: confirmedSnapshot.finalObtainedMarks,
            };
          }
        }

        if (Array.isArray(outOfScopeNotesOverride)) {
          // Allow assistants to delete out-of-scope ("Not included in your assignment")
          // entries in the preview before confirming edits.
          finalResult.outOfScopeNotes = outOfScopeNotesOverride.map((n) => ({ ...n }));
        }
        const summary =
          finalResult.summary || resolvePdfSummaryRef.current(submissionId, finalResult);
        const snapshot = {
          submissionId,
          questions: (finalResult.questions || questions).map((q) => ({ ...q })),
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
              studentId: resultModal.student?.studentId,
              studentName: resultModal.student?.name,
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
            if (!skipPreview && stillThisPaper()) {
              if (confirmedSnapshot?.submissionId === submissionId) {
                generatePreview(confirmedSnapshot, { lockPlacement: true });
              } else {
                setPreviewLoading(false);
              }
            }
            throw err;
          }
        }

        if (!stillThisPaper()) return { ...finalResult, switchedAway: true };
        setConfirmedSnapshot(snapshot);
        if (!skipPreview) {
          await generatePreview(snapshot, { lockPlacement: true });
        }
        return finalResult;
      } finally {
        if (stillThisPaper()) setConfirmingEdits(false);
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
      editingTotal,
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

  /** Re-fetch student PDF + rebuild preview after a transient Network Error. */
  const retryPreview = useCallback(() => {
    const modal = resultModalRef.current;
    if (!modal) return;
    const snapshot = confirmedSnapshot || buildSnapshotFromModal(modal);
    if (!snapshot) return;
    if (!confirmedSnapshot) setConfirmedSnapshot(snapshot);
    generatePreview(snapshot, { lockPlacement: Boolean(confirmedSnapshot) });
  }, [confirmedSnapshot, buildSnapshotFromModal, generatePreview]);

  /** After user drags a marking box — regenerate preview with locked positions. */
  const refreshPreviewFromQuestions = useCallback(
    async (questions) => {
      if (!confirmedSnapshot) return;
      const nextQuestions = (questions || []).map((q) => ({ ...q }));
      const summed = nextQuestions.reduce(
        (s, q) => s + (Number(q.marksAwarded) || 0),
        0
      );
      const finalObtainedMarks =
        editingTotalRef.current != null &&
        Number.isFinite(Number(editingTotalRef.current))
          ? Number(editingTotalRef.current)
          : summed;
      const snapshot = {
        ...confirmedSnapshot,
        questions: nextQuestions,
        finalObtainedMarks,
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
    retryPreview,
    reportPageCount,
    refreshPreviewFromQuestions,
  };
}
