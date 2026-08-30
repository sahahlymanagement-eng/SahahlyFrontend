import {
  getOutOfScopeNotes,
  getTeacherAnnotations,
  questionsForConfirmEdits,
} from "./markingFormData";
import { cloneCriteriaGrade } from "./markingQuestionEdits";

/** Stable fingerprint for “did per-question marks change?” */
export function questionMarksSignature(questions) {
  return JSON.stringify(
    (questions || []).map(
      (q) =>
        `${String(q.questionNumber ?? "")}:${Number(q.marksAwarded) || 0}/${Number(q.maxMarks) || 0}`
    )
  );
}

/**
 * Build the preview/save baseline from the live editor — same shape as the
 * confirmed snapshot so opening a paper does not look “dirty” until the
 * teacher actually edits something.
 */
export function buildEditorPreviewBaseline({
  submissionId,
  editingQuestions,
  pendingRemovedIndices,
  editingSummary,
  effectiveMaxTotal,
  editingTotal,
  editingCriteriaGrade,
  editingAnnotations,
  editingOutOfScopeNotes,
  resultModal,
}) {
  const questions = questionsForConfirmEdits(
    editingQuestions,
    pendingRemovedIndices
  ).map((q) => ({ ...q }));
  const summed = questions.reduce(
    (s, q) => s + (Number(q.marksAwarded) || 0),
    0
  );
  const stored =
    resultModal?.result?.finalObtainedMarks ??
    resultModal?.result?.criteriaGrade?.totalMarks ??
    resultModal?.result?.totalMarks;
  const finalObtainedMarks =
    editingTotal != null && Number.isFinite(Number(editingTotal))
      ? Number(editingTotal)
      : stored != null && Number.isFinite(Number(stored))
        ? Number(stored)
        : summed;

  return {
    submissionId,
    questions,
    maxTotal: Math.max(1, Number(effectiveMaxTotal) || 1),
    summary: String(editingSummary ?? "").trim(),
    outOfScopeNotes: (
      editingOutOfScopeNotes ??
      getOutOfScopeNotes(resultModal?.result) ??
      []
    ).map((n) => ({ ...n })),
    teacherAnnotations: (
      editingAnnotations ??
      getTeacherAnnotations(resultModal?.result) ??
      []
    ).map((a) => ({ ...a })),
    criteriaGrade: cloneCriteriaGrade(
      editingCriteriaGrade ?? resultModal?.result?.criteriaGrade
    ),
    finalObtainedMarks,
    finalMaximumMarks: Math.max(1, Number(effectiveMaxTotal) || 1),
  };
}
