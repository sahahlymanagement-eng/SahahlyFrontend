/**
 * Backfilled stubs are placeholder rows the backend injects for mark-scheme
 * questions it could not find on the script — they are "we did not detect this",
 * not "the student got this wrong". They exist so a teacher can award the marks
 * manually before returning the paper.
 *
 * These rows never receive annotation badges on the student's answer pages — only
 * the grading report / cover breakdown. Staff review them in the editor and in
 * that report section.
 *
 * Mirrors isBackfilledStub in SahahlyBackend/src/utils/markSchemeBackfill.js.
 */

/** True when this row was not detected on the script and must stay off answer pages. */
export function isBackfilledStub(q) {
  if (!q) return false;

  // Authoritative — injected by mark-scheme backfill; stays report-only even
  // after a marker awards marks or edits feedback.
  if (q._backfilled === true) return true;

  if (Number(q.marksAwarded) !== 0) return false;

  if (q._staffNote && /not detected/i.test(String(q._staffNote))) return true;

  return /not detected during automated marking/i.test(
    `${q.studentAnswer || ""} ${q.reason || ""} ${q._staffNote || ""}`
  );
}

/** Alias used in PDF placement code — same rule as isBackfilledStub. */
export const isUndetectedQuestion = isBackfilledStub;

/** Split a question list into detected rows (script placement) and report-only stubs. */
export function splitBackfilledStubs(questions) {
  const graded = [];
  const undetected = [];
  for (const q of questions || []) {
    (isBackfilledStub(q) ? undetected : graded).push(q);
  }
  return { graded, undetected };
}
