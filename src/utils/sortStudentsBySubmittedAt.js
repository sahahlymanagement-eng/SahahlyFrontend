/**
 * Default submission-viewer order: earliest assignment submission first.
 * Null/invalid times sort last; stable tie-breaker for identical timestamps.
 */

export function submittedAtMs(value) {
  if (value == null || value === "") return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function sortStudentsBySubmittedAt(
  rows,
  {
    getSubmittedAt = (r) =>
      r?.submittedAt ?? r?.submission_date ?? r?.createdAt ?? r?.created_at ?? null,
    getTieBreaker = (r) =>
      r?.submissionId ?? r?.googleUserId ?? r?.studentId ?? r?._id ?? r?.id ?? "",
  } = {}
) {
  return [...(rows || [])].sort((a, b) => {
    const aTime = submittedAtMs(getSubmittedAt(a));
    const bTime = submittedAtMs(getSubmittedAt(b));
    if (aTime !== bTime) return aTime - bTime;

    const aTie = String(getTieBreaker(a) ?? "");
    const bTie = String(getTieBreaker(b) ?? "");
    if (aTie === bTie) return 0;
    return aTie < bTie ? -1 : 1;
  });
}
