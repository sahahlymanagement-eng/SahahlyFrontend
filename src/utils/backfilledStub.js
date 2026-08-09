/**
 * Backfilled stubs are placeholder rows the backend injects for mark-scheme
 * questions it could not find on the script — they are "we did not detect this",
 * not "the student got this wrong". They exist so a teacher can award the marks
 * manually before returning the paper.
 *
 * Mirrors isBackfilledStub in SahahlyBackend/src/utils/markSchemeBackfill.js.
 * The text fallback covers rows that lost the `_backfilled` key on their way
 * through a JSON round-trip; every stub the backend creates carries this
 * sentence in its studentAnswer and its reason.
 */
export function isBackfilledStub(q) {
  if (!q) return false;
  if (q._backfilled === true) return true;
  if (Number(q.marksAwarded) !== 0) return false;
  return /not detected during automated marking/i.test(
    `${q.studentAnswer || ""} ${q.reason || ""}`
  );
}

/** Split a question list into the rows that were actually marked and the stubs. */
export function splitBackfilledStubs(questions) {
  const graded = [];
  const undetected = [];
  for (const q of questions || []) {
    (isBackfilledStub(q) ? undetected : graded).push(q);
  }
  return { graded, undetected };
}
