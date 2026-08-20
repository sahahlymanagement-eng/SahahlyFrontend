import { placementKey } from "./markingFormData";

/** Natural-ish sort for question labels: 1, 1a, 1b, 2, 10. */
export function compareQuestionNumbers(a, b) {
  const sa = String(a ?? "").trim().toLowerCase();
  const sb = String(b ?? "").trim().toLowerCase();
  const pa = sa.match(/^(\d+)(.*)$/);
  const pb = sb.match(/^(\d+)(.*)$/);
  if (pa && pb) {
    const na = Number(pa[1]);
    const nb = Number(pb[1]);
    if (na !== nb) return na - nb;
    return pa[2].localeCompare(pb[2]);
  }
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

export function yPercentOf(q) {
  const n = Number(q?.yPercent);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 30;
}

/**
 * True when model yPercent values look clustered / defaulted — NOT when printed
 * question numbers disagree with physical top-to-bottom order (mixed papers).
 */
export function placementLooksUnreliable(questions) {
  if (!Array.isArray(questions) || questions.length <= 1) return false;

  const yValues = questions.map(yPercentOf);
  const spread = Math.max(...yValues) - Math.min(...yValues);

  // All answers piled in nearly the same band (likely defaulted coordinates)
  if (spread < 8 && questions.length >= 3) return true;

  const atDefault = yValues.filter((y) => Math.abs(y - 30) < 4).length;
  if (atDefault >= questions.length * 0.6) return true;

  const bottomCluster = yValues.filter((y) => y > 68).length;
  if (bottomCluster >= questions.length * 0.7) return true;

  const topCluster = yValues.filter((y) => y < 25).length;
  if (topCluster >= questions.length * 0.7) return true;

  // Do NOT treat "Q10 above Q3 on the page" as unreliable — many sheets are
  // not in printed-number order. Markers must stay next to the answer body.

  return false;
}

/**
 * Spread questions down a page while preserving relative vertical order from
 * the model (physical position), not alphanumeric question labels.
 */
function assignVerticalSlotsBesideQuestions(group) {
  const sorted = [...group].sort(
    (a, b) =>
      yPercentOf(a) - yPercentOf(b) ||
      compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );
  const n = sorted.length;
  sorted.forEach((q, i) => {
    const yPercent = n === 1 ? 45 : Math.round(10 + (i / (n - 1)) * 78);
    q.yPercent = Math.min(92, Math.max(8, yPercent));
  });
}

/**
 * Fix vertical placement when the model returns bad yPercent (e.g. everything
 * piled at the bottom). Keeps each question on its assigned page.
 * Good coordinates with real spread are preserved — even if Q numbers go
 * 10 → 3 → 6 down the page.
 */
export function normalizeQuestionPlacement(questions, studentPageCount = null) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const byPage = new Map();
  for (const q of questions) {
    const page = Math.max(
      1,
      Math.min(Number(q.pageNumber) || 1, studentPageCount || Number(q.pageNumber) || 1)
    );
    q.pageNumber = page;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(q);
  }

  // Only rewrite per-page when THAT page looks clustered. Never force a global
  // Q-number ladder across the whole paper.
  for (const group of byPage.values()) {
    if (placementLooksUnreliable(group)) {
      assignVerticalSlotsBesideQuestions(group);
    } else {
      spreadStackedMarkers(group);
    }
  }

  return questions;
}

/** Keep stacked badges (MCQ subparts on one stem) from sitting on the same line. */
function spreadStackedMarkers(group) {
  if (!Array.isArray(group) || group.length < 2) return;
  // ~badge footprint on A4 (~52pt of ~842) plus a little air — keeps stored
  // coords from landing two marks on the same stem before draw-time resolve.
  const MIN_GAP = 9;
  const sorted = [...group].sort(
    (a, b) =>
      yPercentOf(a) - yPercentOf(b) ||
      compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = yPercentOf(sorted[i - 1]);
    const cur = yPercentOf(sorted[i]);
    if (cur - prev < MIN_GAP) {
      sorted[i].yPercent = Math.min(92, prev + MIN_GAP);
    }
  }
}

/**
 * Resolve vertical overlaps while staying close to each item's anchor Y.
 * PDF coords: higher Y = toward the top of the page.
 *
 * Three passes:
 *  1. Top → bottom: push later items down when they collide with earlier ones
 *  2. Bottom → top: push earlier items up when a lower clamp caused a pile-up
 *  3. Top → bottom again: clear any overlaps the upward pass introduced
 *
 * The old single pass clamped centers back to minCenter after pushing down,
 * which let two badges sit on the same line near the page bottom.
 */
export function resolveVerticalCollisions(items, { minCenter, maxCenter, gap = 4 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.targetCenter - a.targetCenter);
  const centers = sorted.map((item) => {
    let c = Number(item.targetCenter) || 0;
    if (maxCenter != null) c = Math.min(maxCenter, c);
    if (minCenter != null) c = Math.max(minCenter, c);
    return c;
  });

  const pushDownFrom = (startIdx) => {
    for (let i = startIdx; i < sorted.length; i++) {
      let c = centers[i];
      for (let j = 0; j < i; j++) {
        const maxAllowed =
          centers[j] - sorted[j].height / 2 - gap - sorted[i].height / 2;
        if (c > maxAllowed) c = maxAllowed;
      }
      if (minCenter != null) c = Math.max(minCenter, c);
      centers[i] = c;
    }
  };

  const pushUpFrom = () => {
    for (let i = sorted.length - 1; i >= 0; i--) {
      let c = centers[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const minAllowed =
          centers[j] + sorted[j].height / 2 + gap + sorted[i].height / 2;
        if (c < minAllowed) c = minAllowed;
      }
      if (maxCenter != null) c = Math.min(maxCenter, c);
      centers[i] = c;
    }
  };

  pushDownFrom(0);
  pushUpFrom();
  pushDownFrom(0);

  return sorted.map((item, i) => ({ ...item, center: centers[i] }));
}

export function paperAnchorY(q, pageHeight) {
  const yPct = Math.min(92, Math.max(5, yPercentOf(q)));
  return pageHeight - (pageHeight * yPct) / 100;
}

export function columnAnchorY(q, layout) {
  const yPct = Math.min(92, Math.max(5, yPercentOf(q)));
  return layout.colTop - (yPct / 100) * (layout.colTop - layout.colBottom);
}

/** PDF badge layout constants (match annotatePdf.js). */
// Score box (18) + Q label above (~14) + tick/cross/MCQ letter below (~20).
const PREVIEW_BADGE_BLOCK_H_RATIO = 52 / 842;
const PREVIEW_PAGE_STRIP_RATIO = 28 / 842;
const PREVIEW_BADGE_GAP = 14;

/**
 * Resolve badge Y positions with the same collision logic as annotatePdf.js,
 * returned as yPercent for preview overlay handles.
 * Map keys are stable placement ids (not object references).
 */
export function resolveBadgeYPercentsForPage(questionsOnPage, pageHeight = 842) {
  if (!Array.isArray(questionsOnPage) || questionsOnPage.length === 0) {
    return new Map();
  }

  const height = pageHeight;
  const PAGE_BOTTOM = height * PREVIEW_PAGE_STRIP_RATIO + 6;
  const PAGE_TOP = height - 8;
  const badgeBlockH = height * PREVIEW_BADGE_BLOCK_H_RATIO;

  const sortedQs = [...questionsOnPage].sort(
    (a, b) =>
      yPercentOf(a) - yPercentOf(b) ||
      compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );

  const badgePlacements = resolveVerticalCollisions(
    sortedQs.map((q) => ({
      q,
      targetCenter: paperAnchorY(q, height),
      height: badgeBlockH,
    })),
    {
      minCenter: PAGE_BOTTOM + badgeBlockH / 2,
      maxCenter: PAGE_TOP - badgeBlockH / 2,
      gap: PREVIEW_BADGE_GAP,
    }
  );

  const out = new Map();
  for (const { q, center } of badgePlacements) {
    const yPct = ((height - center) / height) * 100;
    out.set(placementKey(q), Math.min(92, Math.max(5, yPct)));
  }
  return out;
}

/** Sort questions for UI / breakdown: page order, then vertical position, then label. */
export function sortQuestionsByPlacement(questions) {
  if (!Array.isArray(questions)) return [];
  return [...questions].sort((a, b) => {
    const pa = Math.max(1, Number(a?.pageNumber) || 1);
    const pb = Math.max(1, Number(b?.pageNumber) || 1);
    if (pa !== pb) return pa - pb;
    const ya = yPercentOf(a);
    const yb = yPercentOf(b);
    if (ya !== yb) return ya - yb;
    return compareQuestionNumbers(a?.questionNumber, b?.questionNumber);
  });
}
