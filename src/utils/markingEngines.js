import { currentUserId } from "./markingFormData";

/**
 * Marking engines.
 *
 * v1 is the original marking API. v2 is the windowed engine: it splits a script
 * into overlapping 2-page windows and sends each one only the mark-scheme pages
 * an index pass paired to the questions in it, instead of the whole scheme every
 * time.
 *
 * The backend deliberately mirrors the v1 mark-batch contract at /gradingv2, so
 * the batch flow only needs the base path swapped — plus `msPageUris`, which v2
 * returns from upload and needs back at submit so each window can reference just
 * the scheme pages it uses.
 */
export const MARKING_ENGINES = {
  v1: {
    id: "v1",
    basePath: "/marking",
    label: "Batch",
    resultProvider: "gemini-batch",
  },
  v2: {
    id: "v2",
    basePath: "/gradingv2",
    label: "Batch v2",
    resultProvider: "gemini-v2-batch",
    liveResultProvider: "gemini-v2",
  },
};

export function markingEngine(engine) {
  return MARKING_ENGINES[engine] || MARKING_ENGINES.v1;
}

export function engineBasePath(engine) {
  return markingEngine(engine).basePath;
}

export function isV2(engine) {
  return engine === "v2";
}

/**
 * v2 has passed its offline tests but has not been validated against real papers
 * yet, so it stays behind an allow-list the way priority marking does. Widen this
 * list once the dry-run comparison says it is safe.
 */
export const GRADINGV2_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];

export function canUseGradingV2(userId = currentUserId()) {
  return GRADINGV2_ALLOWED_IDS.includes(userId);
}
