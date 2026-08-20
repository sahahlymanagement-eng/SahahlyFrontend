/**
 * Default submission-viewer order:
 * 1) people who submitted, earliest submission first
 * 2) people who did not submit, after everyone who submitted
 */

function hasRealSubmission(row) {
  const state = String(row?.state || "").toUpperCase();
  if (state === "TURNED_IN" || state === "RETURNED") return true;
  // Partner rows often have no Classroom state — a real timestamp counts.
  if (row?.submittedAt || row?.submission_date) return true;
  const local = String(row?.localStatus || "").toLowerCase();
  if (local && local !== "pending" && local !== "new") return true;
  return false;
}

export function submittedAtMs(value) {
  if (value == null || value === "") return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function sortStudentsBySubmittedAt(
  rows,
  {
    getSubmittedAt = (r) =>
      r?.submittedAt ?? r?.submission_date ?? null,
    getTieBreaker = (r) =>
      r?.submissionId ?? r?.googleUserId ?? r?.studentId ?? r?._id ?? r?.id ?? "",
  } = {}
) {
  return [...(rows || [])].sort((a, b) => {
    const aSubmitted = hasRealSubmission(a);
    const bSubmitted = hasRealSubmission(b);
    if (aSubmitted !== bSubmitted) return aSubmitted ? -1 : 1;

    const aTime = aSubmitted
      ? submittedAtMs(getSubmittedAt(a))
      : Number.POSITIVE_INFINITY;
    const bTime = bSubmitted
      ? submittedAtMs(getSubmittedAt(b))
      : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;

    const aTie = String(getTieBreaker(a) ?? "");
    const bTie = String(getTieBreaker(b) ?? "");
    if (aTie === bTie) return 0;
    return aTie < bTie ? -1 : 1;
  });
}
