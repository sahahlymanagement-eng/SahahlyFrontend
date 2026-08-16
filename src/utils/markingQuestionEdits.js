import { MARKING_CHECKLIST_CONFIG } from "../constants/markingChecklist";
import { isBackfilledStub } from "./backfilledStub";

function normKeywords(arr) {
  return JSON.stringify((arr || []).map((s) => String(s).trim()).filter(Boolean));
}

function normChecklist(c) {
  if (!c || typeof c !== "object") return "{}";
  const keys = MARKING_CHECKLIST_CONFIG.map(({ key }) => key);
  const out = {};
  for (const key of keys) {
    if (key in c) out[key] = c[key];
  }
  return JSON.stringify(out);
}

/**
 * NaN-safe compare: `Number(undefined) !== Number(undefined)` is true, so a
 * plain `!==` reports an edit between two rows that both simply lack the field
 * (rows carry no pageNumber/yPercent until something places them).
 */
function numChanged(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) && Number.isNaN(nb)) return false;
  return na !== nb;
}

export function questionRowHasEdits(current, confirmed) {
  if (!current || !confirmed) return true;
  return (
    String(current.questionNumber ?? "") !== String(confirmed.questionNumber ?? "") ||
    String(current.printedQuestionNumber ?? "") !==
      String(confirmed.printedQuestionNumber ?? "") ||
    numChanged(current.marksAwarded, confirmed.marksAwarded) ||
    numChanged(current.maxMarks, confirmed.maxMarks) ||
    String(current.reason ?? "") !== String(confirmed.reason ?? "") ||
    String(current.studentAnswer ?? "") !== String(confirmed.studentAnswer ?? "") ||
    String(current.correctAnswer ?? "") !== String(confirmed.correctAnswer ?? "") ||
    String(current.studyTopic ?? "") !== String(confirmed.studyTopic ?? "") ||
    String(current.mistakeAdvice ?? "") !== String(confirmed.mistakeAdvice ?? "") ||
    numChanged(current.pageNumber, confirmed.pageNumber) ||
    numChanged(current.yPercent, confirmed.yPercent) ||
    normKeywords(current.markedKeywords) !== normKeywords(confirmed.markedKeywords) ||
    normKeywords(current.missingKeywords) !== normKeywords(confirmed.missingKeywords) ||
    normChecklist(current.checklist) !== normChecklist(confirmed.checklist)
  );
}

export function criteriaGradeHasEdits(current, confirmed) {
  if (!current && !confirmed) return false;
  if (!current || !confirmed) return true;
  if (Number(current.totalMarks) !== Number(confirmed.totalMarks)) return true;
  if (String(current.summary ?? "") !== String(confirmed.summary ?? "")) return true;
  const curRows = current.breakdown || [];
  const confRows = confirmed.breakdown || [];
  if (curRows.length !== confRows.length) return true;
  return curRows.some((row, i) => {
    const base = confRows[i];
    return (
      String(row.criterion ?? "") !== String(base?.criterion ?? "") ||
      Number(row.marksAwarded) !== Number(base?.marksAwarded) ||
      Number(row.maxMarks) !== Number(base?.maxMarks) ||
      String(row.reason ?? "") !== String(base?.reason ?? "")
    );
  });
}

export function cloneCriteriaGrade(grade) {
  if (!grade) return null;
  return {
    ...grade,
    breakdown: (grade.breakdown || []).map((row) => ({ ...row })),
  };
}

export function updateQuestionAt(questions, index, patch) {
  return (questions || []).map((q, i) => (i === index ? { ...q, ...patch } : q));
}

/**
 * Replace one edited row in the editing list.
 *
 * `_stubEdited` records that a marker reviewed a backfilled row. It does not
 * promote the row onto the student's answer pages — undetected questions stay
 * in the report breakdown only (see isBackfilledStub).
 */
export function applyQuestionRowEdit(questions, index, updated) {
  return (questions || []).map((q, i) => {
    if (i !== index) return q;
    if (!isBackfilledStub(q)) return updated;
    if (!questionRowHasEdits(updated, q)) return updated;
    return { ...updated, _stubEdited: true };
  });
}

/** Same, for call sites that build a field patch rather than a whole row. */
export function patchQuestionRowEdit(questions, index, patch) {
  const current = (questions || [])[index];
  if (!current) return questions || [];
  return applyQuestionRowEdit(questions, index, { ...current, ...patch });
}
