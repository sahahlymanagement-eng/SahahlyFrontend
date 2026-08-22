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
