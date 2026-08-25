import { normalizeQuestionPlacement } from "./normalizeQuestionPlacement";
import {
  canonicalQuestionKey,
  dropGhostDuplicateQuestions,
  dropUnusableInventedQuestions,
  clearImplausiblePrintedQuestionNumbers,
  normalizeQuestionNumberLabels,
  repairQuestionNumbersFromFeedback,
  repairOrphanPartQuestionNumbers,
} from "./markingQuestionDedupe";
import { enrichMarkingQuestions } from "./blankQuestionFeedback";
import { normalizeMathSymbolsInQuestions } from "./normalizeMathSymbols";

function normalizePrintedLabel(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^question\s*/i, "")
    .replace(/^Q/i, "")
    .replace(/\(([a-zivx]+)\)/gi, "$1")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function questionKey(q) {
  return canonicalQuestionKey(q) ||
    String(q?.questionNumber ?? "")
      .trim()
      .replace(/^question\s*/i, "")
      .replace(/^q/i, "")
      .toLowerCase();
}

function isBlankRow(q) {
  if (!q) return false;
  if (q._backfilled === true) return true;
  if (q.checklist?.answerIsBlank === true) return true;

  const student = String(q.studentAnswer || "").trim().toLowerCase();
  if (
    student.includes("not detected during automated marking") ||
    student.includes("question left blank") ||
    student === "not attempted" ||
    student === "blank"
  ) {
    return true;
  }

  const awarded = Number(q.marksAwarded) || 0;
  const max = Number(q.maxMarks) || 0;
  if (awarded === 0 && max > 0) {
    const reason = String(q.reason || "").toLowerCase();
    if (
      reason.includes("not detected") ||
      reason.includes("left blank") ||
      reason.includes("not attempted")
    ) {
      return true;
    }
  }

  return false;
}

function hasSubstantiveAnswer(q) {
  const student = String(q?.studentAnswer || "").trim();
  if (!student || student.length < 3) return false;
  const lower = student.toLowerCase();
  if (
    lower.includes("not detected") ||
    lower.includes("question left blank") ||
    lower === "not attempted"
  ) {
    return false;
  }
  return true;
}

/** Client-side recovery for saved results (mirrors backend recoverMisassignedAnswers). */
export function recoverMisassignedAnswers(questions) {
  if (!Array.isArray(questions) || questions.length < 2) return questions;

  const result = questions.map((q) => ({ ...q }));
  const blankIndexByMs = new Map();

  for (let i = 0; i < result.length; i++) {
    const q = result[i];
    if (!isBlankRow(q)) continue;
    const ms = questionKey(q);
    if (ms) blankIndexByMs.set(ms, i);
  }

  for (let i = 0; i < result.length; i++) {
    const q = result[i];
    if (isBlankRow(q) || !hasSubstantiveAnswer(q)) continue;

    const printed = normalizePrintedLabel(q.printedQuestionNumber);
    if (!printed) continue;

    const printedId =
      canonicalQuestionKey({ questionNumber: printed }) || printed.toLowerCase();
    const msCurrent = questionKey(q);
    if (printedId === msCurrent) continue;

    const blankIdx = blankIndexByMs.get(printedId);
    if (blankIdx == null || blankIdx === i) continue;

    const blank = result[blankIdx];
    if (!isBlankRow(blank)) continue;

    const pageBlank = Math.max(1, Number(blank.pageNumber) || 1);
    const pageContent = Math.max(1, Number(q.pageNumber) || 1);
    if (pageBlank !== pageContent) continue;

    result[blankIdx] = {
      ...q,
      questionNumber: blank.questionNumber,
      maxMarks: Math.max(Number(blank.maxMarks) || 0, Number(q.maxMarks) || 0) || q.maxMarks,
      pageNumber: q.pageNumber ?? blank.pageNumber,
      yPercent: q.yPercent ?? blank.yPercent,
      printedQuestionNumber: printed,
      msQuestionNumber: q.msQuestionNumber || msCurrent,
      _recoveredFromMislabel: msCurrent,
    };

    result[i] = {
      ...blank,
      questionNumber: q.questionNumber,
      _placeholderAfterRecovery: true,
    };

    blankIndexByMs.delete(printedId);
  }

  return result.filter((q) => !q._placeholderAfterRecovery);
}

/** Normalize placement + recover common mislabel patterns for the editor. */
export function prepareEditingQuestions(questions) {
  const labeled = normalizeQuestionNumberLabels(questions || []);
  const fromFeedback = repairQuestionNumbersFromFeedback(labeled);
  const repaired = repairOrphanPartQuestionNumbers(fromFeedback);
  const cleaned = dropUnusableInventedQuestions(repaired);
  const printedClean = clearImplausiblePrintedQuestionNumbers(cleaned);
  const mathClean = normalizeMathSymbolsInQuestions(printedClean);
  const recovered = recoverMisassignedAnswers(mathClean);
  const collapsed = dropGhostDuplicateQuestions(recovered);
  return normalizeQuestionPlacement(
    enrichMarkingQuestions(collapsed).map((q) => ({ ...q }))
  );
}
