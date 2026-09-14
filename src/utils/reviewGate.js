import api from "../api/api";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
/**
 * Text from the first page or two of the submission.
 *
 * A mark scheme uploaded as a student's work is caught by its filename only
 * when the filename follows the 9700_s23_ms_42 convention. A scan named
 * "IMG_2931.pdf" needs the header text - "MARK SCHEME for the May/June 2023
 * series" - and that is on the page, not in the name.
 *
 * Two pages, not the whole document: the header is at the front, and reading
 * a 40-page scan to decide this would cost more than the check is worth.
 * Returns "" on any failure - a scanned image PDF has no text layer at all,
 * which is normal and must not look like an error.
 */
async function firstPagesText(file) {
  if (!file) return "";
  try {
    const buf = await file.arrayBuffer();
    const doc = await getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it) => it.str).join(" ") + " ";
    }
    return out.slice(0, 4000);
  } catch {
    return "";
  }
}

export async function checkReviewGate({
  questions,
  result,
  expectedStudentName,
  fileName,
  studentFile = null,
  assignmentId = null,
  pageCountFlag = null,
  reviewedBy = null,
  reviewReason = null,
}) {
  const empty = { blocked: false, requiresReview: false, blockers: [], advisory: [] };
  try {
    const { data } = await api.post("/pdf-annotation/review-gate", {
      questions: Array.isArray(questions) ? questions : [],
      assignmentId: assignmentId || null,
      submissionHeaderText: await firstPagesText(studentFile),
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
