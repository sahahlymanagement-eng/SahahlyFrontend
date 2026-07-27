/** Convert keyword arrays (Earned / Missing on PDF) to multiline text for editing. */
export function keywordsArrayToText(keywords) {
  return (keywords || []).filter(Boolean).join("\n");
}

/** Parse multiline text into keyword arrays (one line per item). */
export function textToKeywordsArray(text) {
  return String(text ?? "")
    .split(/\n/)
    .filter((line) => line.length > 0);
}

/** Trim keyword lines for PDF output / persistence. */
export function normalizeKeywordLines(keywords) {
  return (keywords || []).map((s) => String(s).trim()).filter(Boolean);
}

export function normalizeKeywordsForCompare(keywords) {
  return JSON.stringify(normalizeKeywordLines(keywords));
}
