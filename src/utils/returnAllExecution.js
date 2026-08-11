/**
 * Shared Return All helpers — used by assistant and manager submission viewers.
 */

import { buildReturnAllQueue } from "./returnAllQueue";

export function mapSavedResultsFromApi(rows = []) {
  const map = {};
  for (const r of rows) {
    if (!r?.submissionId) continue;
    map[r.submissionId] = {
      status: "done",
      result: r.result,
      aiOriginalResult: r.aiOriginalResult || r.result,
      studentFile: r.studentFileMeta,
      totalMarks: r.totalMarks,
      classroomAssignedGrade: r.classroomAssignedGrade ?? null,
      summary: r.summary || "",
      returnedAt: r.returnedAt ?? null,
      updatedAt: r.updatedAt ?? null,
      teacherEditedAt: r.teacherEditedAt ?? null,
      studentId: r.studentId ?? null,
      studentName: r.studentName ?? null,
    };
  }
  return map;
}

/** Load persisted marking results so Return All uses DB return state, not stale UI flags. */
export async function fetchSavedResultsMap(api, assignmentId) {
  if (!assignmentId) return {};
  const res = await api.get(`/submission-files/save-results/${assignmentId}`);
  return mapSavedResultsFromApi(res.data?.data || []);
}

function isPdfFileLike(file) {
  return (
    file instanceof File ||
    file instanceof Blob ||
    (file && typeof file.arrayBuffer === "function")
  );
}

async function resolveStudentPdfFile({
  api,
  assignmentId,
  submissionId,
  studentName,
  existingFile,
}) {
  if (isPdfFileLike(existingFile)) return existingFile;

  const pdfRes = await api.get("/submission-files/pdf", {
    params: { assignmentId, submissionId },
    responseType: "blob",
  });

  return new File(
    [pdfRes.data],
    `${studentName || "student"}.pdf`,
    { type: "application/pdf" }
  );
}

/**
 * Return every item in the queue. Continues after individual failures and reports a summary.
 */
export async function runReturnAllQueue({
  api,
  assignmentId,
  bulkQueue = [],
  batchQueue = [],
  maxGradeFallback = 0,
  gradeContext,
  annotatePdf,
  resolvePdfSummary,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  appendClassroomGradeToFormData,
  resolveTotalMarksFromResult,
}) {
  const computeReturnMarks = (result, editingQs) => ({
    total:
      resolveTotalMarksFromResult(result) ??
      editingQs.reduce((s, q) => s + (Number(q.marksAwarded) || 0), 0),
    max:
      result?.criteriaGrade?.maxTotalMarks ??
      result?.maxTotalMarks ??
      maxGradeFallback ??
      0,
  });

  const failures = [];
  let successCount = 0;

  const returnOne = async ({
    submissionId,
    student,
    result,
    studentFile: existingFile,
    source,
    bulk,
    batch,
  }) => {
    const label = student?.name || submissionId || "Student";

    if (!result) {
      failures.push({ submissionId, label, reason: "Missing marking data" });
      return;
    }

    try {
      const studentFile = await resolveStudentPdfFile({
        api,
        assignmentId,
        submissionId: student?.submissionId || submissionId,
        studentName: student?.name,
        existingFile,
      });

      const editingQs = result.questions || [];
      const { total, max } = computeReturnMarks(result, editingQs);

      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQs,
        maxTotalMarks: max,
        summary: resolvePdfSummary(submissionId, result),
        outOfScopeNotes: getOutOfScopeNotes(result),
        teacherAnnotations: getTeacherAnnotations(result),
        criteriaGrade: result.criteriaGrade,
        markingMode: result.markingMode || "normal",
      });

      const fd = new FormData();
      fd.append(
        "annotatedPdf",
        new Blob([pdfBytes], { type: "application/pdf" }),
        "graded.pdf"
      );
      fd.append("assignmentId", assignmentId);
      fd.append("submissionId", student?.submissionId || submissionId);
      fd.append("totalMarks", total);
      fd.append("maxTotalMarks", max);
      fd.append("studentName", student?.name || "Student");
      if (student?.googleUserId) {
        fd.append("googleUserId", student.googleUserId);
      }
      if (student?._id) {
        fd.append("studentDbId", String(student._id));
      }
      appendClassroomGradeToFormData(fd, {
        submissionId: student?.submissionId || submissionId,
        student,
        ...gradeContext,
        fallbackTotal: total,
      });

      await api.post("/submission-files/return-marked", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });

      successCount += 1;
      return {
        submissionId: student?.submissionId || submissionId,
        storedSubmissionId: submissionId,
        source,
        bulk,
        batch,
        returnedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`Return failed for ${label}:`, err);
      failures.push({
        submissionId,
        label,
        reason:
          err?.response?.data?.message ||
          err?.message ||
          "Return failed",
      });
      return null;
    }
  };

  const outcomes = [];

  for (const { submissionId, student, bulk } of bulkQueue) {
    const outcome = await returnOne({
      submissionId,
      student,
      result: bulk?.result,
      studentFile: bulk?.studentFile,
      source: "bulk",
      bulk,
    });
    if (outcome) outcomes.push(outcome);
  }

  for (const { submissionId, student, batch } of batchQueue) {
    const outcome = await returnOne({
      submissionId,
      student,
      result: batch?.result,
      source: "batch",
      batch,
    });
    if (outcome) outcomes.push(outcome);
  }

  return { successCount, failures, outcomes, total: bulkQueue.length + batchQueue.length };
}

/** Human-readable summary when some Return All items fail. */
export function formatReturnFailuresMessage(successCount, failures = []) {
  if (!failures.length) {
    return `Returned ${successCount} graded paper${successCount === 1 ? "" : "s"}`;
  }
  const names = failures
    .slice(0, 4)
    .map((f) => f.label || f.submissionId || "Student")
    .join(", ");
  const extra = failures.length > 4 ? ` +${failures.length - 4} more` : "";
  return `Returned ${successCount}. Failed: ${names}${extra}. ${failures[0]?.reason || ""}`.trim();
}

/** Save summaries before return; failures are logged but do not block returns. */
export async function saveReturnSummaries(api, assignmentId, queue, resolvePdfSummary) {
  const requests = [
    ...queue.bulkQueue.map(({ submissionId, bulk }) => {
      const summary = resolvePdfSummary(submissionId, bulk?.result);
      if (!summary) return null;
      return api.post("/submission-files/save-summary", {
        assignmentId,
        submissionId,
        summary,
      });
    }),
    ...queue.batchQueue.map(({ submissionId, batch }) => {
      const summary = resolvePdfSummary(submissionId, batch?.result);
      if (!summary) return null;
      return api.post("/submission-files/save-summary", {
        assignmentId,
        submissionId,
        summary,
      });
    }),
  ].filter(Boolean);

  if (!requests.length) return;

  const results = await Promise.allSettled(requests);
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`${failed} summary save(s) failed before Return All`);
  }
}

/**
 * Build a return queue using fresh DB state for which papers were already returned.
 */
export async function buildFreshReturnAllQueue({
  api,
  assignmentId,
  studentsMarkingUrl,
  fetchAllPaginated,
  bulkProgress,
  batchJob,
  singleProgress,
  localSavedResults = {},
}) {
  let allStudents = [];
  let savedResults = localSavedResults;

  try {
    [allStudents, savedResults] = await Promise.all([
      fetchAllPaginated(api, studentsMarkingUrl, {}, "students"),
      fetchSavedResultsMap(api, assignmentId),
    ]);
  } catch (err) {
    console.error("Failed to load students/saved results for Return All:", err);
    throw err;
  }

  const mergedSingle = { ...singleProgress, ...savedResults };

  return {
    allStudents,
    savedResults,
    queue: buildReturnAllQueue({
      bulkProgress,
      batchJob,
      savedResults,
      singleProgress: mergedSingle,
      allStudents,
    }),
  };
}

export { buildReturnAllQueue };
