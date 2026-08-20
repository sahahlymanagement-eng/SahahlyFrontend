/**
 * Map math Unicode / LaTeX-ish inequality symbols to ASCII so Helvetica PDF
 * text and plain UI fields do not turn ≤/≥ into "?".
 * Keep in sync with backend/src/utils/normalizeMathSymbols.js
 */

export function normalizeMathSymbols(text) {
  if (text == null) return text;
  let s = String(text);

  s = s.replace(/[≤⩽≦≲]/g, "<=");
  s = s.replace(/[≥⩾≧≳]/g, ">=");
  s = s.replace(/[＜‹⟨]/g, "<");
  s = s.replace(/[＞›⟩]/g, ">");
  s = s.replace(/≰/g, "not<=");
  s = s.replace(/≱/g, "not>=");
  s = s.replace(/≺/g, "<");
  s = s.replace(/≻/g, ">");

  s = s.replace(/\\le(?![a-z])/gi, "<=");
  s = s.replace(/\\ge(?![a-z])/gi, ">=");
  s = s.replace(/\\leq(?![a-z])/gi, "<=");
  s = s.replace(/\\geq(?![a-z])/gi, ">=");
  s = s.replace(/\\lt(?![a-z])/gi, "<");
  s = s.replace(/\\gt(?![a-z])/gi, ">");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&le;/gi, "<=");
  s = s.replace(/&ge;/gi, ">=");

  return s;
}

const TEXT_FIELDS = [
  "reason",
  "studentAnswer",
  "studentFinalAnswer",
  "correctAnswer",
  "mistakeAdvice",
  "studyTopic",
  "printedStem",
];

export function normalizeMathSymbolsInQuestion(question) {
  if (!question || typeof question !== "object") return question;
  const next = { ...question };
  for (const key of TEXT_FIELDS) {
    if (next[key] != null) next[key] = normalizeMathSymbols(next[key]);
  }
  if (Array.isArray(next.markedKeywords)) {
    next.markedKeywords = next.markedKeywords.map((k) =>
      typeof k === "string" ? normalizeMathSymbols(k) : k
    );
  }
  if (Array.isArray(next.missingKeywords)) {
    next.missingKeywords = next.missingKeywords.map((k) =>
      typeof k === "string" ? normalizeMathSymbols(k) : k
    );
  }
  if (Array.isArray(next.markPoints)) {
    next.markPoints = next.markPoints.map((p) => {
      if (!p || typeof p !== "object") return p;
      const point = { ...p };
      if (point.evidence != null) point.evidence = normalizeMathSymbols(point.evidence);
      if (point.code != null) point.code = normalizeMathSymbols(point.code);
      return point;
    });
  }
  return next;
}

export function normalizeMathSymbolsInQuestions(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.map(normalizeMathSymbolsInQuestion);
}
