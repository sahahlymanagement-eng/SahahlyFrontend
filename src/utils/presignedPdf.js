/**
 * Direct-from-R2 PDF loading. The backend mirrors Google Classroom submission
 * PDFs and mark schemes into Cloudflare R2 (see
 * SahahlyBackend/src/services/classroomPdfMirrorService.js) and hands back
 * presigned URLs when a mirror is ready; otherwise callers fall back to the
 * existing Drive-backed proxy routes untouched. Every function here resolves
 * to a `File` (or `null` to signal "use the proxy instead") so nothing
 * downstream (annotatePdf, marking FormData, pdf.js) needs to know or care
 * where the bytes came from.
 *
 * Not imported by annotatePdf.js or its web worker — safe to use Node/DOM
 * APIs (fetch with a body reader) freely, unlike utils shared with the
 * worker (see the `window`-reference caveat in api.js).
 *
 * IMPORTANT: presigned URLs must be fetched with plain `fetch`, never through
 * the `api` axios instance — its request interceptor always attaches
 * `Authorization: Bearer <token>` (R2 rejects an unexpected auth header) and
 * its response interceptor logs the session out on a 401, which a stray R2
 * 403 could otherwise trigger.
 */

import { assertPdfBlob } from "./markingFormData";

/** Download a presigned URL directly in the browser into a File. */
export async function urlToFile(url, name, { timeoutMs = 60_000, onProgress } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`Failed to download ${name} (HTTP ${resp.status})`);

    if (onProgress && resp.body?.getReader) {
      const total = Number(resp.headers.get("content-length")) || 0;
      const reader = resp.body.getReader();
      const chunks = [];
      let loaded = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        try {
          onProgress({ loaded, total });
        } catch {
          /* progress display is best-effort */
        }
      }
      const blob = new Blob(chunks, { type: "application/pdf" });
      return new File([blob], name, { type: "application/pdf" });
    }

    const blob = await resp.blob();
    return new File([blob], name, { type: "application/pdf" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True when `err`/`data` looks like the {noAttachment:true} 404 body the
 * proxy routes use — recognized whether it arrived as JSON (this module's
 * fetch calls) or as an axios error with a Blob body (the old proxy path).
 */
export function isNoAttachmentPayload(data) {
  return Boolean(data && typeof data === "object" && data.noAttachment);
}

/**
 * Tries the direct-from-R2 path for a student submission PDF.
 * Returns a `File` on success, or `null` to mean "fall back to
 * GET /submission-files/pdf" (feature disabled, mirror not ready yet, CORS
 * blocked, network error — anything short of a real "no attachment").
 *
 * Throws only when the backend says there is genuinely no downloadable
 * attachment (`{noAttachment: true}`), so callers keep their existing
 * no-submission handling.
 */
export async function fetchStudentPdfDirect(api, { assignmentId, submissionId, googleUserId, onProgress } = {}) {
  let data;
  try {
    const res = await api.get("/submission-files/pdf-url", {
      params: {
        assignmentId,
        submissionId,
        ...(googleUserId ? { googleUserId } : {}),
      },
    });
    data = res.data;
  } catch (err) {
    if (isNoAttachmentPayload(err?.response?.data)) {
      const e = new Error(err.response.data.message || "No attachment found");
      e.response = err.response;
      throw e;
    }
    return null; // ask-for-url call itself failed — fall back silently
  }

  if (isNoAttachmentPayload(data)) {
    const e = new Error(data.message || "No attachment found");
    e.response = { status: 404, data };
    throw e;
  }

  if (data?.mode !== "direct" || !data.url) return null;

  try {
    return await urlToFile(data.url, `${submissionId}.pdf`, { onProgress });
  } catch {
    // Presigned URL rejected (expired/CORS/network) — the proxy still works.
    return null;
  }
}

const markSchemeCache = new Map(); // assignmentId -> File
const markSchemeInflight = new Map(); // assignmentId -> Promise<File>

/** Drop a cached mark-scheme File — call after a new upload replaces it. */
export function invalidateMarkSchemeFile(assignmentId) {
  const key = String(assignmentId);
  markSchemeCache.delete(key);
  markSchemeInflight.delete(key);
}

/**
 * Fetches an assignment's mark scheme as a File, direct from R2 when the
 * backend has a presigned URL, else the existing `/markscheme-file` blob
 * route. Cached per assignment (mark schemes are immutable per upload); two
 * concurrent callers for the same assignment (e.g. a results-modal effect
 * re-running right after mount) share one in-flight fetch rather than both
 * issuing the same multi-MB request.
 */
export function fetchMarkSchemeFile(api, assignmentId) {
  const key = String(assignmentId);
  const cached = markSchemeCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = markSchemeInflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const { data } = await api.get(`/manager-assignments/${assignmentId}/markscheme`);
    if (!data?.fileId) return null;

    let file = null;
    if (data.presignedUrl) {
      try {
        file = await urlToFile(data.presignedUrl, "markscheme.pdf");
      } catch {
        file = null; // fall back to the proxy below
      }
    }

    if (!file) {
      const res = await api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
        responseType: "blob",
      });
      await assertPdfBlob(res.data, "Mark scheme");
      file = new File([res.data], "markscheme.pdf", { type: "application/pdf" });
    }

    markSchemeCache.set(key, file);
    return file;
  })();

  markSchemeInflight.set(key, task);
  task.finally(() => markSchemeInflight.delete(key));
  return task;
}
