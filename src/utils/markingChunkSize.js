/**
 * Non-director viewers lock pages-per-request to the selected Sahahly model.
 * Director (and backup director scope) keep an independent chunk-size picker.
 *
 *   Sahahly 2.5*  → 3 pages / request
 *   Sahahly 3*    → 10 pages / request
 */

export const CHUNK_SIZE_FOR_MODEL_2_5 = 3;
export const CHUNK_SIZE_FOR_MODEL_3 = 10;
/** Fallback when the model id is unknown — prefer the safer smaller window. */
export const CHUNK_SIZE_DEFAULT = CHUNK_SIZE_FOR_MODEL_2_5;

/**
 * Smallest pages-per-request the director picker may offer.
 *
 * MEASURED: the picker offered [0,1,2,3,5,8,10] with no floor, and 1 was
 * selected across 17 distinct assignments / 124 papers on 18-19 Aug. Live logs
 * confirmed the effect - "16 pages -> 16 Gemini request(s)" - i.e. eight times
 * the requests a 10-page window would have made, each carrying the full mark
 * scheme and (on gemini-3-flash-preview) tens of thousands of thinking tokens.
 *
 * 0 stays available and is NOT below the floor: it means "whole PDF in one
 * request", the cheapest option, not the most expensive.
 *
 * Note this is a cost/latency guardrail only. A boundary-adjacency test on 405
 * papers found 1-page windows did NOT miss more questions than larger ones
 * (11.3% vs 8.1%, non-monotonic), so this is not claimed as an accuracy fix.
 */
export const CHUNK_SIZE_MIN_PICKABLE = 3;

/** Options a free picker may show: whole-PDF, or >= the floor. */
export function pickableChunkSizes(all = [0, 1, 2, 3, 5, 8, 10]) {
  return all.filter((n) => n === 0 || n >= CHUNK_SIZE_MIN_PICKABLE);
}

/**
 * @param {string|null|undefined} modelId Gemini / Sahahly model id
 * @returns {number} pages per AI request (1–10)
 */
export function chunkSizeForGeminiModel(modelId) {
  const id = String(modelId || "").trim().toLowerCase();
  if (!id) return CHUNK_SIZE_DEFAULT;

  // 2.5 family must win before generic "3" matching.
  if (id.includes("2.5") || id.includes("2_5")) {
    return CHUNK_SIZE_FOR_MODEL_2_5;
  }

  // Sahahly 3 / 3.5 / gemini-3-*
  if (
    id.includes("gemini-3") ||
    id.includes("3.5") ||
    id.includes("3-flash") ||
    id.includes("3_flash") ||
    /(^|[^0-9])3(\.\d+)?([-_.]?flash)?/.test(id)
  ) {
    return CHUNK_SIZE_FOR_MODEL_3;
  }

  return CHUNK_SIZE_DEFAULT;
}

export function formatChunkSizeLabel(pages) {
  const n = Number(pages);
  if (!Number.isFinite(n) || n <= 0) return "Full PDF (1 request)";
  return `${n} page${n === 1 ? "" : "s"} / request`;
}
