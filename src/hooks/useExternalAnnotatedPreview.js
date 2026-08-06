import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { annotatePdf } from "../utils/annotatePdf";
import {
  applyTeacherEditsToResult,
  questionsHavePendingEdits,
  markingResultHasPendingCriteriaEdits,
  questionsForConfirmEdits,
  resolveDisplayMaxTotal,
  sumQuestionMarks,
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
 * Annotated PDF preview for the LoginCSS results modal.
 *
 * Mirrors useAnnotatedResultPreview, but instead of refetching the student PDF
 * from /submission-files/pdf by assignmentId, it pulls the cached student File
 * (or calls getStudentFile(submissionId) to fetch it from /external-grading/.../pdfs).
 */
export function useExternalAnnotatedPreview({
  resultModal,
  editingQuestions,
  editingAnnotations,
  editingSummary,
  effectiveMaxTotal,
  editingMaxTotal,
  resolvePdfSummary,
  getStudentFile,
  pendingRemovedIndices = null,
  editingCriteriaGrade = null,
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
  const getStudentFileRef = useRef(getStudentFile);
  getStudentFileRef.current = getStudentFile;
  const resultModalRef = useRef(resultModal);
  resultModalRef.current = resultModal;
  const editingMaxTotalRef = useRef(editingMaxTotal);
  editingMaxTotalRef.current = editingMaxTotal;

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
    setAnnotatedPreviewUrl(null);
  }, []);

  const buildSnapshotFromModal = useCallback((modal) => {
    if (!modal) return null;
    const submissionId = getSubmissionId(modal);
    if (!submissionId) return null;
    const questions = (modal.result?.questions || []).map((q) => ({ ...q }));
    const maxTotal = resolveDisplayMaxTotal({
      result: modal.result,
      editingMaxTotal: editingMaxTotalRef.current,
    });
    const summary = resolvePdfSummaryRef.current(submissionId, modal.result);
    const outOfScopeNotes = (modal.result?.outOfScopeNotes || []).map((n) => ({ ...n }));
    const teacherAnnotations = getTeacherAnnotations(modal.result).map((a) => ({ ...a }));
    const criteriaGrade = cloneCriteriaGrade(modal.result?.criteriaGrade);
    const studentFile = modal.studentFile || null;
    return {
      submissionId,
      questions,
      maxTotal,
      summary,
      outOfScopeNotes,
      teacherAnnotations,
      criteriaGrade,
      studentFile,
    };
  }, []);

  const generatePreview = useCallback(async (snapshot, { lockPlacement = false } = {}) => {
    if (!snapshot?.submissionId) return;
    const requestId = ++previewRequestRef.current;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      let studentFile = snapshot.studentFile;
      if (!studentFile && getStudentFileRef.current) {
        studentFile = await withTimeout(
          getStudentFileRef.current(snapshot.submissionId),
          90_000,
          "Loading student PDF"
        );
      }
      if (requestId !== previewRequestRef.current) return;
      if (!studentFile) throw new Error("Student PDF unavailable for preview");

      const totalMarks = sumQuestionMarks(snapshot.questions);
      const pdfBytes = await withTimeout(
        annotatePdf({
          studentFile,
          questions: snapshot.questions,
          totalMarks,
          maxTotalMarks: snapshot.maxTotal,
          summary: snapshot.summary,
          outOfScopeNotes: snapshot.outOfScopeNotes,
          teacherAnnotations: snapshot.teacherAnnotations,
          skipCompress: true,
          lockPlacement,
        }),
        PREVIEW_TIMEOUT_MS,
        "Building annotated preview"
      );
      if (requestId !== previewRequestRef.current) return;

      revokePreviewUrl();
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
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
  }, [revokePreviewUrl]);

  const openSubmissionId = getSubmissionId(resultModal);

  useEffect(() => {
    if (!openSubmissionId) {
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
    generatePreview(snapshot);
  }, [openSubmissionId, editingMaxTotal, buildSnapshotFromModal, generatePreview, revokePreviewUrl]);

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
    if (annotationsHavePendingEdits(
      editingAnnotations,
      confirmedSnapshot.teacherAnnotations
    )) {
      return true;
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
    return applyTeacherEditsToResult(
      resultModal.result,
      questions,
      Math.max(1, Number(effectiveMaxTotal) || 1),
      (editingAnnotations || []).map((a) => ({ ...a })),
      editingSummary,
      editingCriteriaGrade
    );
  }, [
    resultModal,
    editingQuestions,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    editingCriteriaGrade,
  ]);

  const confirmEdits = useCallback(
    async (onPersist) => {
      if (!resultModal) return null;
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
        const summary = finalResult.summary || resolvePdfSummaryRef.current(submissionId, finalResult);
        const studentFile = resultModalRef.current?.studentFile || null;
        const snapshot = {
          submissionId,
          questions,
          maxTotal,
          summary,
          outOfScopeNotes: getOutOfScopeNotes(finalResult),
          teacherAnnotations,
          criteriaGrade: cloneCriteriaGrade(finalResult.criteriaGrade),
          studentFile,
        };

        if (onPersist) {
          try {
            await onPersist({ finalResult, submissionId, questions, maxTotal, teacherAnnotations });
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
      editingQuestions,
      editingAnnotations,
      editingSummary,
      effectiveMaxTotal,
      generatePreview,
      editingCriteriaGrade,
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
        studentFile: resultModalRef.current?.studentFile || confirmedSnapshot.studentFile || null,
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
    reportPageCount,
    refreshPreviewFromQuestions,
  };
}
