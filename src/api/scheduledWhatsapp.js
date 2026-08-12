/**
 * Scheduled WhatsApp API — thin wrappers over the shared axios instance.
 *
 * `api`'s baseURL already ends in `/api`, so every path here is relative to
 * that (`/scheduled-whatsapp/...`), and the request interceptor attaches the
 * bearer token — no hand-rolled auth headers.
 *
 * Each wrapper unwraps the response envelope and lets axios errors propagate,
 * so callers use the app-wide `err?.response?.data?.message` pattern (see
 * `swErr` below) and surface the backend's own validation text.
 *
 * Writes (POST/PATCH/DELETE) require the caller's role to be
 * director / admin / manager / teacher; reads are open to any logged-in user.
 * Teacher accounts only see groups and schedules they created.
 */
import api from "./api";

const BASE = "/scheduled-whatsapp";

/** @param {{ active?: boolean }} [params] */
export const listGroups = (params) =>
  api.get(`${BASE}/groups`, { params }).then((r) => r.data?.groups ?? []);

/** Also renames / reactivates an existing group with the same chatId. */
export const addGroup = (chatId, name) =>
  api.post(`${BASE}/groups`, { chatId, name }).then((r) => r.data?.group);

// The `@` and `.` in `…@g.us` must not reach the router raw.
export const deleteGroup = (chatId) =>
  api.delete(`${BASE}/groups/${encodeURIComponent(chatId)}`).then((r) => r.data);

/* ── Attachments ─────────────────────────────────────────────────────────────
 * Uploading is its own round-trip: the file goes up first and the schedule is
 * saved with the returned `attachmentId`. An id that never reaches a schedule
 * is reaped server-side, so abandoning the composer leaks nothing.
 */

/**
 * @param {File} file
 * @returns {Promise<{ attachmentId: string, kind: "image"|"file", filename: string, mimetype: string, size: number }>}
 */
export const uploadAttachment = (file) => {
  const body = new FormData();
  body.append("file", file);
  // The axios interceptor strips Content-Type for FormData so the browser sets the boundary.
  return api.post(`${BASE}/attachments`, body).then((r) => r.data?.attachment);
};

/**
 * Object URL for a stored attachment. Fetched as a blob rather than used as a bare
 * `src`, because the endpoint needs the bearer token an <img> tag cannot send.
 * Callers must `URL.revokeObjectURL` when done.
 */
export const attachmentObjectUrl = (attachmentId) =>
  api
    .get(`${BASE}/attachments/${attachmentId}`, { responseType: "blob" })
    .then((r) => URL.createObjectURL(r.data));

/** @param {{ status?: string, chatId?: string }} [filters] */
export const listSchedules = (filters) =>
  api.get(BASE, { params: filters }).then((r) => r.data?.scheduledMessages ?? []);

export const createSchedule = (payload) =>
  api.post(BASE, payload).then((r) => r.data?.scheduledMessage);

export const getSchedule = (id) =>
  api.get(`${BASE}/${id}`).then((r) => r.data?.scheduledMessage);

export const updateSchedule = (id, patch) =>
  api.patch(`${BASE}/${id}`, patch).then((r) => r.data?.scheduledMessage);

export const cancelSchedule = (id) =>
  api.post(`${BASE}/${id}/cancel`).then((r) => r.data?.scheduledMessage);

/** Fires immediately. Resolves `{ ok, skipped, result }` — `skipped` is not a success. */
export const sendNow = (id) =>
  api.post(`${BASE}/${id}/send-now`).then((r) => r.data);

export const deleteSchedule = (id) =>
  api.delete(`${BASE}/${id}`).then((r) => r.data);

/** Prefer the backend's message (validation failures return 400 `{ message }`). */
export const swErr = (err, fallback) => err?.response?.data?.message || fallback;
