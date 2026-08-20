import { resolveMarkingGuidanceText } from "./markingFormData";

/**
 * Exam-board / subject rules are hardcoded on the backend and injected into the
 * general marking prompt. The frontend only sends board + subject keys — never
 * PDF text.
 */

export function appendExamBoardToFormData(fd, { board, subjectKey } = {}) {
  if (!fd) return;
  const b = String(board || "").trim().toLowerCase();
  const s = String(subjectKey || "").trim().toLowerCase();
  if (b === "cambridge" || b === "edexcel") fd.append("examBoard", b);
  if (s) fd.append("examBoardSubjectKey", s);
}

export function examBoardBodyFields({ board, subjectKey } = {}) {
  const b = String(board || "").trim().toLowerCase();
  const s = String(subjectKey || "").trim().toLowerCase();
  const out = {};
  if (b === "cambridge" || b === "edexcel") out.examBoard = b;
  if (s) out.examBoardSubjectKey = s;
  return out;
}

/** Session guidance only (user + assignment prompt) — no exam-board PDF text. */
export function resolveSessionGuidance(userGuidance, assignmentPrompt) {
  return resolveMarkingGuidanceText(userGuidance, assignmentPrompt);
}

/** @deprecated use resolveSessionGuidance — kept so old imports do not crash */
export function mergeExamBoardGuidance(_examBoardText, userGuidance, assignmentPrompt) {
  return resolveSessionGuidance(userGuidance, assignmentPrompt);
}
