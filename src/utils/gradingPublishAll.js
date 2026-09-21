/**
 * Publish All — send every marked-but-unpublished submission of one grading
 * partner assignment back to the partner, one after another.
 *
 * Publishing a single submission has always been a browser-side job: the PDF
 * the partner receives is rendered here by annotatePdf from the marking result,
 * and the backend's /upload endpoint takes that finished file. So this is the
 * one-at-a-time flow in a loop rather than anything new — same annotation, same
 * grade resolution, same endpoint — with the queue coming from the backend
 * (GET /submissions/publishable) so it covers the WHOLE assignment and not just
 * the page of rows currently on screen.
 *
 * Shared by the LoginCSS tab and every registry provider tab; the only
 * difference is `base` (/external-grading vs /grading/:slug).
 *
 * Two variants, same per-item rendering:
 *  - runGradingPublishAll (below): posts to `${base}/upload`, which uploads
 *    AND calls the partner's postMark API AND updates the local record, all
 *    synchronously per item. Still used by GradingProviderPage.jsx for
 *    LoginCSS's separate `/external-grading` route, which has no queue.
 *  - queueGradingPublishAll (further down): posts to `${base}/upload/stage`
 *    instead — uploads and enqueues a background job
 *    (cron/partnerPublishJobWorkerCron.js), without waiting on the partner's
 *    API — used for every registry provider (mariamgabalawy, drpeter, …) so a
 *    large run survives closing the tab, the marks-publishing analog of
 *    classroom's Return All rework.
 */

import { annotatePdf } from "./annotatePdf";
import {
  getMarkingResultSummary,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  resolveTotalMarksFromResult,
  resolveDisplayMaxTotal,
} from "./markingFormData";
import { getMarkingIntegrityPublishGate } from "./markingIntegrityPublish";
import { loadPartnerLogoBytes } from "./partnerReportLogo";

/**
 * The publish queue for an assignment: [{ submissionId, name, submittedAt }].
 *
 * @param {object} api        axios instance
 * @param {string} base       "/external-grading" or "/grading/<slug>"
 * @param {number|null} assignmentId  null → the "Unassigned" group
 */
export async function fetchPublishQueue(api, base, assignmentId) {
  const { data } = await api.get(`${base}/submissions/publishable`, {
    params: assignmentId != null ? { assignmentId } : {},
    timeout: 60000,
  });
  return data?.submissions || [];
}

/** Marks to send for a saved result — the stored total, else the sum of the questions. */
function resolveQueuedMarks(result, questions) {
  const stored = resolveTotalMarksFromResult(result);
  if (stored !== null && stored !== undefined) return Number(stored) || 0;
  return questions.reduce((sum, q) => sum + (Number(q.marksAwarded) || 0), 0);
}

// How many submissions to have in flight at once. Each one is a real chain
// of work (fetch the draft, render the annotated PDF, upload it, wait on R2 +
// the partner's own API on the far end), and running them one-at-a-time meant
// a 100-submission assignment paid every one of those round trips serially.
// Most of that chain is waiting on the network, not the browser's CPU, so a
// handful running together overlaps the waiting instead of the rendering.
// Matches classroom Return All's staging concurrency (returnAllExecution.js)
// and the partner-publish cron's own finish-side concurrency — both already
// proven safe at this level.
const PUBLISH_CONCURRENCY = 5;

/**
 * Publish every submission in `queue`.
 *
 * @param {object}   opts
 * @param {object}   opts.api
 * @param {string}   opts.base
 * @param {Array}    opts.queue            rows from fetchPublishQueue
 * @param {number|null} opts.assignmentMaxPoints  configured maxGrade / partner total
 * @param {string|null} [opts.partnerSlug] "logincss" | "mariamgabalawy" | "drpeter" —
 *        resolves the partner's report logo, drawn on the summary page the same
 *        way a classroom teacher's logo is. Omit to draw Sahahly's logo alone.
 * @param {function} opts.getStudentFile   (submissionId) => Promise<File>
 * @param {function} [opts.releaseStudentFile] drop a published submission's cached
 *        PDFs — without it a long run keeps every downloaded PDF in memory
 * @param {function} [opts.onProgress]     ({ done, total, current }) per item —
 *        `current` is a " · "-free, comma-joined label of whatever is in
 *        flight right now (there may be more than one)
 * @param {function} [opts.shouldStop]     () => boolean, checked before each
 *        item starts — items already in flight are left to finish
 * @returns {Promise<{successCount:number, failures:Array, publishedIds:Array, stopped:boolean}>}
 */
export async function runGradingPublishAll({
  api,
  base,
  queue = [],
  assignmentMaxPoints = null,
  partnerSlug = null,
  getStudentFile,
  releaseStudentFile,
  onProgress,
  shouldStop,
}) {
  const failures = [];
  const publishedIds = [];
  let successCount = 0;
  let stopped = false;
  let nextIndex = 0;
  let doneCount = 0;
  const inFlight = new Map();
  // Same logo for every item in the run — fetched once, not per submission.
  const teacherLogoBytes = await loadPartnerLogoBytes(api, partnerSlug);

  const reportProgress = () => {
    onProgress?.({
      done: doneCount,
      total: queue.length,
      current: [...inFlight.values()].join(", ") || null,
    });
  };

  async function publishOne(row) {
    const submissionId = row.submissionId;
    const label = row.name || `Submission #${submissionId}`;
    inFlight.set(submissionId, label);
    reportProgress();

    try {
      // The draft is the saved marking result — the same content the results
      // modal republishes from. Fetched per item rather than up front so a
      // 100-submission run never holds 100 marking-result blobs at once.
      const { data } = await api.get(`${base}/submissions/${submissionId}/draft`, {
        timeout: 60000,
      });
      const result = data?.draftResult;
      if (!result) {
        throw new Error("No saved marking result to publish");
      }

      const integrityGate = getMarkingIntegrityPublishGate(result);
      if (integrityGate) {
        throw new Error(
          integrityGate.level === "block"
            ? integrityGate.message
            : `Skipped — ${integrityGate.title}. Open the paper, re-mark or finish questions, then publish singly.`
        );
      }

      const questions = result.questions || [];
      const totalMarks = resolveQueuedMarks(result, questions);
      const maxTotalMarks = resolveDisplayMaxTotal({ assignmentMaxPoints, result });
      const summary = getMarkingResultSummary(result, {});

      const studentFile = await getStudentFile(submissionId);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions,
        maxTotalMarks,
        summary,
        outOfScopeNotes: getOutOfScopeNotes(result),
        teacherAnnotations: getTeacherAnnotations(result),
        criteriaGrade: result.criteriaGrade,
        markingMode: result.markingMode || "normal",
        teacherLogoBytes,
      });

      const fd = new FormData();
      fd.append(
        "annotatedPdf",
        new Blob([pdfBytes], { type: "application/pdf" }),
        `feedback_${submissionId}.pdf`
      );
      fd.append("submissionId", submissionId);
      fd.append("grade", totalMarks);
      if (summary) fd.append("comments", summary);
      if (row.submittedAt) fd.append("submissionDate", row.submittedAt);

      // Publishing clears the draft server-side, so there is no draft cleanup
      // to do here — a re-run of Publish All simply won't see this row again.
      await api.post(`${base}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });

      successCount += 1;
      publishedIds.push({ submissionId, totalMarks });
    } catch (err) {
      console.error(`Publish failed for ${label}:`, err);
      failures.push({
        submissionId,
        label,
        reason:
          err?.response?.data?.message || err?.message || "Publish failed",
      });
    } finally {
      releaseStudentFile?.(submissionId);
      inFlight.delete(submissionId);
      doneCount += 1;
      reportProgress();
    }
  }

  async function worker() {
    for (;;) {
      if (shouldStop?.()) {
        stopped = true;
        return;
      }
      const i = nextIndex;
      if (i >= queue.length) return;
      nextIndex = i + 1;
      await publishOne(queue[i]);
    }
  }

  const workerCount = Math.max(1, Math.min(PUBLISH_CONCURRENCY, queue.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return { successCount, failures, publishedIds, stopped };
}

/**
 * Queued counterpart of runGradingPublishAll above — same per-item work
 * (fetch draft, integrity gate, resolve grade, render the annotated PDF
 * client-side, since that rendering step is unavoidably browser-side, same
 * as classroom's stage step), but POSTs to `${base}/upload/stage` instead of
 * `${base}/upload`: that endpoint only uploads the PDF to R2 and enqueues a
 * PartnerPublishJobItem (kind: 'marking_publish') — it does NOT call the
 * partner's postMark API, so this resolves as soon as staging is done rather
 * than waiting on the partner's API for every item. cron/partnerPublishJobWorkerCron.js
 * does the actual publish in the background — this is what lets a large
 * "Publish All" run survive closing the tab, the marks-publishing analog of
 * classroom's Return All rework.
 *
 * @returns {Promise<{queuedCount:number, alreadyInFlightCount:number, failures:Array, stopped:boolean}>}
 */
export async function queueGradingPublishAll({
  api,
  base,
  queue = [],
  assignmentMaxPoints = null,
  partnerSlug = null,
  getStudentFile,
  releaseStudentFile,
  onProgress,
  shouldStop,
}) {
  const failures = [];
  let queuedCount = 0;
  let alreadyInFlightCount = 0;
  let stopped = false;
  let nextIndex = 0;
  let doneCount = 0;
  const inFlight = new Map();
  const teacherLogoBytes = await loadPartnerLogoBytes(api, partnerSlug);

  const reportProgress = () => {
    onProgress?.({
      done: doneCount,
      total: queue.length,
      current: [...inFlight.values()].join(", ") || null,
    });
  };

  async function stageOne(row) {
    const submissionId = row.submissionId;
    const label = row.name || `Submission #${submissionId}`;
    inFlight.set(submissionId, label);
    reportProgress();

    try {
      const { data } = await api.get(`${base}/submissions/${submissionId}/draft`, {
        timeout: 60000,
      });
      const result = data?.draftResult;
      if (!result) {
        throw new Error("No saved marking result to publish");
      }

      const integrityGate = getMarkingIntegrityPublishGate(result);
      if (integrityGate) {
        throw new Error(
          integrityGate.level === "block"
            ? integrityGate.message
            : `Skipped — ${integrityGate.title}. Open the paper, re-mark or finish questions, then publish singly.`
        );
      }

      const questions = result.questions || [];
      const totalMarks = resolveQueuedMarks(result, questions);
      const maxTotalMarks = resolveDisplayMaxTotal({ assignmentMaxPoints, result });
      const summary = getMarkingResultSummary(result, {});

      const studentFile = await getStudentFile(submissionId);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions,
        maxTotalMarks,
        summary,
        outOfScopeNotes: getOutOfScopeNotes(result),
        teacherAnnotations: getTeacherAnnotations(result),
        criteriaGrade: result.criteriaGrade,
        markingMode: result.markingMode || "normal",
        teacherLogoBytes,
      });

      const fd = new FormData();
      fd.append(
        "annotatedPdf",
        new Blob([pdfBytes], { type: "application/pdf" }),
        `feedback_${submissionId}.pdf`
      );
      fd.append("submissionId", submissionId);
      fd.append("grade", totalMarks);
      if (summary) fd.append("comments", summary);
      if (row.submittedAt) fd.append("submissionDate", row.submittedAt);
      if (row.name) fd.append("studentName", row.name);

      const { data: stageResult } = await api.post(`${base}/upload/stage`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });

      if (stageResult?.queued) queuedCount += 1;
      else alreadyInFlightCount += 1;
    } catch (err) {
      console.error(`Publish (stage) failed for ${label}:`, err);
      failures.push({
        submissionId,
        label,
        reason:
          err?.response?.data?.message || err?.message || "Publish failed",
      });
    } finally {
      releaseStudentFile?.(submissionId);
      inFlight.delete(submissionId);
      doneCount += 1;
      reportProgress();
    }
  }

  async function worker() {
    for (;;) {
      if (shouldStop?.()) {
        stopped = true;
        return;
      }
      const i = nextIndex;
      if (i >= queue.length) return;
      nextIndex = i + 1;
      await stageOne(queue[i]);
    }
  }

  const workerCount = Math.max(1, Math.min(PUBLISH_CONCURRENCY, queue.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return { queuedCount, alreadyInFlightCount, failures, stopped };
}

/** Human-readable outcome for the toast at the end of a run. */
export function formatPublishAllMessage(successCount, failures = [], stopped = false) {
  const head = `${stopped ? "Stopped — published" : "Published"} ${successCount} submission${
    successCount === 1 ? "" : "s"
  }`;
  if (!failures.length) return head;
  const names = failures
    .slice(0, 4)
    .map((f) => f.label || f.submissionId || "Submission")
    .join(", ");
  const extra = failures.length > 4 ? ` +${failures.length - 4} more` : "";
  return `${head}. Failed: ${names}${extra}. ${failures[0]?.reason || ""}`.trim();
}

/** Human-readable outcome for the toast right after queueGradingPublishAll finishes staging. */
export function formatQueuePublishAllMessage(queuedCount, failures = [], stopped = false, alreadyInFlightCount = 0) {
  const head = `${stopped ? "Stopped — queued" : "Queued"} ${queuedCount} submission${
    queuedCount === 1 ? "" : "s"
  } for publish`;
  const inFlightNote = alreadyInFlightCount ? ` (${alreadyInFlightCount} already in progress)` : "";
  if (!failures.length) return `${head}${inFlightNote}`;
  const names = failures
    .slice(0, 4)
    .map((f) => f.label || f.submissionId || "Submission")
    .join(", ");
  const extra = failures.length > 4 ? ` +${failures.length - 4} more` : "";
  return `${head}${inFlightNote}. Failed: ${names}${extra}. ${failures[0]?.reason || ""}`.trim();
}
