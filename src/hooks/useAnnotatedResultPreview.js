import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { annotatePdf } from "../utils/annotatePdf";
import {
  applyTeacherEditsToResult,
  questionsHavePendingEdits,
  resolveDisplayMaxTotal,
  sumQuestionMarks,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  getApiErrorMessage,
  rebuildMarkingSummary,
} from "../utils/markingFormData";
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
}) {
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [confirmingEdits, setConfirmingEdits] = useState(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState(null);
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
    return {
      submissionId,
      questions,
      maxTotal,
      summary,
      outOfScopeNotes,
      teacherAnnotations,
    };
  }, []);

  const generatePreview = useCallback(
    async (snapshot) => {
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
      return;
    }

    if (!resultModalRef.current) return;

    const snapshot = buildSnapshotFromModal(resultModalRef.current);
    if (!snapshot) return;

    setConfirmedSnapshot(snapshot);
    generatePreview(snapshot);
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
    if (questionsHavePendingEdits(editingQuestions, confirmedSnapshot)) {
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
    editingQuestions,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    editingMaxTotal,
  ]);

  const confirmEdits = useCallback(
    async (onPersist) => {
      if (!resultModal || !assignmentId) return null;
      const submissionId = getSubmissionId(resultModal);
      if (!submissionId) return null;

      setConfirmingEdits(true);
      try {
        const questions = editingQuestions.map((q) => ({ ...q }));
        const teacherAnnotations = (editingAnnotations || []).map((a) => ({ ...a }));
        const maxTotal = Math.max(1, Number(effectiveMaxTotal) || 1);
        const finalResult = applyTeacherEditsToResult(
          resultModal.result,
          questions,
          maxTotal,
          teacherAnnotations,
          editingSummary
        );
        const summary = finalResult.summary || resolvePdfSummaryRef.current(submissionId, finalResult);
        const snapshot = {
          submissionId,
          questions,
          maxTotal,
          summary,
          outOfScopeNotes: getOutOfScopeNotes(finalResult),
          teacherAnnotations,
        };

        if (onPersist) {
          await onPersist({ finalResult, submissionId, questions, maxTotal, teacherAnnotations });
        }

        setConfirmedSnapshot(snapshot);
        await generatePreview(snapshot);
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
    };
  }, [confirmedSnapshot]);

  return {
    annotatedPreviewUrl,
    previewLoading,
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmedSnapshot,
    confirmEdits,
    resetToConfirmed,
  };
}
