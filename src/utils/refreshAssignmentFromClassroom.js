import { syncReportCartGrades, studentsByKey } from "./syncReportCartGrades";
import { computeGradePercent } from "./reportGradePercent";

/** Sync maxPoints from Google Classroom into the local assignment record. */
export async function syncAssignmentFromClassroom(api, assignmentId, route = "manager") {
  const path =
    route === "manager"
      ? `/manager-assignments/${assignmentId}/sync-classroom`
      : `/assignment-submissions/${assignmentId}/sync-classroom`;
  const res = await api.post(path);
  return res.data.maxPoints ?? null;
}

/** Fetch latest student rows (grades, submission ids, status) from Google Classroom. */
export async function fetchFreshStudents(api, assignmentId, route = "manager", params = {}) {
  const url =
    route === "manager"
      ? `/manager-assignments/${assignmentId}/full`
      : `/assignment-submissions/${assignmentId}/students`;
  const res = await api.get(url, { params: { page: 1, limit: 9999, ...params } });
  return {
    students: res.data.students || [],
    summaryMap: res.data.summaryMap || {},
    maxPoints: res.data.assignment?.maxPoints ?? res.data.maxGrade ?? null,
  };
}

/** Update report cart grades, submission ids, maxPoints, and recalculated percentages. */
export function applyReportCartGradeSync(reportCart, freshList, maxPoints, getStudentKey) {
  if (!reportCart || !Object.keys(reportCart).length) return reportCart;

  const freshByKey = studentsByKey(freshList, getStudentKey);
  const synced = syncReportCartGrades(reportCart, freshByKey, getStudentKey);

  const next = {};
  for (const [key, entry] of Object.entries(synced)) {
    const keyStr = String(getStudentKey(entry.studentMeta) ?? key);
    const fresh = freshByKey[keyStr] || freshByKey[key];
    const items = {};
    for (const [asgId, item] of Object.entries(entry.items || {})) {
      const grade = fresh?.assignedGrade ?? item.assignedGrade;
      const points = maxPoints ?? item.maxPoints ?? null;
      items[asgId] = {
        ...item,
        assignedGrade: grade,
        maxPoints: points,
        percentage:
          points != null
            ? computeGradePercent(grade, points) || null
            : null,
      };
    }
    next[key] = { ...entry, items };
  }
  return next;
}

/** Rebuild per-submission % overrides from fresh grades (submission viewer tables). */
export function buildPercentOverridesFromStudents(students, maxPoints, getSubmissionId) {
  if (!maxPoints || !students?.length) return {};
  const next = {};
  for (const student of students) {
    const submissionId = getSubmissionId(student);
    const grade = student?.assignedGrade;
    if (!submissionId || grade == null) continue;
    const pct = computeGradePercent(grade, maxPoints);
    if (pct !== "") next[submissionId] = pct;
  }
  return next;
}

/** Full refresh: maxPoints + live student submissions from Google Classroom. */
export async function refreshAssignmentGrades(api, assignmentId, route = "manager") {
  const maxPoints = await syncAssignmentFromClassroom(api, assignmentId, route);
  const fresh = await fetchFreshStudents(api, assignmentId, route);
  return {
    ...fresh,
    maxPoints: maxPoints ?? fresh.maxPoints,
  };
}
