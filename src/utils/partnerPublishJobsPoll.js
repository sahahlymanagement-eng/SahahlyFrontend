/**
 * Polling helper for GET /api/partner-publish-jobs — the background queue
 * behind "Publish to IGSpaces" and "Publish All" (see api/partnerReports.js's
 * getPartnerPublishJobs and PartnerPublishJobQueue.jsx for the full-tab
 * monitor). Mirrors utils/returnAllExecution.js's pollReturnJobsUntilSettled
 * for classroom returns.
 */
import { getPartnerPublishJobs } from "../api/partnerReports";

/**
 * Poll a scoped view of the queue until nothing is queued/running in it (or
 * `maxPolls` is hit), calling `onUpdate` with the raw response after every
 * poll so the caller can render live progress. Safe to abandon on unmount —
 * it's just polling; the cron worker finishes regardless.
 *
 * @param {object} params            scope filters passed straight to
 *   getPartnerPublishJobs (provider, kind, assignmentId, year, month)
 * @param {(data: object) => void} [onUpdate]
 * @param {number} [pollIntervalMs]
 * @param {number} [maxPolls]
 * @returns {Promise<object|null>}   the last poll's data once settled, or
 *   null if maxPolls was reached first (still worth a final loadAll() —
 *   whatever's left just wasn't done in time to watch here)
 */
export async function pollPartnerPublishJobsUntilSettled({
  params,
  onUpdate,
  pollIntervalMs = 5000,
  maxPolls = 120,
}) {
  for (let i = 0; i < maxPolls; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    let data;
    try {
      data = await getPartnerPublishJobs(params);
    } catch (err) {
      console.error("Failed to poll partner publish jobs:", err);
      continue;
    }
    onUpdate?.(data);
    const inFlight = (data.running?.length || 0) + (data.queued?.length || 0);
    if (inFlight === 0) return data;
  }
  return null;
}

/**
 * Reshape a scoped GET /partner-publish-jobs response into the
 * `{sent, failed, inProgress, results}` shape PartnerReportsWorkspace's
 * publishResultsPanel already renders (it previously came straight off the
 * old synchronous publish response) — so the panel needs no structural
 * change, just a live-updating source.
 */
export function summarizePublishJobs(data) {
  const running = data?.running || [];
  const queued = data?.queued || [];
  const history = data?.history || [];
  const sentItems = history.filter((i) => i.status === "done");
  const failedItems = history.filter((i) => i.status === "failed");
  const inProgressItems = [...running, ...queued];

  return {
    sent: sentItems.length,
    failed: failedItems.length,
    inProgress: inProgressItems.length,
    results: [
      ...failedItems.map((i) => ({
        studentKey: i.studentKey,
        studentName: i.studentName,
        status: "failed",
        reason: i.error || "Publish failed",
      })),
      ...inProgressItems.map((i) => ({
        studentKey: i.studentKey,
        studentName: i.studentName,
        status: "publishing",
        reason: "Still publishing…",
      })),
    ],
  };
}
