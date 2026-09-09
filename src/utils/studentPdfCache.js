/**
 * Session cache for student PDFs fetched from Google Drive.
 *
 * The results modal rebuilds its annotated preview more than once per paper —
 * on open, again when the open-time auto-save confirms the normalised version,
 * and again after every Confirm Edits or box drag. Each rebuild used to
 * re-download the student's PDF through `GET /submission-files/pdf`, which goes
 * out to Drive every time. Reuse downloads for one minute, invalidate explicitly
 * after a return, and invalidate immediately when a caller supplies a new source
 * version. Generated PDFs separately hash the actual downloaded bytes.
 *
 * Kept deliberately small: these are multi-megabyte blobs, and only the paper on
 * screen and the couple before it are ever wanted again.
 */

import { assertPdfBlob } from "./markingFormData";

// Moving through a class commonly revisits more than four papers (and opening
// the same paper can trigger a normalized-preview rebuild). Retain a modest
// working set so those previews do not go back through Drive conversion.
const MAX_ENTRIES = 10;
const MAX_ATTEMPTS = 5;
// Drive/proxy interruptions during busy marking periods commonly last longer
// than a second. Keep retrying the one PDF with a useful backoff instead of
// surfacing an error (or making the user reopen the paper) immediately.
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000, 15_000];

/** key -> File */
const blobs = new Map();
/** key -> Promise<File>, so two previews starting at once share one download. */
const inflight = new Map();
const versions = new Map();
const fetchedAt = new Map();
const MAX_AGE_MS = 60_000;

function evictOldest() {
  while (blobs.size > MAX_ENTRIES) {
    const oldest = blobs.keys().next().value;
    blobs.delete(oldest);
    versions.delete(oldest);
    fetchedAt.delete(oldest);
  }
}

function cacheKey(assignmentId, submissionId) {
  return `${assignmentId}::${submissionId}`;
}

export function isRetryablePdfFetchError(err) {
  if (!err) return false;
  const status = err?.response?.status;
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (err?.code === "ECONNABORTED") return true;
  if (err?.code === "ERR_NETWORK") return true;
  // Axios surfaces dropped Drive/proxy connections as a bare "Network Error"
  // with no response body — common right after a safety-batch marks several
  // papers and the preview immediately re-fetches the same files.
  if (!err?.response && /network error/i.test(String(err?.message || ""))) {
    return true;
  }
  return false;
}

/**
 * Run `fn` up to `attempts` times, retrying only transient connection drops
 * (see isRetryablePdfFetchError) with a short backoff. Shared by every place
 * that pulls a submission PDF over HTTP, so a dropped connection to Drive or
 * to a partner's storage doesn't surface as a dead end for the teacher.
 */
export async function withPdfFetchRetry(fn, { attempts = MAX_ATTEMPTS } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryablePdfFetchError(err) || attempt === attempts) throw err;
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * The student's PDF as a File, from cache when we already have it.
 *
 * @param {object} api            axios instance
 * @param {object} opts
 * @param {string} opts.assignmentId
 * @param {string} opts.submissionId
 * @param {string} [opts.googleUserId]  stale Classroom submission-id recovery
 * @param {number} [opts.timeout]
 * @returns {Promise<File>}
 */
export async function fetchStudentPdf(
  api,
  { assignmentId, submissionId, googleUserId, sourceVersion = '', timeout = 30_000 }
) {
  const key = cacheKey(assignmentId, submissionId);
  if (versions.get(key) !== sourceVersion || Date.now() - (fetchedAt.get(key) || 0) > MAX_AGE_MS) {
    blobs.delete(key);
    // A new version must not join or be overwritten by an older request.
    if (versions.get(key) !== sourceVersion) inflight.delete(key);
    versions.set(key, sourceVersion);
  }

  const toFile = (blob) =>
    new File([blob], `${submissionId}.pdf`, { type: "application/pdf" });

  const cached = blobs.get(key);
  if (cached) {
    // Refresh recency — Map preserves insertion order, so re-inserting moves it
    // to the end and keeps the eviction above honest.
    blobs.delete(key);
    blobs.set(key, cached);
    return cached;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = withPdfFetchRetry(async () => {
    const res = await api.get("/submission-files/pdf", {
      params: {
        assignmentId,
        submissionId,
        ...(googleUserId ? { googleUserId } : {}),
      },
      responseType: "blob",
      timeout,
    });
    await assertPdfBlob(res.data, "Student submission");
    return toFile(res.data);
  });

  inflight.set(key, request);
  try {
    const blob = await request;
    if (inflight.get(key) === request) {
      blobs.set(key, blob);
      fetchedAt.set(key, Date.now());
      evictOldest();
    }
    return blob;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}

/**
 * Forget a paper's PDF. Call after anything that replaces the file on Drive
 * (returning a marked paper rewrites the attachment in place), so the next
 * preview does not annotate a stale download.
 */
export function invalidateStudentPdf(assignmentId, submissionId) {
  const key = cacheKey(assignmentId, submissionId);
  blobs.delete(key);
  inflight.delete(key);
  versions.delete(key);
  fetchedAt.delete(key);
}

/** Drop everything — used when switching assignment. */
export function clearStudentPdfCache() {
  blobs.clear();
  inflight.clear();
  versions.clear();
  fetchedAt.clear();
}
