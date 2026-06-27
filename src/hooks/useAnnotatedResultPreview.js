import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { annotatePdf } from "../utils/annotatePdf";
import {
  applyTeacherEditsToResult,
  questionsHavePendingEdits,
  getResultMaxTotal,
  sumQuestionMarks,
} from "../utils/markingFormData";

function getSubmissionId(modal) {
  return modal?.submissionId || modal?.student?.submissionId || null;
}

/**
 * Annotated PDF preview for the results modal.
 * Preview only regenerates when the modal opens or after "Confirm Edits".
 */
export function useAnnotatedResultPreview({
  api,
  assignmentId,
  resultModal,
  editingQuestions,
  effectiveMaxTotal,
  resolvePdfSummary,
}) {
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmingEdits, setConfirmingEdits] = useState(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState(null);
  const previewRequestRef = useRef(0);
  const previewUrlRef = useRef(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAnnotatedPreviewUrl(null);
  }, []);

  const buildSnapshotFromModal = useCallback(
    (modal) => {
      if (!modal) return null;
      const submissionId = getSubmissionId(modal);
      if (!submissionId) return null;
      const questions = (modal.result?.questions || []).map((q) => ({ ...q }));
      const maxTotal = getResultMaxTotal(modal.result);
      const summary = resolvePdfSummary(submissionId, modal.result);
      return { submissionId, questions, maxTotal, summary };
    },
    [resolvePdfSummary]
  );

  const generatePreview = useCallback(
    async (snapshot) => {
      if (!assignmentId || !snapshot?.submissionId) return;
      const requestId = ++previewRequestRef.current;
      setPreviewLoading(true);

      try {
        const pdfRes = await api.get("/submission-files/pdf", {
          params: {
            assignmentId,
            submissionId: snapshot.submissionId,
          },
          responseType: "blob",
        });
        if (requestId !== previewRequestRef.current) return;

        const studentFile = new File(
          [pdfRes.data],
          `${snapshot.submissionId}.pdf`,
          { type: "application/pdf" }
        );
        const totalMarks = sumQuestionMarks(snapshot.questions);
        const pdfBytes = await annotatePdf({
          studentFile,
          questions: snapshot.questions,
          totalMarks,
          maxTotalMarks: snapshot.maxTotal,
          summary: snapshot.summary,
        });
        if (requestId !== previewRequestRef.current) return;

        revokePreviewUrl();
        const url = URL.createObjectURL(
          new Blob([pdfBytes], { type: "application/pdf" })
        );
        previewUrlRef.current = url;
        setAnnotatedPreviewUrl(url);
      } catch (err) {
        if (requestId === previewRequestRef.current) {
          console.error("Failed to generate annotated preview", err);
        }
      } finally {
        if (requestId === previewRequestRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    [api, assignmentId, revokePreviewUrl]
  );

  useEffect(() => {
    if (!resultModal) {
      previewRequestRef.current += 1;
      revokePreviewUrl();
      setConfirmedSnapshot(null);
      return undefined;
    }

    const snapshot = buildSnapshotFromModal(resultModal);
    if (!snapshot) return undefined;

    setConfirmedSnapshot(snapshot);
    generatePreview(snapshot);

    return () => {
      previewRequestRef.current += 1;
    };
  }, [
    resultModal?.submissionId,
    resultModal?.student?.submissionId,
    assignmentId,
    buildSnapshotFromModal,
    generatePreview,
    revokePreviewUrl,
  ]);

  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  const hasPendingEdits = useMemo(() => {
    if (!confirmedSnapshot) return false;
    if (Number(effectiveMaxTotal) !== Number(confirmedSnapshot.maxTotal)) return true;
    return questionsHavePendingEdits(editingQuestions, confirmedSnapshot);
  }, [confirmedSnapshot, editingQuestions, effectiveMaxTotal]);

  const confirmEdits = useCallback(
    async (onPersist) => {
      if (!resultModal || !assignmentId) return null;
      const submissionId = getSubmissionId(resultModal);
      if (!submissionId) return null;

      setConfirmingEdits(true);
      try {
        const questions = editingQuestions.map((q) => ({ ...q }));
        const maxTotal = Math.max(1, Number(effectiveMaxTotal) || 1);
        const finalResult = applyTeacherEditsToResult(
          resultModal.result,
          questions,
          maxTotal
        );
        const summary = resolvePdfSummary(submissionId, finalResult);
        const snapshot = { submissionId, questions, maxTotal, summary };

        if (onPersist) {
          await onPersist({ finalResult, submissionId, questions, maxTotal });
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
      effectiveMaxTotal,
      resolvePdfSummary,
      generatePreview,
    ]
  );

  const resetToConfirmed = useCallback(() => {
    if (!confirmedSnapshot) return null;
    return {
      questions: confirmedSnapshot.questions.map((q) => ({ ...q })),
      maxTotal: confirmedSnapshot.maxTotal,
    };
  }, [confirmedSnapshot]);

  return {
    annotatedPreviewUrl,
    previewLoading,
    confirmingEdits,
    hasPendingEdits,
    confirmedSnapshot,
    confirmEdits,
    resetToConfirmed,
  };
}
