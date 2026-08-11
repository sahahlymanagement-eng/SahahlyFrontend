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
 * Deliberately sequential: each item downloads a submission PDF, renders it and
 * uploads it again, and the partner's API is on the far end of every one. A
 * failure never stops the run — it is collected and reported at the end, the
 * same contract as Return All in the classroom viewer.
 *
 * Shared by the LoginCSS tab and every registry provider tab; the only
 * difference is `base` (/external-grading vs /grading/:slug).
 */

import { annotatePdf } from "./annotatePdf";
import {
  getMarkingResultSummary,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  resolveTotalMarksFromResult,
  resolveDisplayMaxTotal,
} from "./markingFormData";

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

/**
 * Publish every submission in `queue`.
 *
 * @param {object}   opts
 * @param {object}   opts.api
 * @param {string}   opts.base
 * @param {Array}    opts.queue            rows from fetchPublishQueue
 * @param {number|null} opts.assignmentMaxPoints  configured maxGrade / partner total
 * @param {function} opts.getStudentFile   (submissionId) => Promise<File>
 * @param {function} [opts.releaseStudentFile] drop a published submission's cached
 *        PDFs — without it a long run keeps every downloaded PDF in memory
 * @param {function} [opts.onProgress]     ({ done, total, current }) per item
 * @param {function} [opts.shouldStop]     () => boolean, checked between items
 * @returns {Promise<{successCount:number, failures:Array, publishedIds:Array, stopped:boolean}>}
 */
export async function runGradingPublishAll({
  api,
  base,
  queue = [],
  assignmentMaxPoints = null,
  getStudentFile,
  releaseStudentFile,
  onProgress,
  shouldStop,
}) {
  const failures = [];
  const publishedIds = [];
  let successCount = 0;
  let stopped = false;

  for (let i = 0; i < queue.length; i += 1) {
    const row = queue[i];
    const submissionId = row.submissionId;
    const label = row.name || `Submission #${submissionId}`;

    if (shouldStop?.()) {
      stopped = true;
      break;
    }

    onProgress?.({ done: i, total: queue.length, current: label, submissionId });

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
    }

    onProgress?.({ done: i + 1, total: queue.length, current: null, submissionId });
  }

  return { successCount, failures, publishedIds, stopped };
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
