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
 *
 * A stub stops being one as soon as a marker edits it — see `_stubEdited`,
 * stamped by applyQuestionRowEdit in utils/markingQuestionEdits.js.
 */
export function isBackfilledStub(q) {
  if (!q) return false;

  // A human has since worked on this row, so it is no longer "we did not detect
  // this" — it is marked work, and it gets a badge, a placement handle and
  // examiner-column feedback like any other question. Both signals are checked
  // before `_backfilled` so a stamped stub cannot be dragged back to placeholder
  // status by a flag the backend set before anyone looked at it.
  if (q._stubEdited === true) return false;
  // Nothing that creates a stub ever awards marks (see markSchemeBackfill.js),
  // so a non-zero score can only have come from a marker. Kept as a second,
  // field-free signal for rows that lose `_stubEdited` in a JSON round-trip.
  if (Number(q.marksAwarded) > 0) return false;

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
