/**
 * Build queues for Return All — uses every graded submission, not just the current page.
 */
export function isSubmissionAlreadyReturned({ bulk, batch, student }) {
  if (bulk?.returned || batch?.returned) return true;
  if (student?.state === "RETURNED") return true;
  return false;
}

export function buildReturnAllQueue({
  bulkProgress = {},
  batchJob = null,
  savedResults = {},
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

    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ bulk, student })) continue;

    bulkQueue.push({ submissionId, student, bulk });
    seen.add(submissionId);
  }

  for (const [submissionId, batch] of Object.entries(batchJob?.results || {})) {
    if (seen.has(submissionId)) continue;
    if (batch?.status !== "done" || !batch?.result) continue;

    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ batch, student })) continue;

    batchQueue.push({ submissionId, student, batch });
    seen.add(submissionId);
  }

  for (const [submissionId, saved] of Object.entries(savedResults)) {
    if (seen.has(submissionId)) continue;
    if (!saved?.result) continue;

    const student = resolveStudent(submissionId);
    if (isSubmissionAlreadyReturned({ student })) continue;

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
