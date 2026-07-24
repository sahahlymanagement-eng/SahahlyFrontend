/**
 * Marking automation API — thin wrappers over the shared axios instance.
 *
 * `api`'s baseURL already ends in `/api`, so every path here is relative to
 * that (`/automation/...`), and the request interceptor attaches the bearer
 * token — the backend reads the role off the JWT (manager / assistant /
 * director / admin), so there is no extra header to hand-roll.
 *
 * The trigger is fire-and-forget: POST /run validates, claims the run and
 * returns 202 immediately, then the pipeline continues server-side. Progress is
 * read back by polling /status, which is also how the tab rehydrates after the
 * user navigates away and comes back.
 *
 * Rejections arrive as 4xx carrying a machine-readable reason as well as prose;
 * `runReason` pulls the code out so the UI can explain it inline (and offer
 * Force where that is the fix) instead of dumping a bare toast.
 */
import api from "./api";

const BASE = "/automation";

/**
 * Launch the pipeline. Resolves `{ runId, selectionMode, scopedCount }`.
 *
 * An empty `submissionIds` means "every eligible submission" — the backend's
 * own default — so a caller that wants the whole assignment never has to
 * enumerate the roster and send it back.
 */
export const triggerRun = (
  assignmentId,
  { submissionIds = [], force = false, dryRun = false, remark = false } = {}
) =>
  api
    .post(`${BASE}/run/${assignmentId}`, { submissionIds, force, dryRun, remark })
    .then((r) => r.data);

/**
 * Resume a halted or failed run from the `resumeStep` the backend recorded —
 * the override for a mark-scheme halt, and the retry for a step that threw.
 * Resolves `{ runId, resumedFrom }`; the server already knows where to pick up.
 *
 * `remark` is a per-action choice, not inherited from the original run: a plain
 * Continue stays non-destructive whatever the run was started with.
 */
export const continueRun = (assignmentId, { remark = false } = {}) =>
  api.post(`${BASE}/continue/${assignmentId}`, { remark }).then((r) => r.data);

/**
 * The run record for an assignment, or `null` when nothing has ever run for it.
 * A 404 is that "nothing yet" case rather than a failure; every other error
 * propagates so the caller can decide whether to surface it.
 */
export const getRunStatus = (assignmentId) =>
  api
    .get(`${BASE}/status/${assignmentId}`)
    .then((r) => r.data?.run ?? (r.data?.status ? r.data : null))
    .catch((err) => {
      if (err?.response?.status === 404) return null;
      throw err;
    });

/** @param {{ classroomId?: string, status?: string, limit?: number }} [params] */
export const listRuns = (params) =>
  api
    .get(`${BASE}/runs`, { params })
    .then((r) => r.data?.runs ?? r.data?.data ?? []);

/** Prefer the backend's message (validation failures return 400 `{ message }`). */
export const autoErr = (err, fallback) => err?.response?.data?.message || fallback;

/** Rejection code — `no_mark_scheme`, `due_not_passed`, `already_active`, … */
export const runReason = (err) => {
  const data = err?.response?.data;
  return data?.reason || data?.error || data?.code || null;
};
