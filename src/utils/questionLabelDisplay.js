/**
 * Display helpers when page-local labels differ from mark-scheme question ids.
 */

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/^question\s*/i, "")
    .replace(/^Q/i, "")
    .toLowerCase();
}

export function hasPrintedLabelMismatch(question) {
  const ms = normalizeLabel(question?.questionNumber);
  const printed = normalizeLabel(question?.printedQuestionNumber);
  return Boolean(printed && ms && printed !== ms);
}

export function formatPrintedLabelHint(question) {
  if (!hasPrintedLabelMismatch(question)) return null;
  return `Page label: Q${question.printedQuestionNumber}`;
}
