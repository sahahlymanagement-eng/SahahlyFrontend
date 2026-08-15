/**
 * WhatsApp Broadcast API — thin wrappers over the shared axios instance.
 *
 * Sibling of `scheduledWhatsapp.js` but a separate feature: that one schedules a
 * message to a GROUP, this one blasts a one-off message to a list of individual
 * numbers imported from a spreadsheet.
 *
 * `api`'s baseURL already ends in `/api`, so paths here are relative to that, and
 * the request interceptor attaches the bearer token.
 *
 * Every endpoint — reads included — requires director / admin / manager. A manager
 * only sees the broadcasts they created.
 */
import api from "./api";

const BASE = "/whatsapp-broadcasts";

/* ── Recipients ──────────────────────────────────────────────────────────────
 * Preview is a DRY RUN: it parses the sheet and reports exactly who would and
 * would not be messaged, without creating anything. Nothing is sent, and no
 * broadcast exists, until `createBroadcast` is called with the reviewed list.
 *
 * Both preview calls also return `cooldownMs`, `wouldBeSkippedCount` and a capped
 * `wouldBeSkipped` sample: people the worker would skip for having received another
 * broadcast inside the cooldown window. An estimate — more sends can land before the
 * campaign is armed — and the input to the send gate's "send to them anyway" option.
 */

/**
 * @param {File} file .xlsx / .xls / .csv
 * @param {{ sheet?: string, columns?: { name?: string, phone?: string } }} [opts]
 */
export const previewRecipients = (file, opts = {}) => {
  const body = new FormData();
  body.append("file", file);
  if (opts.sheet) body.append("sheet", opts.sheet);
  if (opts.columns) body.append("columns", JSON.stringify(opts.columns));
  // The axios interceptor strips Content-Type for FormData so the browser sets the boundary.
  return api.post(`${BASE}/recipients/preview`, body).then((r) => r.data);
};

/* ── Roster sources ──────────────────────────────────────────────────────────
 * The other way to build a list: pick a cohort we already hold numbers for
 * instead of uploading a sheet. Classrooms come from Google Classroom; grading
 * partners have no classroom entity, so their cohort is one assignment.
 *
 * `previewRoster` is a DRY RUN exactly like `previewRecipients`, and resolves the
 * same {valid, invalid, duplicates} shape, so the review table and the send gate
 * are shared.
 */

/** Classrooms this account can broadcast to (director/admin see all active ones). */
export const listClassroomSources = (params) =>
  api.get(`${BASE}/sources/classrooms`, { params }).then((r) => r.data?.classrooms ?? []);

export const listPartnerSources = () =>
  api.get(`${BASE}/sources/partners`).then((r) => r.data?.partners ?? []);

/** Honours the same grading delegation scope as the partner grading + reports tabs. */
export const listPartnerAssignments = (slug) =>
  api.get(`${BASE}/sources/partners/${slug}/assignments`).then((r) => r.data?.assignments ?? []);

/**
 * @param {{ kind: "classroom", classroomId: string, audience: string }
 *       | { kind: "partner", provider: string, assignmentId: number, audience: string }} body
 *   audience is "parent" | "student" | "both" — "both" is two recipients per student,
 *   deduped when they share a number.
 */
export const previewRoster = (body) =>
  api.post(`${BASE}/recipients/preview-roster`, body).then((r) => r.data);

/* ── Attachments ─────────────────────────────────────────────────────────── */

/** @returns {Promise<{ attachmentId: string, kind: "image"|"file", filename: string, mimetype: string, size: number }>} */
export const uploadAttachment = (file) => {
  const body = new FormData();
  body.append("file", file);
  return api.post(`${BASE}/attachments`, body).then((r) => r.data?.attachment);
};

/** Object URL for stored bytes — fetched as a blob because <img src> can't send the token. */
export const attachmentObjectUrl = (attachmentId) =>
  api
    .get(`${BASE}/attachments/${attachmentId}`, { responseType: "blob" })
    .then((r) => URL.createObjectURL(r.data));

/* ── Broadcasts ──────────────────────────────────────────────────────────── */

/**
 * Arms the broadcast — the worker starts sending on its next pass.
 *
 * `bypassCooldown: true` waives the cross-campaign per-number cooldown for THIS
 * campaign only, so people the preview reported under `wouldBeSkippedCount` are
 * messaged anyway. Anything other than a literal `true` leaves the guard in place.
 * Resolves `{ broadcast, recipientCount, excluded, estimatedFinishAt }`, or
 * `{ broadcast, replay: true }` if this `clientRequestId` was already used.
 * A 409 with `code: "duplicate_sheet"` means this exact file was broadcast in the
 * last 7 days; re-send with `confirmDuplicateSheet: true` to override.
 */
export const createBroadcast = (payload) => api.post(BASE, payload).then((r) => r.data);

/** @param {{ status?: string, page?: number, limit?: number }} [params] */
export const listBroadcasts = (params) =>
  api.get(BASE, { params }).then((r) => r.data ?? { broadcasts: [], total: 0 });

/** Resolves `{ broadcast, progress, nextWindowOpensAt, pollAfterMs }`. */
export const getBroadcast = (id) => api.get(`${BASE}/${id}`).then((r) => r.data);

/** @param {{ status?: string, page?: number, limit?: number }} [params] */
export const listRecipients = (id, params) =>
  api.get(`${BASE}/${id}/recipients`, { params }).then((r) => r.data ?? { recipients: [], total: 0 });

/** Halts sending but keeps the queue, so it can be resumed. */
export const pauseBroadcast = (id) => api.post(`${BASE}/${id}/pause`).then((r) => r.data?.broadcast);

export const resumeBroadcast = (id) => api.post(`${BASE}/${id}/resume`).then((r) => r.data?.broadcast);

/**
 * Drops every queued recipient. Anyone already mid-send still receives it —
 * there is no unsend — so the response reports `stillSending`.
 */
export const cancelBroadcast = (id) => api.post(`${BASE}/${id}/cancel`).then((r) => r.data);

/** Re-queues failed rows. Numbers the provider rejected as malformed are excluded
 *  unless `includeInvalid` is true, because retrying those always fails again. */
export const retryFailed = (id, body = {}) =>
  api.post(`${BASE}/${id}/retry-failed`, body).then((r) => r.data);

/** One message to your own number, through the identical send path. */
export const testSend = (id, phone, sampleName, sampleStudent) =>
  api.post(`${BASE}/${id}/test-send`, { phone, sampleName, sampleStudent }).then((r) => r.data);

export const deleteBroadcast = (id) => api.delete(`${BASE}/${id}`).then((r) => r.data);

/** Prefer the backend's message (validation failures return 4xx `{ message }`). */
export const wbErr = (err, fallback) => err?.response?.data?.message || fallback;
