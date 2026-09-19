/**
 * Shared Return All helpers — used by assistant and manager submission viewers.
 */

import { buildReturnAllQueue } from "./returnAllQueue";
import { getApiErrorMessage } from "./markingFormData";
import { fetchStudentPdf, invalidateStudentPdf } from "./studentPdfCache";
import { getMarkingIntegrityPublishGate } from "./markingIntegrityPublish";

import {
  mapSavedResultsFromApi,
  fetchSavedResultsLight,
  hydrateSavedResultsForReturn,
} from "./savedResultsApi";

export { mapSavedResultsFromApi };

/** Load persisted marking results so Return All uses DB return state, not stale UI flags. */
export async function fetchSavedResultsMap(api, assignmentId) {
  return fetchSavedResultsLight(api, assignmentId);
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

/** True when /return-marked's own error body says Google quota is exhausted (not a one-off transient hiccup). */
async function isQuotaExhaustedError(err) {
  const data = err?.response?.data;
  if (data?.quotaExhausted === true) return true;
  if (!(data instanceof Blob)) return false;
  try {
    return JSON.parse(await data.text())?.quotaExhausted === true;
  } catch {
    return false;
  }
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
  googleUserId,
  existingFile,
  directUrl,
  directExpiresAt,
}) {
  if (isPdfFileLike(existingFile)) return existingFile;

  return fetchStudentPdf(api, {
    assignmentId,
    submissionId,
    googleUserId: googleUserId || undefined,
    directUrl,
    directExpiresAt,
  });
}

/**
 * Classroom applies per-user/project quotas across patch, attachment and
 * return calls. A flat delay between every paper used to guess a worst-case
 * gap regardless of load — a 5-student class and a 50-student class paid the
 * exact same per-paper tax. The backend's own retry (withGoogleApiRetry)
 * already holds off for real when it hits actual quota pressure and reports
 * how long it waited as `quotaBackoffMs` on the response — that is real
 * backpressure, not a guess. This starts fast and only slows down when that
 * signal (or an outright failure) shows up, then eases back down after a run
 * of clean returns.
 */
function createReturnPacer({ minDelayMs = 1000, maxDelayMs = 10000, easeAfterCleanCount = 3 } = {}) {
  let delayMs = minDelayMs;
  let cleanStreak = 0;

  return {
    wait: () => new Promise((resolve) => setTimeout(resolve, delayMs)),
    recordOutcome({ backoffMs = 0, failed = false } = {}) {
      if (failed || backoffMs > 0) {
        cleanStreak = 0;
        // The request itself already had to wait out Google's backoff (or
        // failed outright after exhausting it) — that's direct evidence
        // we're at the limit, so jump straight to the ceiling instead of
        // doubling gradually into more 429s.
        delayMs = maxDelayMs;
        return;
      }
      cleanStreak += 1;
      if (cleanStreak >= easeAfterCleanCount) {
        cleanStreak = 0;
        delayMs = Math.max(minDelayMs, Math.round(delayMs * 0.6));
      }
    },
  };
}

/**
 * Trips after `threshold` quota-pressure signals IN A ROW (a quota-tagged
 * failure, or a success that still had to wait out backend backoff). One
 * such signal is normal noise; several consecutive ones mean the account is
 * genuinely blocked right now, and continuing through the rest of the class
 * would just repeat the same failure at the same cost, one student at a time.
 */
function createQuotaCircuitBreaker(threshold = 3) {
  let streak = 0;
  const breaker = {
    tripped: false,
    record(isQuotaSignal) {
      if (!isQuotaSignal) {
        streak = 0;
        return breaker.tripped;
      }
      streak += 1;
      if (streak >= threshold) breaker.tripped = true;
      return breaker.tripped;
    },
  };
  return breaker;
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
  const pacer = createReturnPacer();
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

    const integrityGate = getMarkingIntegrityPublishGate(result);
    if (integrityGate?.level === "block") {
      failures.push({ submissionId, label, reason: integrityGate.message });
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
            googleUserId,
            existingFile,
            directUrl: student?.pdfDirectUrl,
            directExpiresAt: student?.pdfDirectExpiresAt,
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

      const { data: returnResult } = await api.post("/submission-files/return-marked", fd, {
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
        attachmentWarning: returnResult?.attachmentWarning || null,
        quotaBackoffMs: returnResult?.quotaBackoffMs || 0,
      };
    } catch (err) {
      console.error(`Return failed for ${label}:`, err);
      const quotaExhausted = await isQuotaExhaustedError(err);
      failures.push({
        submissionId,
        label,
        reason: (await getApiErrorMessage(err)) || err?.message || "Return failed",
        quotaExhausted,
      });
      return null;
    }
  };

  const outcomes = [];
  // Backend now fails a sustained quota block fast (~1 retry) instead of the
  // ~17 minutes/student it used to take grinding through 5 full retries —
  // but that alone still means N students × ~1 quota-shaped failure each.
  // If several IN A ROW show real quota pressure, the account is blocked for
  // more than a moment and burning through the rest of the class the exact
  // same losing way would still turn a bad minute into a bad hour. Stop the
  // whole run instead and say why, rather than silently working through
  // every remaining paper.
  const breaker = createQuotaCircuitBreaker();
  let stopReason = null;

  const feedBreaker = (isQuotaSignal) => {
    if (breaker.record(isQuotaSignal)) {
      stopReason =
        "Stopped Return All: Google Classroom kept rejecting requests for this account " +
        "(quota/rate limit) across several papers in a row. The remaining papers were not " +
        "attempted — try again in a few minutes.";
    }
  };

  for (const { submissionId, storedSubmissionId, student, bulk } of bulkQueue) {
    if (breaker.tripped) break;
    const outcome = await returnOne({
      submissionId,
      storedSubmissionId,
      student,
      result: bulk?.result,
      studentFile: bulk?.studentFile,
      source: "bulk",
      bulk,
    });
    if (outcome) {
      outcomes.push(outcome);
      pacer.recordOutcome({ backoffMs: outcome.quotaBackoffMs });
      feedBreaker(outcome.quotaBackoffMs > 0);
    } else {
      pacer.recordOutcome({ failed: true });
      feedBreaker(Boolean(failures[failures.length - 1]?.quotaExhausted));
    }
    if (breaker.tripped) break;
    await pacer.wait();
  }

  for (const { submissionId, storedSubmissionId, student, batch } of batchQueue) {
    if (breaker.tripped) break;
    const outcome = await returnOne({
      submissionId,
      storedSubmissionId,
      student,
      result: batch?.result,
      source: "batch",
      batch,
    });
    if (outcome) {
      outcomes.push(outcome);
      pacer.recordOutcome({ backoffMs: outcome.quotaBackoffMs });
      feedBreaker(outcome.quotaBackoffMs > 0);
    } else {
      pacer.recordOutcome({ failed: true });
      feedBreaker(Boolean(failures[failures.length - 1]?.quotaExhausted));
    }
    if (breaker.tripped) break;
    await pacer.wait();
  }

  return {
    successCount,
    failures,
    outcomes,
    total: bulkQueue.length + batchQueue.length,
    stoppedEarly: breaker.tripped,
    stopReason,
  };
}

export function countAttachmentWarnings(outcomes = []) {
  return (outcomes || []).filter((row) => row?.attachmentWarning).length;
}

export function emptyReturnAllMessage(savedResults = {}) {
  const rows = Object.values(savedResults || {});
  const withBlob = rows.filter((s) => s?.result).length;
  const marked = rows.filter((s) => s?.hasResult || s?.result).length;
  if (withBlob > 0) {
    return {
      type: "warn",
      text: "All graded papers were already returned. Re-mark or edit a student to return updated papers.",
    };
  }
  if (marked > 0) {
    return {
      type: "error",
      text: "Could not load the marked papers to return. Check your connection and try again.",
    };
  }
  return { type: "warn", text: "No graded papers to return" };
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
    savedResults = await hydrateSavedResultsForReturn(
      api,
      assignmentId,
      savedResults
    );
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
