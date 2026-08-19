/**
 * Shared Return All helpers — used by assistant and manager submission viewers.
 */

import { buildReturnAllQueue } from "./returnAllQueue";
import { getApiErrorMessage } from "./markingFormData";
import { invalidateStudentPdf } from "./studentPdfCache";

export function mapSavedResultsFromApi(rows = []) {
  const map = {};
  for (const r of rows) {
    if (!r?.submissionId) continue;
    map[r.submissionId] = {
      status: "done",
      result: r.result,
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

/** The Google user id, however the caller's student row spells it. */
export function studentGoogleUserId(student) {
  return student?.googleUserId || student?.studentId || null;
}

/**
 * A paper marked 0 because nothing was turned in has no student PDF to
 * annotate. Returning it is still meaningful — the grade and the Classroom
 * return are the whole point — so it goes back without an attachment.
 */
function isGradeOnlyReturn(result) {
  return Boolean(result?.noSubmission);
}

/** True when /submission-files/pdf says the submission carries nothing to download. */
export async function isNoAttachmentError(err) {
  if (err?.response?.status !== 404) return false;

  const data = err.response.data;
  try {
    const parsed =
      data instanceof Blob ? JSON.parse(await data.text()) : data;
    if (parsed?.noAttachment) return true;
    return /no attachments found|no downloadable file/i.test(
      String(parsed?.message || "")
    );
  } catch {
    return false;
  }
}

async function resolveStudentPdfFile({
  api,
  assignmentId,
  submissionId,
  studentName,
  googleUserId,
  existingFile,
}) {
  if (isPdfFileLike(existingFile)) return existingFile;

  const pdfRes = await api.get("/submission-files/pdf", {
    params: { assignmentId, submissionId, googleUserId: googleUserId || undefined },
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
    storedSubmissionId,
    student,
    result,
    studentFile: existingFile,
    source,
    bulk,
    batch,
  }) => {
    const label = student?.name || submissionId || "Student";
    const liveSubmissionId = student?.submissionId || submissionId;
    const googleUserId = studentGoogleUserId(student);

    if (!result) {
      failures.push({ submissionId, label, reason: "Missing marking data" });
      return;
    }

    try {
      const editingQs = result.questions || [];
      const { total, max } = computeReturnMarks(result, editingQs);

      let gradeOnly = isGradeOnlyReturn(result);
      let studentFile = null;

      if (!gradeOnly) {
        try {
          studentFile = await resolveStudentPdfFile({
            api,
            assignmentId,
            submissionId: liveSubmissionId,
            studentName: student?.name,
            googleUserId,
            existingFile,
          });
        } catch (err) {
          // Nothing was attached to annotate. That is not a return failure —
          // the grade and the Classroom return still have to reach the student.
          if (await isNoAttachmentError(err)) gradeOnly = true;
          else throw err;
        }
      }

      const pdfBytes = gradeOnly
        ? null
        : await annotatePdf({
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
      if (pdfBytes) {
        fd.append(
          "annotatedPdf",
          new Blob([pdfBytes], { type: "application/pdf" }),
          "graded.pdf"
        );
      } else {
        fd.append("gradeOnly", "1");
      }
      fd.append("assignmentId", assignmentId);
      fd.append("submissionId", liveSubmissionId);
      fd.append("totalMarks", total);
      fd.append("maxTotalMarks", max);
      fd.append("studentName", student?.name || "Student");
      if (googleUserId) {
        fd.append("googleUserId", String(googleUserId));
      }
      if (student?._id) {
        fd.append("studentDbId", String(student._id));
      }
      appendClassroomGradeToFormData(fd, {
        submissionId: liveSubmissionId,
        student,
        ...gradeContext,
        fallbackTotal: total,
      });

      await api.post("/submission-files/return-marked", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000,
      });

      // Returning attaches (or rewrites) a marked PDF on the submission, so the
      // cached download is no longer necessarily what /pdf would hand back.
      invalidateStudentPdf(assignmentId, storedSubmissionId || submissionId);

      successCount += 1;
      return {
        submissionId: liveSubmissionId,
        // The key the caller's local state is under — NOT the live id, or a
        // paper whose submission moved never clears its "not returned" flag.
        storedSubmissionId: storedSubmissionId || submissionId,
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
        reason: (await getApiErrorMessage(err)) || err?.message || "Return failed",
      });
      return null;
    }
  };

  const outcomes = [];

  for (const { submissionId, storedSubmissionId, student, bulk } of bulkQueue) {
    const outcome = await returnOne({
      submissionId,
      storedSubmissionId,
      student,
      result: bulk?.result,
      studentFile: bulk?.studentFile,
      source: "bulk",
      bulk,
    });
    if (outcome) outcomes.push(outcome);
  }

  for (const { submissionId, storedSubmissionId, student, batch } of batchQueue) {
    const outcome = await returnOne({
      submissionId,
      storedSubmissionId,
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
