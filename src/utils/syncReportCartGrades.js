/** Fields synced from a fresh student row into report cart items. */
const SYNC_FIELDS = [
  "assignedGrade",
  "state",
  "submittedAt",
  "isLate",
  "isOnTime",
  "submissionId",
];

/**
 * Keep report selections and comments; update grades/submission status from fresh API data.
 */
export function syncReportCartGrades(reportCart, freshByKey, getStudentKey) {
  if (!reportCart || !Object.keys(reportCart).length) return reportCart;

  const next = {};
  for (const [cartKey, entry] of Object.entries(reportCart)) {
    const key = String(getStudentKey(entry.studentMeta) ?? cartKey);
    const fresh = freshByKey[key] || freshByKey[cartKey];

    const studentMeta = fresh
      ? { ...entry.studentMeta, ...fresh }
      : entry.studentMeta;

    const items = {};
    for (const [asgId, item] of Object.entries(entry.items || {})) {
      if (!fresh) {
        items[asgId] = item;
        continue;
      }
      const patch = {};
      for (const field of SYNC_FIELDS) {
        if (fresh[field] !== undefined) patch[field] = fresh[field];
      }
      items[asgId] = { ...item, ...patch };
    }

    next[cartKey] = { studentMeta, items };
  }

  return next;
}

export function studentsByKey(students, getStudentKey) {
  const map = {};
  for (const s of students) {
    map[String(getStudentKey(s))] = s;
  }
  return map;
}
