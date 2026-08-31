import {
  getOutOfScopeNotes,
  getTeacherAnnotations,
  questionsForConfirmEdits,
  sumQuestionMarks,
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

function resolveSnapshotObtainedMarks({ questions, editingTotal }) {
  const summed = sumQuestionMarks(questions);
  if (
    editingTotal != null &&
    editingTotal !== "" &&
    Number.isFinite(Number(editingTotal))
  ) {
    return Number(editingTotal);
  }
  return summed;
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
  const finalObtainedMarks = resolveSnapshotObtainedMarks({
    questions,
    editingTotal,
  });

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

/**
 * Snapshot for debounced live preview while the teacher edits — always sums
 * question rows for the cover total unless they typed a manual override.
 */
export function buildLivePreviewSnapshot({
  confirmedSnapshot,
  submissionId,
  editingQuestions,
  pendingRemovedIndices,
  editingSummary,
  summaryTouched,
  effectiveMaxTotal,
  editingTotal,
  editingCriteriaGrade,
  editingAnnotations,
  editingOutOfScopeNotes,
}) {
  if (!confirmedSnapshot || !submissionId) return null;

  const questions = questionsForConfirmEdits(
    editingQuestions,
    pendingRemovedIndices
  ).map((q) => ({ ...q }));
  const maxTotal = Math.max(
    1,
    Number(effectiveMaxTotal) || confirmedSnapshot.maxTotal || 1
  );
  const summary = summaryTouched
    ? String(editingSummary ?? "").trim()
    : String(editingSummary ?? "").trim() || confirmedSnapshot.summary || "";

  return {
    ...confirmedSnapshot,
    submissionId,
    questions,
    maxTotal,
    summary,
    outOfScopeNotes: (
      editingOutOfScopeNotes ??
      confirmedSnapshot.outOfScopeNotes ??
      []
    ).map((n) => ({ ...n })),
    teacherAnnotations: (
      editingAnnotations ??
      confirmedSnapshot.teacherAnnotations ??
      []
    ).map((a) => ({ ...a })),
    criteriaGrade: cloneCriteriaGrade(
      editingCriteriaGrade ?? confirmedSnapshot.criteriaGrade
    ),
    finalObtainedMarks: resolveSnapshotObtainedMarks({
      questions,
      editingTotal,
    }),
    finalMaximumMarks: maxTotal,
  };
}
