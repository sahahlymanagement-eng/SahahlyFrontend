import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { annotatePdf } from "../utils/annotatePdf";
import {
  applyTeacherEditsToResult,
  questionsHavePendingEdits,
  resolveDisplayMaxTotal,
  sumQuestionMarks,
  getOutOfScopeNotes,
  getApiErrorMessage,
} from "../utils/markingFormData";

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
  effectiveMaxTotal,
  editingMaxTotal,
  resolvePdfSummary,
  getStudentFile,
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
  const getStudentFileRef = useRef(getStudentFile);
  getStudentFileRef.current = getStudentFile;
  const resultModalRef = useRef(resultModal);
  resultModalRef.current = resultModal;
  const editingMaxTotalRef = useRef(editingMaxTotal);
  editingMaxTotalRef.current = editingMaxTotal;

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
    const studentFile = modal.studentFile || null;
    return { submissionId, questions, maxTotal, summary, outOfScopeNotes, studentFile };
  }, []);

  const generatePreview = useCallback(async (snapshot) => {
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
          skipCompress: true,
        }),
        PREVIEW_TIMEOUT_MS,
        "Building annotated preview"
      );
      if (requestId !== previewRequestRef.current) return;

      revokePreviewUrl();
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
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
  }, [revokePreviewUrl]);

  const openSubmissionId = getSubmissionId(resultModal);

  useEffect(() => {
    if (!openSubmissionId) {
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
    return questionsHavePendingEdits(editingQuestions, confirmedSnapshot);
  }, [confirmedSnapshot, editingQuestions, effectiveMaxTotal, editingMaxTotal]);

  const confirmEdits = useCallback(
    async (onPersist) => {
      if (!resultModal) return null;
      const submissionId = getSubmissionId(resultModal);
      if (!submissionId) return null;

      setConfirmingEdits(true);
      try {
        const questions = editingQuestions.map((q) => ({ ...q }));
        const maxTotal = Math.max(1, Number(effectiveMaxTotal) || 1);
        const finalResult = applyTeacherEditsToResult(resultModal.result, questions, maxTotal);
        const summary = resolvePdfSummaryRef.current(submissionId, finalResult);
        const studentFile = resultModalRef.current?.studentFile || null;
        const snapshot = {
          submissionId,
          questions,
          maxTotal,
          summary,
          outOfScopeNotes: getOutOfScopeNotes(finalResult),
          studentFile,
        };

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
    [resultModal, editingQuestions, effectiveMaxTotal, generatePreview]
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
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmedSnapshot,
    confirmEdits,
    resetToConfirmed,
  };
}
