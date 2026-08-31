/**
 * Student-facing study topic label — never show bare "-" when the model omitted
 * studyTopic.
 */

const PLACEHOLDER_TOPICS = new Set([
  "",
  "-",
  "—",
  "–",
  "?",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);

export function formatStudyTopic(q) {
  const raw = String(q?.studyTopic ?? "").trim();
  if (raw && !PLACEHOLDER_TOPICS.has(raw.toLowerCase())) return raw;

  const advice = String(q?.mistakeAdvice ?? "").trim();
  if (advice) {
    const short = advice.split(/[.!]/)[0].trim().slice(0, 56);
    if (short) return short;
  }

  const missing = Array.isArray(q?.missingKeywords) ? q.missingKeywords[0] : null;
  if (missing) {
    const kw = String(missing).trim().slice(0, 56);
    if (kw) return kw;
  }

  return "General revision";
}
