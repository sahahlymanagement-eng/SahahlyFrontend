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
 * director / admin / manager; reads are open to any logged-in user.
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
