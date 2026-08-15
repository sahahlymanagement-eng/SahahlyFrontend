// ---------------------------------------------------------------------------
// The one definition of "this submission has been published to the partner",
// mirroring src/utils/gradingStatus.js in the backend.
//
// A row's `localStatus` is OUR progress on it: pending → grading → published, or
// failed. `published` is written by the publish call, the only path that renders
// the annotated PDF, posts the mark back to the partner and stores the grade.
//
// It used to be spelled `done`, and records written before the rename still say
// so, so every comparison must accept both. Go through these helpers rather than
// comparing to a string literal, so a missed site can't be written by accident.
//
// What it does NOT mean: "the partner says this paper is marked". Partner
// payloads carry their own `marked` flag; intake used to copy it into our
// status, which produced rows badged Graded with no grade, no result to open and
// no published PDF, because we had never actually marked them. Those rows now
// arrive as `pending`.
// ---------------------------------------------------------------------------

/** Written by every publish from now on. */
export const PUBLISHED = "published";

/** The pre-rename spelling. Still read, never written. */
export const LEGACY_PUBLISHED = "done";

const PUBLISHED_STATUSES = [PUBLISHED, LEGACY_PUBLISHED];

/** @param {string|null|undefined} status */
export function isPublishedStatus(status) {
  return PUBLISHED_STATUSES.includes(status);
}

/** Convenience for the common `isPublished(row)` shape. */
export function isPublished(submission) {
  return isPublishedStatus(submission?.localStatus);
}
