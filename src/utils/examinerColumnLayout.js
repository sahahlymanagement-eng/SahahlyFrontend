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

function estimatedTextLines(text) {
  const len = String(text ?? "").trim().length;
  return len ? Math.max(1, Math.ceil(len / 48)) : 0;
}

function estimatedListLines(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((sum, text) => sum + estimatedTextLines(text), 0);
}

/** Same field priority as annotatePdf.js's markPointDetail(). */
function markPointDetailText(p) {
  return String(p?.evidence || p?.description || p?.criterion || p?.label || p?.text || "").trim();
}

// Chosen so that at a normal ~842pt page these reproduce the old flat
// "6.5 + extra * 1.35" percent formula exactly (54.73/842*100 = 6.5,
// 11.37/842*100 = 1.35) — same numbers for ordinary pages, but now expressed
// in points so they can be rescaled to the page they're actually drawn on.
const NOTE_BOX_BASE_PT = 54.73;
const NOTE_BOX_LINE_PT = 11.37;

/**
 * Overlay height when the teacher has not resized this box yet.
 * Must track annotatePdf.js's buildColumnBlock reasonably closely, in two
 * ways:
 *  1. Line count — a long keyword/point phrase wraps to several printed
 *     lines (not one), a mark-point row prints under
 *     evidence/description/criterion/label/text (falling back to the
 *     matching keyword by award order) — not `.code`, which is just a short
 *     tag — and when points exist the real PDF draws points ONLY, never
 *     points plus the keyword bullets too. MCQ/blank/manually-added rows
 *     print the student's or correct answer instead of any of that.
 *  2. Page height — buildColumnBlock's height is an absolute point value
 *     (font size × line count), not a percent of the page. A scanned/
 *     photographed submission page can be several times taller than a normal
 *     ~842pt page, so the SAME box is a much smaller fraction of it. Passing
 *     the real rendered page height (from the pdf.js viewport) is what keeps
 *     this in percent-terms consistent with what's actually drawn there.
 * Getting either wrong desyncs the drag handle from the box actually drawn
 * on the page, leaving the resize handle unclickable wherever the visible
 * box ends — this is what "resize doesn't work" looks like to a teacher.
 */
export function estimateNoteBoxHeightPercent(q, pageHeight = 842) {
  const stored = clampNoteBoxHeightPercent(q?.noteBoxHeightPercent);
  if (stored != null) return stored;

  const markedKeywords = (Array.isArray(q?.markedKeywords) ? q.markedKeywords : [])
    .map((k) => String(k || "").trim())
    .filter(Boolean);
  const missingKeywords = (Array.isArray(q?.missingKeywords) ? q.missingKeywords : [])
    .map((k) => String(k || "").trim())
    .filter(Boolean);
  const markPoints = (Array.isArray(q?.markPoints) ? q.markPoints : []).filter(Boolean);

  let extra = estimatedTextLines(q?.reason);

  if (markPoints.length) {
    let markIdx = 0;
    let missIdx = 0;
    extra += markPoints.reduce((sum, p) => {
      let detail = markPointDetailText(p);
      if (!detail) {
        detail = p?.awarded === true ? markedKeywords[markIdx++] || "" : missingKeywords[missIdx++] || "not met";
      }
      const code = String(p?.code || "").trim();
      const text = [code, detail].filter(Boolean).join(": ");
      return sum + estimatedTextLines(text);
    }, 0);
  } else if (markedKeywords.length || missingKeywords.length) {
    extra += estimatedListLines(markedKeywords) + estimatedListLines(missingKeywords);
  } else {
    extra +=
      estimatedTextLines(q?.studentFinalAnswer || q?.studentAnswer) +
      estimatedTextLines(q?.correctAnswer);
  }

  const heightPt = NOTE_BOX_BASE_PT + extra * NOTE_BOX_LINE_PT;
  const h = Math.max(80, Number(pageHeight) || 842);
  return clampNoteBoxHeightPercent((heightPt / h) * 100) ?? 8;
}
