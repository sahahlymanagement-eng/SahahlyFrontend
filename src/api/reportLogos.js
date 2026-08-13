/**
 * Report logos — the mark drawn beside Sahahly's in report PDFs.
 *
 * An owner is either a teacher account (`person` + Person _id) or a grading
 * partner (`partner` + provider slug). Partners have no account record, so the
 * loose owner pair is what lets both share one store.
 *
 * `api`'s baseURL already ends in `/api`, so paths here are relative to that and
 * the request interceptor attaches the bearer token.
 *
 * Uploads and deletes require director / admin / backup; reads are open to any
 * logged-in user.
 */
import api from "./api";

const BASE = "/report-logos";

/**
 * Owners that currently have a logo — metadata only, never image bytes, so this
 * is cheap enough to call alongside the teacher list.
 *
 * @param {"person"|"partner"} [ownerType]
 * @returns {Promise<Array<{ ownerType: string, ownerKey: string, filename: string, size: number, updatedAt: string }>>}
 */
export const listReportLogos = (ownerType) =>
  api
    .get(BASE, { params: ownerType ? { ownerType } : undefined })
    .then((r) => r.data?.data ?? []);

/**
 * @param {"person"|"partner"} ownerType
 * @param {string} ownerKey Person _id or partner slug
 * @param {File} file
 */
export const uploadReportLogo = (ownerType, ownerKey, file) => {
  const body = new FormData();
  body.append("file", file);
  // The axios interceptor strips Content-Type for FormData so the browser sets the boundary.
  return api.post(`${BASE}/${ownerType}/${ownerKey}`, body).then((r) => r.data?.logo);
};

/**
 * Object URL for a stored logo. Fetched as a blob rather than used as a bare
 * `src`, because the endpoint needs the bearer token an <img> tag cannot send.
 * Callers must `URL.revokeObjectURL` when done.
 *
 * `variant: "pdf"` returns the few-kilobyte render the reports embed instead of
 * the original upload — use it for thumbnails, so a list of teachers does not
 * pull a full-size image per row.
 *
 * @param {"person"|"partner"} ownerType
 * @param {string} ownerKey
 * @param {{ variant?: "pdf" }} [opts]
 */
export const reportLogoObjectUrl = (ownerType, ownerKey, opts = {}) =>
  api
    .get(`${BASE}/${ownerType}/${ownerKey}`, {
      responseType: "blob",
      params: opts.variant ? { variant: opts.variant } : undefined,
    })
    .then((r) => URL.createObjectURL(r.data));

export const deleteReportLogo = (ownerType, ownerKey) =>
  api.delete(`${BASE}/${ownerType}/${ownerKey}`).then((r) => r.data);

/** Shared error unwrap, matching the app-wide pattern. */
export const logoErr = (err, fallback = "Something went wrong") =>
  err?.response?.data?.message || err?.message || fallback;
