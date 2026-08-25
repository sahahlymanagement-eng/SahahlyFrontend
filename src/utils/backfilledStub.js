/**
 * Backfilled stubs are placeholder rows the backend injects for mark-scheme
 * questions it could not find on the script — they are "we did not detect this",
 * not "the student got this wrong". They exist so a teacher can award the marks
 * manually before returning the paper.
 *
 * Stubs are report-only: listed at the front of the grading report, never
 * stamped as badges on the student exam pages.
 *
 * Mirrors isBackfilledStub in SahahlyBackend/src/utils/markSchemeBackfill.js.
 */

/** True when this row was not detected on the script by the marking model. */
export function isBackfilledStub(q) {
  if (!q) return false;

  // Authoritative — injected by mark-scheme backfill.
  if (q._backfilled === true) return true;
  if (q._incompleteMarking === true) return true;
  // Set on every stub: the question was never graded, as opposed to graded
  // and found blank. Checked before any wording match so a copy edit to the
  // stub text cannot make stubs invisible here.
  if (q._notMarked === true || q.checklist?.notMarked === true) return true;

  if (Number(q.marksAwarded) !== 0) return false;

  if (q._staffNote && /not detected|not graded|re-mark required/i.test(String(q._staffNote))) {
    return true;
  }

  return /not detected during automated marking|not (graded|marked) in this (automated )?run|marking failed/i.test(
    `${q.studentAnswer || ""} ${q.reason || ""} ${q._staffNote || ""}`
  );
}

/** Alias used in PDF placement code — same rule as isBackfilledStub. */
export const isUndetectedQuestion = isBackfilledStub;

/** Split a question list into detected rows and inventory stubs. */
export function splitBackfilledStubs(questions) {
  const graded = [];
  const undetected = [];
  for (const q of questions || []) {
    (isBackfilledStub(q) ? undetected : graded).push(q);
  }
  return { graded, undetected };
}
