/**
 * Grading-partner reports API — thin wrappers over the shared axios instance.
 * Mirrors the conventions in src/api/reportAutomationRules.js.
 *
 * Every path carries the partner slug (logincss | mariamgabalawy | drpeter); the
 * backend resolves it and applies the same director-delegation scope the partner
 * grading tabs use, so a delegated account sees only its own assignments here too.
 */
import api from "./api";

const BASE = "/partner-reports";

/** Prefer the backend's message — validation failures return 400 `{ message }`. */
export const partnerReportErr = (err, fallback) =>
  err?.response?.data?.message || fallback;

// ── Partners / assignments / students ──────────────────────────────────────

export const listReportPartners = () =>
  api.get(`${BASE}/partners`).then((r) => r.data?.partners ?? []);

export const listPartnerAssignments = (slug) =>
  api.get(`${BASE}/${slug}/assignments`).then((r) => r.data ?? { assignments: [] });

/** @param {{ assignmentId?: number }} [params] omit to list every student. */
export const listPartnerStudents = (slug, params) =>
  api.get(`${BASE}/${slug}/students`, { params }).then((r) => r.data ?? { students: [] });

export const listPartnerMonths = (slug) =>
  api.get(`${BASE}/${slug}/months`).then((r) => r.data?.months ?? []);

// ── Contact directory ──────────────────────────────────────────────────────

export const savePartnerContact = (slug, payload) =>
  api.post(`${BASE}/${slug}/contacts`, payload).then((r) => r.data?.contact);

export const deletePartnerContact = (slug, studentKey) =>
  api.delete(`${BASE}/${slug}/contacts`, { params: { studentKey } }).then((r) => r.data);

/**
 * Bulk import from a spreadsheet. The axios instance strips the Content-Type for
 * FormData so the browser sets the multipart boundary itself.
 * @param {File} file .xlsx / .xls / .csv
 */
export const importPartnerContacts = (slug, file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`${BASE}/${slug}/contacts/import`, form).then((r) => r.data);
};

// ── 1. Assignment reports → parents ────────────────────────────────────────

export const previewPartnerAssignmentReports = (slug, payload) =>
  api.post(`${BASE}/${slug}/assignment-reports/preview`, payload).then((r) => r.data);

export const sendPartnerAssignmentReports = (slug, payload) =>
  api.post(`${BASE}/${slug}/assignment-reports/send`, payload).then((r) => r.data);

// ── 2. Collective report → group / phone ───────────────────────────────────

export const getPartnerCollectiveRows = (slug, assignmentId) =>
  api.get(`${BASE}/${slug}/collective/rows`, { params: { assignmentId } }).then((r) => r.data);

/** Returns a Blob so the caller can download or preview it. */
export const downloadPartnerCollectivePdf = (slug, assignmentId, variant = "teacher") =>
  api
    .get(`${BASE}/${slug}/collective/pdf`, {
      params: { assignmentId, variant },
      responseType: "blob",
    })
    .then((r) => r.data);

export const sendPartnerCollectiveReport = (slug, payload) =>
  api.post(`${BASE}/${slug}/collective/send`, payload).then((r) => r.data);

// ── 3. Monthly parent reports → parents ────────────────────────────────────

export const previewPartnerMonthlyReport = (slug, params) =>
  api.get(`${BASE}/${slug}/monthly/preview`, { params }).then((r) => r.data?.report);

export const downloadPartnerMonthlyPdf = (slug, params) =>
  api
    .get(`${BASE}/${slug}/monthly/pdf`, { params, responseType: "blob" })
    .then((r) => r.data);

export const sendPartnerMonthlyReports = (slug, payload) =>
  api.post(`${BASE}/${slug}/monthly/send`, payload).then((r) => r.data);

// ── 4. Teacher executive analysis → group / phone ──────────────────────────

export const previewPartnerExecutiveReport = (slug, assignmentId) =>
  api
    .get(`${BASE}/${slug}/executive/preview`, { params: { assignmentId } })
    .then((r) => r.data?.report);

export const downloadPartnerExecutivePdf = (slug, assignmentId) =>
  api
    .get(`${BASE}/${slug}/executive/pdf`, {
      params: { assignmentId },
      responseType: "blob",
    })
    .then((r) => r.data);

export const sendPartnerExecutiveReport = (slug, payload) =>
  api.post(`${BASE}/${slug}/executive/send`, payload).then((r) => r.data);

// ── 5. Reports sent ────────────────────────────────────────────────────────

export const listPartnerSentHistory = (slug, params) =>
  api.get(`${BASE}/${slug}/sent-history`, { params }).then((r) => r.data);

// ── 6. Auto-send rules ─────────────────────────────────────────────────────

export const listPartnerAutomationRules = (slug) =>
  api.get(`${BASE}/${slug}/automation-rules`).then((r) => r.data?.rules ?? []);

/** Upserts the partner's standing rule for the given reportType. */
export const savePartnerAutomationRule = (slug, payload) =>
  api.post(`${BASE}/${slug}/automation-rules`, payload).then((r) => r.data?.rule);

export const updatePartnerAutomationRule = (slug, id, patch) =>
  api.patch(`${BASE}/${slug}/automation-rules/${id}`, patch).then((r) => r.data?.rule);

export const deletePartnerAutomationRule = (slug, id) =>
  api.delete(`${BASE}/${slug}/automation-rules/${id}`).then((r) => r.data);
