import { MARKING_CHECKLIST_CONFIG } from "../constants/markingChecklist";

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

export function questionRowHasEdits(current, confirmed) {
  if (!current || !confirmed) return true;
  return (
    String(current.questionNumber ?? "") !== String(confirmed.questionNumber ?? "") ||
    Number(current.marksAwarded) !== Number(confirmed.marksAwarded) ||
    Number(current.maxMarks) !== Number(confirmed.maxMarks) ||
    String(current.reason ?? "") !== String(confirmed.reason ?? "") ||
    String(current.studentAnswer ?? "") !== String(confirmed.studentAnswer ?? "") ||
    String(current.correctAnswer ?? "") !== String(confirmed.correctAnswer ?? "") ||
    String(current.studyTopic ?? "") !== String(confirmed.studyTopic ?? "") ||
    String(current.mistakeAdvice ?? "") !== String(confirmed.mistakeAdvice ?? "") ||
    Number(current.pageNumber) !== Number(confirmed.pageNumber) ||
    Number(current.yPercent) !== Number(confirmed.yPercent) ||
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
