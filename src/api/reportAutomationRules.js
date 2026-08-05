/**
 * Report automation rules API — thin wrappers over the shared axios instance.
 * See src/api/scheduledWhatsapp.js for the shared conventions this mirrors.
 */
import api from "./api";

const BASE = "/report-automation-rules";

/** @param {{ classroomId?: string }} [params] */
export const listReportAutomationRules = (params) =>
  api.get(BASE, { params }).then((r) => r.data?.rules ?? []);

/** Upserts the classroom's standing rule for the given reportType. */
export const saveReportAutomationRule = (payload) =>
  api.post(BASE, payload).then((r) => r.data?.rule);

export const updateReportAutomationRule = (id, patch) =>
  api.patch(`${BASE}/${id}`, patch).then((r) => r.data?.rule);

export const deleteReportAutomationRule = (id) =>
  api.delete(`${BASE}/${id}`).then((r) => r.data);

/** Prefer the backend's message (validation failures return 400 `{ message }`). */
export const reportAutomationRuleErr = (err, fallback) =>
  err?.response?.data?.message || fallback;
