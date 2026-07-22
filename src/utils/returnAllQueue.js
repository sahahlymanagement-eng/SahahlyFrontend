/**
 * Build queues for Return All — uses every graded submission, not just the current page.
 */

function markingChangedSinceReturn(saved) {
  if (!saved?.returnedAt) return true;

  const returnedAt = new Date(saved.returnedAt).getTime();
  if (!Number.isFinite(returnedAt)) return true;

  const updatedAt = saved.updatedAt ? new Date(saved.updatedAt).getTime() : 0;
  const editedAt = saved.teacherEditedAt
    ? new Date(saved.teacherEditedAt).getTime()
    : 0;
  const lastChange = Math.max(updatedAt, editedAt);

  return !Number.isFinite(lastChange) || lastChange > returnedAt;
}

export function isSubmissionAlreadyReturned({ bulk, batch, saved }) {
  if (bulk?.returned || batch?.returned) return true;

  if (saved?.returnedAt && !markingChangedSinceReturn(saved)) {
    return true;
  }

  return false;
}

export function buildReturnAllQueue({
  bulkProgress = {},
  batchJob = null,
  savedResults = {},
  singleProgress = {},
  allStudents = [],
}) {
  const studentById = new Map();

  for (const student of allStudents) {
    if (student?.submissionId) {
      studentById.set(student.submissionId, student);
    }
  }

  for (const student of batchJob?.batchStudents || []) {
    if (student?.submissionId && !studentById.has(student.submissionId)) {
      studentById.set(student.submissionId, student);
    }
  }

  const resolveStudent = (submissionId) =>
    studentById.get(submissionId) || { submissionId, name: "Student" };

  const bulkQueue = [];
  const batchQueue = [];
  const seen = new Set();

  for (const [submissionId, bulk] of Object.entries(bulkProgress)) {
    if (bulk?.status !== "done" || !bulk?.result) continue;

    const saved = savedResults[submissionId];
    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ bulk, saved })) continue;

    bulkQueue.push({ submissionId, student, bulk });
    seen.add(submissionId);
  }

  for (const [submissionId, batch] of Object.entries(batchJob?.results || {})) {
    if (seen.has(submissionId)) continue;
    if (batch?.status !== "done" || !batch?.result) continue;

    const saved = savedResults[submissionId];
    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ batch, saved })) continue;

    batchQueue.push({ submissionId, student, batch });
    seen.add(submissionId);
  }

  for (const [submissionId, single] of Object.entries(singleProgress)) {
    if (seen.has(submissionId)) continue;
    if (single?.status !== "done" || !single?.result) continue;

    const saved = savedResults[submissionId];
    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ bulk: single, saved })) continue;

    bulkQueue.push({
      submissionId,
      student,
      bulk: {
        status: "done",
        result: single.result,
        studentFile: single.studentFile,
      },
    });
    seen.add(submissionId);
  }

  for (const [submissionId, saved] of Object.entries(savedResults)) {
    if (seen.has(submissionId)) continue;
    if (!saved?.result) continue;

    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ saved })) continue;

    bulkQueue.push({
      submissionId,
      student,
      bulk: {
        status: "done",
        result: saved.result,
        studentFile: saved.studentFile,
      },
    });
    seen.add(submissionId);
  }

  return { bulkQueue, batchQueue };
}
