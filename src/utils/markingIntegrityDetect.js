import { isBackfilledStub } from "./backfilledStub";

export const MARKING_FAILED_SUMMARY =
  "AUTOMATED MARKING FAILED: no questions were matched on this script. The 0 total is not a student score — re-mark this paper.";

export function gradedQuestionCount(questions) {
  return (questions || []).filter((q) => !isBackfilledStub(q)).length;
}

/**
 * True when automated marking produced no real graded rows — including the
 * silent-empty case (0 questions, 0 stubs) that used to look like a 0% paper.
 */
export function detectedMarkingFailed(result) {
  if (!result || typeof result !== "object") return false;
  if (result.markingFailed || result.markingCompleteness?.markingFailed) return true;

  const questions = result.questions || result.finalQuestions || [];
  const graded = gradedQuestionCount(questions);
  if (graded > 0) return false;

  const stubs = (questions || []).filter((q) => isBackfilledStub(q));
  if (stubs.length > 0) return true;

  if (questions.length === 0) {
    if (
      result.markingMode === "criteria" &&
      Array.isArray(result.criteriaGrade?.breakdown) &&
      result.criteriaGrade.breakdown.length > 0
    ) {
      return false;
    }
    const max = Number(result.finalMaximumMarks ?? result.maxTotalMarks ?? 0);
    return max > 0 || questions.length === 0;
  }

  return false;
}

export function mergeMarkingFailedFlag(result) {
  if (!detectedMarkingFailed(result)) return result;
  const next = { ...result, markingFailed: true, needsReview: true };
  const prev = String(next.summary || "").trim();
  if (!/AUTOMATED MARKING FAILED/i.test(prev)) {
    next.summary = prev ? `${MARKING_FAILED_SUMMARY}\n\n${prev}` : MARKING_FAILED_SUMMARY;
  }
  if (next.markingCompleteness && typeof next.markingCompleteness === "object") {
    next.markingCompleteness = { ...next.markingCompleteness, markingFailed: true };
  } else {
    next.markingCompleteness = { ...(next.markingCompleteness || {}), markingFailed: true };
  }
  return next;
}
