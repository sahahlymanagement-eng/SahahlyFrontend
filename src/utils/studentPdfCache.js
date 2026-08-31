/**
 * Session cache for student PDFs fetched from Google Drive.
 *
 * The results modal rebuilds its annotated preview more than once per paper —
 * on open, again when the open-time auto-save confirms the normalised version,
 * and again after every Confirm Edits or box drag. Each rebuild used to
 * re-download the student's PDF through `GET /submission-files/pdf`, which goes
 * out to Drive every time (no cache headers, nothing memoised). The file itself
 * cannot change while the modal is open, so one download per paper is enough.
 *
 * Kept deliberately small: these are multi-megabyte blobs, and only the paper on
 * screen and the couple before it are ever wanted again.
 */

import { assertPdfBlob } from "./markingFormData";

const MAX_ENTRIES = 4;
const MAX_ATTEMPTS = 3;

/** key -> Blob */
const blobs = new Map();
/** key -> Promise<Blob>, so two previews starting at once share one download. */
const inflight = new Map();

function evictOldest() {
  while (blobs.size > MAX_ENTRIES) {
    const oldest = blobs.keys().next().value;
    blobs.delete(oldest);
  }
}

function cacheKey(assignmentId, submissionId) {
  return `${assignmentId}::${submissionId}`;
}

export function isRetryablePdfFetchError(err) {
  if (!err) return false;
  const status = err?.response?.status;
  if (status === 502 || status === 503 || status === 504) return true;
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
      await new Promise((r) => setTimeout(r, 400 * attempt));
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
  { assignmentId, submissionId, googleUserId, timeout = 90_000 }
) {
  const key = cacheKey(assignmentId, submissionId);

  const toFile = (blob) =>
    new File([blob], `${submissionId}.pdf`, { type: "application/pdf" });

  const cached = blobs.get(key);
  if (cached) {
    // Refresh recency — Map preserves insertion order, so re-inserting moves it
    // to the end and keeps the eviction above honest.
    blobs.delete(key);
    blobs.set(key, cached);
    return toFile(cached);
  }

  const pending = inflight.get(key);
  if (pending) return toFile(await pending);

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
    return res.data;
  });

  inflight.set(key, request);
  try {
    const blob = await request;
    blobs.set(key, blob);
    evictOldest();
    return toFile(blob);
  } finally {
    inflight.delete(key);
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
}

/** Drop everything — used when switching assignment. */
export function clearStudentPdfCache() {
  blobs.clear();
  inflight.clear();
}
