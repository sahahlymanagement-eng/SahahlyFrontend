import api from "../api/api";

/**
 * Ask the backend whether this correction may be released.
 *
 * WHY THE CHECK LIVES ON THE SERVER
 *
 * The annotated PDF is built here in the browser (utils/annotatePdf.js), so the
 * safety checks the backend grew - mark-scheme mismatch, wrong paper variant, a
 * mark scheme uploaded as a submission, a name that is not this student's,
 * marks that contradict their own feedback, a re-mark that disagreed with the
 * run before it - had no way to reach the papers students actually receive.
 *
 * Reimplementing them here would create two copies that drift, and the copy
 * that matters would be the one nobody tests. So the browser asks instead:
 * POST the marking result as JSON, get back the blockers.
 *
 * FAILS OPEN. Every error path returns "not blocked". This gate exists to stop
 * a bad correction reaching a student; it must never stop a good one reaching
 * them because a request timed out.
 */
export async function checkReviewGate({
  questions,
  result,
  expectedStudentName,
  fileName,
  pageCountFlag = null,
  reviewedBy = null,
  reviewReason = null,
}) {
  const empty = { blocked: false, requiresReview: false, blockers: [], advisory: [] };
  try {
    const { data } = await api.post("/pdf-annotation/review-gate", {
      questions: Array.isArray(questions) ? questions : [],
      result: result || null,
      expectedStudentName: expectedStudentName || null,
      fileName: fileName || null,
      pageCountFlag,
      reviewedBy,
      reviewReason,
    });
    return data && typeof data === "object" ? { ...empty, ...data } : empty;
  } catch (err) {
    // Network failure, auth failure, server error - all the same answer.
    console.warn("[review-gate] check failed, releasing without it:", err?.message);
    return empty;
  }
}

/** One reviewer-facing line per blocker, most severe first (server order). */
export function describeBlockers(blockers) {
  return (blockers || []).map((b) => b.message).filter(Boolean);
}

/**
 * A confirm() the reviewer can act on.
 *
 * Deliberately lists the reasons rather than saying "there are problems": a
 * dialog that does not say what is wrong trains people to click through it,
 * which is worse than having no gate at all.
 */
export function confirmRelease(blockers) {
  const lines = describeBlockers(blockers);
  if (!lines.length) return true;
  return window.confirm(
    "This correction was flagged before release:\n\n" +
      lines.map((l, i) => `${i + 1}. ${l}`).join("\n\n") +
      "\n\nRelease it anyway?"
  );
}
