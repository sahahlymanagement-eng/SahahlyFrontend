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

/**
 * Per-submission background-return-job status for an assignment — the
 * actual Classroom attach/grade/return now happens later, in the
 * cron/returnJobWorkerCron.js worker, not synchronously from Return All. Used
 * both to gate re-staging a paper that already has a queued/running job
 * (buildReturnAllQueue) and to poll for completion/failures while a viewer
 * page is left open.
 * @returns {Promise<{items: Record<string, object>, counts: Record<string, number>}>}
 */
export async function fetchReturnJobsSummary(api, assignmentId) {
  try {
    const { data } = await api.get("/submission-files/return-jobs/summary", {
      params: { assignmentId },
    });
    return { items: data?.items || {}, counts: data?.counts || {} };
  } catch (err) {
    console.error("Failed to load return job summary:", err);
    return { items: {}, counts: {} };
  }
}

/**
 * Poll GET /return-jobs/summary until every queued item in `items` reaches
 * done/failed (or `maxPolls` is hit) — this is how a viewer page that stays
 * open finds out the actual Classroom result, since it no longer happens
 * synchronously in the Return All call. Safe to let this run and navigate
 * away: it's just polling, nothing breaks if the component unmounts and the
 * caller stops awaiting it, and the background worker finishes regardless.
 *
 * @param {object} params
 * @param {Array<{submissionId: string, storedSubmissionId?: string, source?: string, bulk?: object, batch?: object}>} params.items
 * @param {(item: object, entry: object) => void} params.onDone - called once per item when its job reports "done"
 * @param {(item: object, entry: object) => void} params.onFailed - called once per item when its job reports "failed"
 */
export async function pollReturnJobsUntilSettled({
  api,
  assignmentId,
  items = [],
  onDone,
  onFailed,
  pollIntervalMs = 5000,
  maxPolls = 120,
}) {
  const pending = new Map(
    items.map((item) => [String(item.storedSubmissionId || item.submissionId), item])
  );

  for (let i = 0; i < maxPolls && pending.size > 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const { items: statusMap } = await fetchReturnJobsSummary(api, assignmentId);

    for (const [key, item] of pending) {
      const entry = statusMap[item.submissionId] || statusMap[key];
      if (!entry) continue; // not picked up yet — keep waiting

      if (entry.status === "done") {
        pending.delete(key);
        onDone?.(item, entry);
      } else if (entry.status === "failed") {
        pending.delete(key);
        onFailed?.(item, entry);
      }
      // "queued"/"running" — keep polling
    }
  }
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

/** True when /return-marked(/stage)'s error body says this classroom is a permanent, known-blocked case (not created by Sahahly). */
export async function isClassroomBlockedError(err) {
  const data = err?.response?.data;
  if (data?.classroomBlocked === true) return true;
  if (!(data instanceof Blob)) return false;
  try {
    return JSON.parse(await data.text())?.classroomBlocked === true;
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
 * Return All now only STAGES each paper here (uploads/rewrites the marked
 * PDF on Drive) — the actual Classroom modifyAttachments/patch/return calls,
 * the ones subject to Classroom's tight per-user quota, run later in the
 * background (cron/returnJobWorkerCron.js on the backend), independent of
 * this tab. That's what makes Return All survive a refresh/tab-close now.
 * Drive's own quota is far more generous, but staging is still real network
 * I/O per paper, so a light adaptive pace remains: start fast, back off on
 * an outright failure, ease back down after a run of clean stages.
 */
function createReturnPacer({ minDelayMs = 300, maxDelayMs = 5000, easeAfterCleanCount = 3 } = {}) {
  let delayMs = minDelayMs;
  let cleanStreak = 0;

  return {
    wait: () => new Promise((resolve) => setTimeout(resolve, delayMs)),
    recordOutcome({ failed = false } = {}) {
      if (failed) {
        cleanStreak = 0;
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
  let queuedCount = 0;

  // returnOne reports its own outcome rather than pushing to failures/queued
  // directly — with several workers in flight at once (see CONCURRENCY below),
  // that keeps each worker's bookkeeping self-contained instead of relying on
  // "the last thing pushed to a shared array was mine", which is only true
  // because of a JS microtask-ordering subtlety that's easy to break later.
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
      return { ok: false, submissionId, label, reason: "Missing marking data" };
    }

    const integrityGate = getMarkingIntegrityPublishGate(result);
    if (integrityGate?.level === "block") {
      return { ok: false, submissionId, label, reason: integrityGate.message };
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

      const { data: stageResult } = await api.post("/submission-files/return-marked/stage", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000,
      });

      // Staging rewrites/uploads the marked PDF on Drive, so the cached
      // download is no longer necessarily what /pdf would hand back.
      invalidateStudentPdf(assignmentId, storedSubmissionId || submissionId);

      return {
        ok: true,
        submissionId: liveSubmissionId,
        // The key the caller's local state is under — NOT the live id, or a
        // paper whose submission moved never clears its "not returned" flag.
        storedSubmissionId: storedSubmissionId || submissionId,
        label,
        source,
        bulk,
        batch,
        itemId: stageResult?.itemId || null,
        queuedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`Stage failed for ${label}:`, err);
      return {
        ok: false,
        submissionId,
        label,
        reason: (await getApiErrorMessage(err)) || err?.message || "Failed to queue return",
        classroomBlocked: await isClassroomBlockedError(err),
      };
    }
  };

  const queued = [];
  // Set the moment any concurrent worker discovers this classroom's
  // coursework wasn't created by Sahahly — a permanent, assignment-wide
  // condition, not a per-student problem. Every worker checks this and stops
  // claiming new items, so the run fails fast on ~CONCURRENCY students
  // instead of rediscovering the same wall on all 30.
  let classroomBlockedReason = null;

  // A strictly one-at-a-time loop meant total wall time was N students ×
  // (per-student work + pace), even though each student's fetch/annotate
  // (client CPU) and network round trip don't actually depend on any other
  // student's. A few workers pulling from one shared queue lets that work
  // genuinely overlap. The pacer above is shared across every worker (a
  // plain closure — safe with no locking, since JS never runs two of these
  // workers' synchronous steps at once).
  const CONCURRENCY = 3;
  const workItems = [
    ...bulkQueue.map(({ submissionId, storedSubmissionId, student, bulk }) => ({
      submissionId,
      storedSubmissionId,
      student,
      result: bulk?.result,
      studentFile: bulk?.studentFile,
      source: "bulk",
      bulk,
    })),
    ...batchQueue.map(({ submissionId, storedSubmissionId, student, batch }) => ({
      submissionId,
      storedSubmissionId,
      student,
      result: batch?.result,
      source: "batch",
      batch,
    })),
  ];

  let cursor = 0;
  const nextItem = () => (cursor < workItems.length ? workItems[cursor++] : null);

  const worker = async () => {
    for (;;) {
      if (classroomBlockedReason) return;
      const item = nextItem();
      if (!item) return;

      const result = await returnOne(item);
      if (result.ok) {
        queuedCount += 1;
        queued.push(result);
        pacer.recordOutcome({ failed: false });
      } else {
        failures.push({
          submissionId: result.submissionId,
          label: result.label,
          reason: result.reason,
        });
        if (result.classroomBlocked && !classroomBlockedReason) {
          classroomBlockedReason = result.reason;
        }
        pacer.recordOutcome({ failed: true });
      }

      if (classroomBlockedReason) return;
      await pacer.wait();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, () => worker())
  );

  return {
    queuedCount,
    failures,
    queued,
    total: workItems.length,
    classroomBlocked: Boolean(classroomBlockedReason),
    classroomBlockedReason,
  };
}

/**
 * Count entries carrying an attachmentWarning. Feed it the values of a
 * `GET /submission-files/return-jobs/summary` response's `items` map now
 * that attach results surface later from the background worker, not
 * synchronously from Return All itself.
 */
export function countAttachmentWarnings(items = []) {
  return (items || []).filter((row) => row?.attachmentWarning).length;
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

/**
 * Human-readable summary right after Return All's staging pass — "queued",
 * not "returned": the actual Classroom return happens later in the
 * background, and these failures are staging failures (couldn't even get to
 * Drive), not final ones.
 */
export function formatReturnFailuresMessage(queuedCount, failures = []) {
  if (!failures.length) {
    return `Queued ${queuedCount} graded paper${queuedCount === 1 ? "" : "s"} for return`;
  }
  const names = failures
    .slice(0, 4)
    .map((f) => f.label || f.submissionId || "Student")
    .join(", ");
  const extra = failures.length > 4 ? ` +${failures.length - 4} more` : "";
  return `Queued ${queuedCount} for return. Failed to queue: ${names}${extra}. ${failures[0]?.reason || ""}`.trim();
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
  let jobStatusBySubmissionId = {};

  try {
    [allStudents, savedResults, jobStatusBySubmissionId] = await Promise.all([
      fetchAllPaginated(api, studentsMarkingUrl, {}, "students"),
      fetchSavedResultsMap(api, assignmentId),
      fetchReturnJobsSummary(api, assignmentId).then((s) => s.items),
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
    jobStatusBySubmissionId,
    queue: buildReturnAllQueue({
      bulkProgress,
      batchJob,
      savedResults,
      singleProgress: mergedSingle,
      allStudents,
      jobStatusBySubmissionId,
    }),
  };
}

export { buildReturnAllQueue };
