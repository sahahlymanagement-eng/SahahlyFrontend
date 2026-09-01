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

export function isSubmissionAlreadyReturned({ saved }) {
  // Only trust persisted return timestamps — session flags (bulk.returned / batch.returned)
  // can be stale after a failed return, navigation, or partial Return All.
  if (!saved?.returnedAt) return false;
  return !markingChangedSinceReturn(saved);
}

function normalizeStudentName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildStudentLookupMaps(allStudents = [], batchJob = null) {
  const bySubmissionId = new Map();
  const byStudentId = new Map();
  const byName = new Map();

  const register = (student) => {
    if (!student) return;
    if (student.submissionId) {
      bySubmissionId.set(String(student.submissionId), student);
    }
    // MarkingResult.studentId holds the GOOGLE user id, and the students
    // endpoint exposes it as `studentId` (there is no `_id` on those rows) —
    // key on both so the saved-result fallback can actually match.
    if (student._id != null) {
      byStudentId.set(String(student._id), student);
    }
    if (student.studentId != null) {
      byStudentId.set(String(student.studentId), student);
    }
    if (student.googleUserId != null) {
      byStudentId.set(String(student.googleUserId), student);
    }
    if (student.name) {
      byName.set(normalizeStudentName(student.name), student);
    }
  };

  for (const student of allStudents) register(student);
  for (const student of batchJob?.batchStudents || []) register(student);

  return { bySubmissionId, byStudentId, byName };
}

function resolveStudentForReturn(submissionId, saved, maps) {
  const { bySubmissionId, byStudentId, byName } = maps;
  const key = String(submissionId || "");

  if (key && bySubmissionId.has(key)) {
    return bySubmissionId.get(key);
  }

  const savedStudentId = saved?.studentId;
  if (savedStudentId != null && byStudentId.has(String(savedStudentId))) {
    return byStudentId.get(String(savedStudentId));
  }

  const savedName = saved?.studentName;
  if (savedName && byName.has(normalizeStudentName(savedName))) {
    return byName.get(normalizeStudentName(savedName));
  }

  return {
    submissionId: key || null,
    name: savedName || "Student",
  };
}

function queueEntry(submissionId, saved, student, payload, sourceKey) {
  const liveSubmissionId = student?.submissionId || submissionId;
  return {
    submissionId: liveSubmissionId,
    storedSubmissionId: submissionId,
    student,
    [sourceKey]: payload,
  };
}

export function buildReturnAllQueue({
  bulkProgress = {},
  batchJob = null,
  savedResults = {},
  singleProgress = {},
  allStudents = [],
}) {
  const maps = buildStudentLookupMaps(allStudents, batchJob);
  const resolveStudent = (submissionId, saved) =>
    resolveStudentForReturn(submissionId, saved, maps);

  const bulkQueue = [];
  const batchQueue = [];
  const seen = new Set();

  for (const [submissionId, bulk] of Object.entries(bulkProgress)) {
    if (bulk?.status !== "done" || !bulk?.result) continue;

    const saved = savedResults[submissionId];
    const student = resolveStudent(submissionId, saved);
    const liveId = student?.submissionId || submissionId;
    if (!liveId || seen.has(liveId)) continue;
    if (isSubmissionAlreadyReturned({ saved })) continue;

    bulkQueue.push({
      ...queueEntry(submissionId, saved, student, mergeBulkForReturn(bulk, saved), "bulk"),
    });
    seen.add(liveId);
  }

  for (const [submissionId, batch] of Object.entries(batchJob?.results || {})) {
    const saved = savedResults[submissionId];
    const student = resolveStudent(submissionId, saved);
    const liveId = student?.submissionId || submissionId;
    if (!liveId || seen.has(liveId)) continue;
    if (batch?.status !== "done" || !batch?.result) continue;
    if (isSubmissionAlreadyReturned({ saved })) continue;

    batchQueue.push({
      ...queueEntry(submissionId, saved, student, mergeBatchForReturn(batch, saved), "batch"),
    });
    seen.add(liveId);
  }

  for (const [submissionId, single] of Object.entries(singleProgress)) {
    const saved = savedResults[submissionId];
    const student = resolveStudent(submissionId, saved);
    const liveId = student?.submissionId || submissionId;
    if (!liveId || seen.has(liveId)) continue;
    if (single?.status !== "done" || !single?.result) continue;
    if (isSubmissionAlreadyReturned({ saved })) continue;

    bulkQueue.push({
      ...queueEntry(
        submissionId,
        saved,
        student,
        mergeBulkForReturn(
          {
            status: "done",
            result: single.result,
            studentFile: single.studentFile,
          },
          saved
        ),
        "bulk"
      ),
    });
    seen.add(liveId);
  }

  for (const [submissionId, saved] of Object.entries(savedResults)) {
    const student = resolveStudent(submissionId, saved);
    const liveId = student?.submissionId || submissionId;
    if (!liveId || seen.has(liveId)) continue;
    if (!saved?.result && !saved?.hasResult) continue;
    if (isSubmissionAlreadyReturned({ saved })) continue;

    bulkQueue.push({
      ...queueEntry(
        submissionId,
        saved,
        student,
        mergeBulkForReturn(
          {
            status: "done",
            result: saved.result,
            studentFile: saved.studentFile,
          },
          saved
        ),
        "bulk"
      ),
    });
    seen.add(liveId);
  }

  return { bulkQueue, batchQueue };
}

function mergeBulkForReturn(bulk, saved) {
  if (!saved?.result) return bulk;
  return {
    ...bulk,
    result: saved.result,
    studentFile: bulk?.studentFile || saved.studentFile,
  };
}

function mergeBatchForReturn(batch, saved) {
  if (!saved?.result) return batch;
  return {
    ...batch,
    result: saved.result,
  };
}
