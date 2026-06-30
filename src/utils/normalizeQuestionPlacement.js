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

/** True when model yPercent values look unreliable (common with flash-lite / 2.5). */
export function placementLooksUnreliable(questions) {
  if (!Array.isArray(questions) || questions.length <= 1) return false;

  const sorted = [...questions].sort((a, b) =>
    compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );
  const yValues = sorted.map(yPercentOf);
  const spread = Math.max(...yValues) - Math.min(...yValues);

  if (spread < 12) return true;

  const atDefault = yValues.filter((y) => Math.abs(y - 30) < 4).length;
  if (atDefault >= sorted.length * 0.6) return true;

  const bottomCluster = yValues.filter((y) => y > 68).length;
  if (bottomCluster >= sorted.length * 0.7) return true;

  const topCluster = yValues.filter((y) => y < 25).length;
  if (topCluster >= sorted.length * 0.7) return true;

  let inversions = 0;
  for (let i = 1; i < yValues.length; i++) {
    if (yValues[i] < yValues[i - 1] - 6) inversions++;
  }
  if (inversions >= Math.max(1, Math.ceil(sorted.length / 3))) return true;

  return false;
}

/**
 * On one page, questions run top-to-bottom in order.
 * Give each question its own vertical slot so feedback sits beside it.
 */
function assignVerticalSlotsBesideQuestions(group) {
  const sorted = [...group].sort((a, b) =>
    compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );
  const n = sorted.length;
  sorted.forEach((q, i) => {
    const yPercent = n === 1 ? 45 : Math.round(10 + (i / (n - 1)) * 78);
    q.yPercent = Math.min(92, Math.max(8, yPercent));
  });
}

/**
 * Fix vertical placement when 2.5 returns bad yPercent (e.g. everything at the bottom).
 * Keeps each question on its assigned page — only adjusts height on that page.
 * Good 3.1 coordinates are preserved.
 */
export function normalizeQuestionPlacement(questions, studentPageCount = null) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;

  const globalUnreliable = placementLooksUnreliable(questions);

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

  for (const group of byPage.values()) {
    if (globalUnreliable || placementLooksUnreliable(group)) {
      assignVerticalSlotsBesideQuestions(group);
    }
  }

  return questions;
}

/** Resolve vertical overlaps while staying close to anchor Y (PDF coords: high Y = top). */
export function resolveVerticalCollisions(items, { minCenter, maxCenter, gap = 4 } = {}) {
  const sorted = [...items].sort((a, b) => b.targetCenter - a.targetCenter);
  const resolved = [];

  for (const item of sorted) {
    let center = item.targetCenter;
    if (maxCenter != null) center = Math.min(maxCenter, center);
    if (minCenter != null) center = Math.max(minCenter, center);

    for (const prev of resolved) {
      const maxAllowed =
        prev.center - prev.height / 2 - gap - item.height / 2;
      if (center > maxAllowed) center = maxAllowed;
    }

    if (minCenter != null) center = Math.max(minCenter, center);
    resolved.push({ ...item, center });
  }

  return resolved;
}

export function paperAnchorY(q, pageHeight) {
  const yPct = Math.min(92, Math.max(5, yPercentOf(q)));
  return pageHeight - (pageHeight * yPct) / 100;
}

export function columnAnchorY(q, layout) {
  const yPct = Math.min(92, Math.max(5, yPercentOf(q)));
  return layout.colTop - (yPct / 100) * (layout.colTop - layout.colBottom);
}
