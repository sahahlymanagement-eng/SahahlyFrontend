/**
 * Publish All — send every marked-but-unpublished submission of one grading
 * partner assignment back to the partner.
 *
 * Two implementations live here, selected by `base`:
 *
 *  - Registry providers (mariamgabalawy / drpeter, base "/grading/:slug"):
 *    the work now runs server-side (POST .../publish-all starts a background
 *    run — see SahahlyBackend/src/services/gradingPublishRun.js, which
 *    renders with a ported, hand-synced copy of this file's own annotatePdf
 *    call). This module just starts that job and polls it. Because progress
 *    lives server-side, navigating away and back (or a full reload) resumes
 *    polling — the run was never tied to this tab.
 *
 *  - LoginCSS (base "/external-grading"): still the original browser-driven
 *    loop below (render here, upload, repeat) — LoginCSS keeps its own
 *    separate /api/external-grading integration untouched for now.
 *
 * Both are exposed under the one `runGradingPublishAll` name so neither
 * caller (GradingProviderPage.jsx / ManagerLoginCss.jsx) needs to know which
 * implementation it's getting.
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

// How many submissions to have in flight at once (browser-loop path only).
// Each one is a real chain of work (fetch the draft, render the annotated
// PDF, upload it, wait on R2 + the partner's own API on the far end), and
// running them one-at-a-time meant a 100-submission assignment paid every one
// of those round trips serially. Most of that chain is waiting on the
// network, not the browser's CPU, so a handful running together overlaps the
// waiting instead of the rendering.
const PUBLISH_CONCURRENCY = 3;

/**
 * Original browser-driven Publish All (LoginCSS only — see module header).
 * Renders every annotated PDF in this tab and uploads it; the caller must
 * keep the tab open for the whole run.
 */
async function runGradingPublishAllInBrowser({
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

const POLL_MS = 2000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server-backgrounded Publish All (registry providers — see module header).
 */
async function runGradingPublishAllOnServer({
  api,
  base,
  assignmentId = null,
  queue = [],
  onProgress,
  shouldStop,
}) {
  const submissionIds = queue.map((row) => row.submissionId);

  const { data: startResult } = await api.post(
    `${base}/publish-all`,
    { assignmentId, submissionIds },
    { timeout: 30000 }
  );

  if (startResult?.alreadyRunning) {
    throw new Error(
      "A Publish All run is already in progress for this assignment — wait for it to finish."
    );
  }
  if (!startResult?.started) {
    return { successCount: 0, failures: [], publishedIds: [], stopped: false };
  }

  let stopSent = false;

  for (;;) {
    await wait(POLL_MS);

    const { data: status } = await api.get(`${base}/publish-all/status`, {
      params: assignmentId != null ? { assignmentId } : {},
      timeout: 30000,
    });

    onProgress?.({
      done: status.done ?? 0,
      total: status.total ?? queue.length,
      current: status.current || null,
    });

    if (!stopSent && shouldStop?.()) {
      stopSent = true;
      await api
        .post(
          `${base}/publish-all/stop`,
          {},
          { params: assignmentId != null ? { assignmentId } : {}, timeout: 15000 }
        )
        .catch(() => {});
    }

    if (!status.running) {
      return {
        successCount: status.successCount ?? 0,
        failures: status.failures || [],
        publishedIds: status.publishedIds || [],
        stopped: Boolean(status.stopped),
      };
    }
  }
}

/**
 * Publish every submission in `queue`. Dispatches to the server-backgrounded
 * job for registry providers (base starts with "/grading/") and to the
 * original browser loop for LoginCSS (base "/external-grading") — see the
 * module header for why the two still differ.
 *
 * @returns {Promise<{successCount:number, failures:Array, publishedIds:Array, stopped:boolean}>}
 */
export async function runGradingPublishAll(opts) {
  if (!opts.queue?.length) {
    return { successCount: 0, failures: [], publishedIds: [], stopped: false };
  }
  if (opts.base?.startsWith("/grading/")) {
    return runGradingPublishAllOnServer(opts);
  }
  return runGradingPublishAllInBrowser(opts);
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
