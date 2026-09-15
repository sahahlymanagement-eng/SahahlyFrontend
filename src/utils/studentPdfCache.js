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
import { fetchStudentPdfDirect } from "./presignedPdf";

// Moving through a class commonly revisits more than four papers (and opening
// the same paper can trigger a normalized-preview rebuild). Retain a modest
// working set so those previews do not go back through Drive conversion.
const MAX_ENTRIES = 10;
const MAX_ATTEMPTS = 5;
// Drive/proxy interruptions during busy marking periods commonly last longer
// than a second. Keep retrying the one PDF with a useful backoff instead of
// surfacing an error (or making the user reopen the paper) immediately.
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000, 15_000];
// A total-time limit was the wrong shape for this download: scanned papers
// are tens of MB and teachers are often on slow links (measured 200–300 KB/s
// in the field), so a 30 MB paper that was streaming perfectly well got cut
// off at 120 s, thrown away, and restarted from zero on every retry. Abort
// only when the connection actually stops delivering bytes; keep a generous
// absolute ceiling so a runaway can never hang the modal forever.
const STALL_TIMEOUT_MS = 60_000;
const ABSOLUTE_TIMEOUT_MS = 15 * 60_000;

/** key -> File (stable identity also allows annotated-preview cache hits). */
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
  {
    assignmentId,
    submissionId,
    googleUserId,
    // Kept for callers that pass it; now the STALL budget, not a total budget.
    timeout = STALL_TIMEOUT_MS,
    /** ({ loaded, total }) → void, called as bytes arrive. */
    onProgress = null,
    // From the student list response (manager-assignments /full,
    // assignment-submissions /students) when it already carried a presigned
    // URL for this submission — skips the GET /pdf-url round-trip. Optional;
    // a stale/expired one just falls back to the normal resolution.
    directUrl = null,
    directExpiresAt = null,
  }
) {
  const key = cacheKey(assignmentId, submissionId);

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

  // Tried once, outside the retry loop below — a direct-from-R2 miss (CORS,
  // mirror not ready, network) should fall back to the proxy immediately,
  // not repeat the same failing fetch on every one of withPdfFetchRetry's
  // attempts. Declared here (not inside the retried function) so it persists
  // across those attempts.
  let directAttempted = false;

  const request = withPdfFetchRetry(async () => {
    if (!directAttempted) {
      directAttempted = true;
      // Runs before any stall timer/AbortController exists below — doing
      // this after arming them would abort fetchStudentPdfDirect's own
      // unrelated request on the proxy's stall budget and start the proxy
      // call with an already-aborted signal.
      const direct = await fetchStudentPdfDirect(api, {
        assignmentId,
        submissionId,
        googleUserId,
        onProgress,
        directUrl,
        directExpiresAt,
      });
      if (direct) return direct;
      // null = "use the proxy"; a genuine no-attachment case throws and
      // propagates from here (not retried, matching the proxy's own 404
      // behavior below).
    }

    const controller = new AbortController();
    let stalled = false;
    let stallTimer = null;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, timeout);
    };
    const ceiling = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, ABSOLUTE_TIMEOUT_MS);
    armStall();
    try {
      const res = await api.get("/submission-files/pdf", {
        params: {
          assignmentId,
          submissionId,
          ...(googleUserId ? { googleUserId } : {}),
        },
        responseType: "blob",
        signal: controller.signal,
        onDownloadProgress: (evt) => {
          armStall();
          if (onProgress) {
            try {
              onProgress({ loaded: evt.loaded || 0, total: evt.total || 0 });
            } catch {
              /* progress display is best-effort */
            }
          }
        },
      });
      await assertPdfBlob(res.data, "Student submission");
      return new File([res.data], `${submissionId}.pdf`, { type: "application/pdf" });
    } catch (err) {
      if (stalled) {
        // Surface as a timeout so withPdfFetchRetry treats it as transient.
        const e = new Error(
          `Student PDF download stalled (no data for ${Math.round(timeout / 1000)}s)`
        );
        e.code = "ECONNABORTED";
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(stallTimer);
      clearTimeout(ceiling);
    }
  });

  inflight.set(key, request);
  try {
    const blob = await request;
    // An invalidation/new fetch may have happened while this download ran.
    // Do not let the older request repopulate the cache with a stale paper.
    if (inflight.get(key) === request) {
      blobs.set(key, blob);
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
}

/** Drop everything — used when switching assignment. */
export function clearStudentPdfCache() {
  blobs.clear();
  inflight.clear();
}
