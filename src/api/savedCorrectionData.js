/**
 * Saved Correction Data — the per-question record of what the AI marked and what
 * a reviewer made of it.
 *
 * The rows themselves are written server-side by every marking save path; this
 * module only reads. The one thing the marking UI needs from here is the
 * error-type vocabulary: when a reviewer corrects a question they say WHY the AI
 * was wrong, and that answer is the only column on a row nothing can derive.
 *
 * `api`'s baseURL already ends in `/api`, so paths here are relative to that and
 * the request interceptor attaches the bearer token.
 */
import api from "./api";

const BASE = "/saved-correction-data";

/**
 * The error-type dropdown options.
 *
 * Fetched rather than hardcoded because the server builds this list and its
 * schema enum from the same frozen array — a copy in the client would drift and
 * start offering values the write coerces to "other".
 *
 * @returns {Promise<Array<{ value: string, label: string, description: string }>>}
 */
export const fetchCorrectionErrorTypes = () =>
  api.get(`${BASE}/error-types`).then((r) => r.data?.errorTypes ?? []);

/**
 * Rows, filtered and paginated.
 *
 * The long text columns (question text, student answer, mark scheme) are left
 * out unless `withText` is set — a filter with no assignment can match hundreds
 * of thousands of rows and those three fields are the bulk of every one.
 *
 * `flow` is required alongside `assignmentId`: the id column holds an ObjectId
 * for classroom rows and a number for partner rows, and the server needs the
 * flow to know which it is.
 *
 * @param {object} params flow, assignmentId, submissionId, board, paperCode,
 *   paperNumber, subject, topic, questionNumber, errorType ("none" for
 *   unclassified), assistantId, classroomId, editedByAssistant, mappingEdited,
 *   excludeUnmeasurable, from, to, page, perPage, withText
 */
export const listSavedCorrectionData = (params = {}) =>
  api.get(BASE, { params }).then((r) => r.data);

/**
 * Per-question accuracy across whatever slice `params` describes.
 *
 * @param {object} params same filter as listSavedCorrectionData, plus
 *   groupBy: "questionNumber" (default) | "topic"
 */
export const fetchSavedCorrectionSummary = (params = {}) =>
  api.get(`${BASE}/summary`, { params }).then((r) => r.data);

/** One row, with every column on it. */
export const getSavedCorrectionRow = (id) =>
  api.get(`${BASE}/${id}`).then((r) => r.data);

/**
 * A browser download of the CSV export.
 *
 * Deliberately not an axios call: the response is a stream the server sizes in
 * tens of thousands of rows, and pulling it through XHR would buffer the whole
 * file in memory before the user saw anything. Handing the URL to the browser
 * lets it stream to disk instead.
 *
 * @returns {string} URL to navigate to / open
 */
export const savedCorrectionExportUrl = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  const base = api.defaults.baseURL || "";
  return `${base}${BASE}/export${query ? `?${query}` : ""}`;
};
