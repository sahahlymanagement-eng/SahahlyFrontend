/** Convert keyword arrays (Earned / Missing on PDF) to multiline text for editing. */
export function keywordsArrayToText(keywords) {
  return (keywords || []).filter(Boolean).join("\n");
}

/** Parse multiline text into keyword arrays (one non-empty line per item). */
export function textToKeywordsArray(text) {
  return String(text ?? "")
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeKeywordsForCompare(keywords) {
  return JSON.stringify(
    (keywords || []).map((s) => String(s).trim()).filter(Boolean)
  );
}
