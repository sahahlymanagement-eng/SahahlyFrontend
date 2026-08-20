import { resolveMarkingGuidanceText } from "./markingFormData";

/** Merge exam-board PDF guidance with user/assignment prompt text. */
export function mergeExamBoardGuidance(examBoardText, userGuidance, assignmentPrompt) {
  const userPart = resolveMarkingGuidanceText(userGuidance, assignmentPrompt);
  const boardPart = String(examBoardText || "").trim();
  if (!boardPart) return userPart;
  if (!userPart) return boardPart;
  return `${boardPart}\n\n${userPart}`;
}
