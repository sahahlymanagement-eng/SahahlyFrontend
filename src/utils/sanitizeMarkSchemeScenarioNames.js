/**
 * Mark-scheme examples often use fictional student names (e.g. "Evan" in a
 * verbal/non-verbal scenario). Strip those before student-facing feedback.
 */

const SCENARIO_PROTAGONIST_RE =
  /\b([A-Z][a-z]{2,})\s+incorrectly\s+(?:thinks|thought|believes|assumes)\b/g;

const QUESTION_TEXT_FIELDS = [
  "reason",
  "studentAnswer",
  "markSchemeAnswer",
  "examinerNote",
  "correctAnswer",
  "studentFinalAnswer",
];

export function sanitizeMarkSchemeScenarioNames(text) {
  if (text == null || text === "") return text;
  return String(text).replace(
    SCENARIO_PROTAGONIST_RE,
    "The student incorrectly thinks"
  );
}

export function sanitizeQuestionScenarioNames(q) {
  if (!q || typeof q !== "object") return q;
  const next = { ...q };
  for (const field of QUESTION_TEXT_FIELDS) {
    if (next[field]) {
      next[field] = sanitizeMarkSchemeScenarioNames(next[field]);
    }
  }
  return next;
}

export function sanitizeQuestionsScenarioNames(questions) {
  return (questions || []).map(sanitizeQuestionScenarioNames);
}

export function sanitizeResultScenarioNames(result) {
  if (!result || typeof result !== "object") return result;
  const next = { ...result };
  if (Array.isArray(next.questions)) {
    next.questions = sanitizeQuestionsScenarioNames(next.questions);
  }
  if (next.summary) {
    next.summary = sanitizeMarkSchemeScenarioNames(next.summary);
  }
  if (next.criteriaGrade?.breakdown) {
    next.criteriaGrade = {
      ...next.criteriaGrade,
      breakdown: sanitizeQuestionsScenarioNames(next.criteriaGrade.breakdown),
    };
  }
  return next;
}
