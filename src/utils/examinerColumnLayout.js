/** Default examiner notes column as a percent of the annotated page width.
 *  178pt on ~595pt A4 paper → ~23% of (paper + column). */
export const DEFAULT_EXAMINER_COL_WIDTH_PCT = 23;
export const MIN_EXAMINER_COL_WIDTH_PCT = 14;
export const MAX_EXAMINER_COL_WIDTH_PCT = 42;

export const MIN_NOTE_BOX_HEIGHT_PCT = 4;
export const MAX_NOTE_BOX_HEIGHT_PCT = 48;

export function clampExaminerColumnWidthPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_EXAMINER_COL_WIDTH_PCT;
  return Math.min(
    MAX_EXAMINER_COL_WIDTH_PCT,
    Math.max(MIN_EXAMINER_COL_WIDTH_PCT, Math.round(v * 10) / 10)
  );
}

export function clampNoteBoxHeightPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.min(
    MAX_NOTE_BOX_HEIGHT_PCT,
    Math.max(MIN_NOTE_BOX_HEIGHT_PCT, Math.round(v * 100) / 100)
  );
}

export function examinerColumnWidthPercentFromQuestions(questions) {
  for (const q of questions || []) {
    const n = Number(q?.examinerColumnWidthPercent);
    if (Number.isFinite(n) && n > 0) return clampExaminerColumnWidthPercent(n);
  }
  return DEFAULT_EXAMINER_COL_WIDTH_PCT;
}

/** Convert overlay % of the annotated page into PDF points to append. */
export function examinerColumnWidthPt(paperW, widthPct) {
  const p = clampExaminerColumnWidthPercent(widthPct) / 100;
  const paper = Math.max(1, Number(paperW) || 595);
  if (p >= 0.85) return paper * 0.85;
  return Math.max(96, Math.min(480, (paper * p) / (1 - p)));
}

export function noteBoxHeightPt(pageHeight, heightPct) {
  const pct = clampNoteBoxHeightPercent(heightPct);
  if (pct == null) return null;
  const h = Math.max(80, Number(pageHeight) || 842);
  return Math.max(22, Math.min(h * 0.55, (pct / 100) * h));
}

/** Overlay height when the teacher has not resized this box yet. */
export function estimateNoteBoxHeightPercent(q) {
  const stored = clampNoteBoxHeightPercent(q?.noteBoxHeightPercent);
  if (stored != null) return stored;
  const reason = String(q?.reason || "");
  const marked = Array.isArray(q?.markedKeywords) ? q.markedKeywords.length : 0;
  const missing = Array.isArray(q?.missingKeywords) ? q.missingKeywords.length : 0;
  const points = Array.isArray(q?.markPoints) ? q.markPoints.length : 0;
  const extra = Math.ceil(reason.length / 48) + marked + missing + points;
  return clampNoteBoxHeightPercent(6.5 + extra * 1.35) ?? 8;
}
