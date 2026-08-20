/**
 * Offline checks for badge collision resolution.
 * Algorithm mirrored from frontend/src/utils/normalizeQuestionPlacement.js
 * (resolveVerticalCollisions) — keep in sync when that function changes.
 *
 *   node tests/normalizeQuestionPlacement/run.mjs
 */

import assert from "assert";

function resolveVerticalCollisions(items, { minCenter, maxCenter, gap = 4 } = {}) {
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

function overlaps(a, b, gap) {
  const aTop = a.center + a.height / 2;
  const aBot = a.center - a.height / 2;
  const bTop = b.center + b.height / 2;
  const bBot = b.center - b.height / 2;
  return !(aBot >= bTop + gap || bBot >= aTop + gap);
}

function assertNoOverlaps(placed, gap) {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      assert.ok(
        !overlaps(placed[i], placed[j], gap),
        `items ${i} and ${j} still overlap (centers ${placed[i].center}, ${placed[j].center})`
      );
    }
  }
}

const H = 52;
const GAP = 14;
const PAGE_BOTTOM = 30;
const PAGE_TOP = 800;

{
  const items = [40, 41, 42, 43].map((yPct, i) => ({
    id: i,
    targetCenter: PAGE_TOP - (yPct / 100) * (PAGE_TOP - PAGE_BOTTOM),
    height: H,
  }));
  const placed = resolveVerticalCollisions(items, {
    minCenter: PAGE_BOTTOM + H / 2,
    maxCenter: PAGE_TOP - H / 2,
    gap: GAP,
  });
  assert.strictEqual(placed.length, 4);
  assertNoOverlaps(placed, GAP);
  console.log("  ok  clustered anchors are spaced apart");
}

{
  const items = [85, 86, 87, 88, 89].map((yPct, i) => ({
    id: i,
    targetCenter: PAGE_TOP - (yPct / 100) * (PAGE_TOP - PAGE_BOTTOM),
    height: H,
  }));
  const placed = resolveVerticalCollisions(items, {
    minCenter: PAGE_BOTTOM + H / 2,
    maxCenter: PAGE_TOP - H / 2,
    gap: GAP,
  });
  assertNoOverlaps(placed, GAP);
  console.log("  ok  bottom-of-page pile does not self-overlap");
}

{
  const items = [20, 40, 60].map((yPct, i) => ({
    id: i,
    targetCenter: PAGE_TOP - (yPct / 100) * (PAGE_TOP - PAGE_BOTTOM),
    height: H,
  }));
  const placed = resolveVerticalCollisions(items, {
    minCenter: PAGE_BOTTOM + H / 2,
    maxCenter: PAGE_TOP - H / 2,
    gap: GAP,
  });
  assertNoOverlaps(placed, GAP);
  for (let i = 0; i < items.length; i++) {
    assert.ok(
      Math.abs(placed[i].center - items[i].targetCenter) < 1,
      `well-spaced item ${i} should keep its anchor`
    );
  }
  console.log("  ok  well-spaced anchors stay put");
}

console.log("normalizeQuestionPlacement collisions: all passed");
