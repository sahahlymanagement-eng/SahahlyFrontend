/**
 * Canonical display order + scope flags for the correction panel.
 *
 * WHAT DECIDES THE ORDER
 * The left-hand correction list must read in the same order as the paper the
 * student actually sat, not in whatever order the marking model happened to
 * emit rows, and not re-sorted numerically.
 *
 *   1. Question paper uploaded  -> `assignmentInventory.includedItems` is
 *      already in question-paper order (the backend's questionPaperScope.js
 *      rebuilds it that way during pairing, stamping sequenceOrder 1..n).
 *   2. No question paper        -> the same array, but built from the mark
 *      scheme, so it carries the mark scheme's own order.
 *
 * Either way the inventory IS the canonical order, so this module needs no
 * knowledge of which of the two produced it.
 *
 * Rows the inventory does not know about (the marking model graded something
 * off-list) are never dropped — they sort after the known rows, keeping their
 * physical placement order, and are flagged so a human can judge them.
 *
 * Deliberately dependency-free: the caller injects its own placement sort, so
 * this file can be imported directly by tests/questionDisplayOrder/run.mjs
 * without pulling in React or the api client.
 */

/** Mirror of the backend's normalizeRef (assignmentQuestionInventory.js). */
export function normalizeQuestionKey(value) {
  const s = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!s) return "";
  return s.startsWith("q") ? s.slice(1) : s;
}

/** The label an inventory item is known by on the student's page. */
function inventoryItemLabels(item) {
  const printed = [item?.printedQuestion, item?.printedPart].filter(Boolean).join("");
  return [item?.msReference, printed].filter(Boolean);
}

/**
 * Map every known question label -> its canonical 0-based position.
 * Both the mark-scheme reference and the printed label point at the same slot,
 * so a paper that renumbers still resolves.
 */
export function buildInventoryOrderIndex(assignmentInventory) {
  const items = Array.isArray(assignmentInventory?.includedItems)
    ? assignmentInventory.includedItems
    : [];
  const index = new Map();

  items.forEach((item, i) => {
    const declared = Number(item?.sequenceOrder);
    const position = Number.isFinite(declared) && declared > 0 ? declared - 1 : i;
    for (const label of inventoryItemLabels(item)) {
      const key = normalizeQuestionKey(label);
      // First writer wins: a duplicate label must not drag the row backwards.
      if (key && !index.has(key)) index.set(key, position);
    }
  });

  return index;
}

/**
 * Canonical position for one graded row, or null when the inventory has never
 * heard of it.
 *
 * Falls back to the nearest parent: a row graded as "4a(i)" when the inventory
 * only lists "4a" inherits 4a's slot instead of being exiled to the unknown
 * bucket. Longest prefix wins so "4a" beats "4" for "4a(i)".
 */
export function inventoryPositionOf(question, orderIndex) {
  if (!orderIndex || orderIndex.size === 0) return null;

  const candidates = [
    question?.questionNumber,
    question?.msQuestionNumber,
    question?.printedQuestionNumber,
  ];

  for (const candidate of candidates) {
    const key = normalizeQuestionKey(candidate);
    if (key && orderIndex.has(key)) return orderIndex.get(key);
  }

  for (const candidate of candidates) {
    const key = normalizeQuestionKey(candidate);
    if (!key) continue;
    let best = null;
    let bestLen = 0;
    for (const [known, position] of orderIndex) {
      if (known.length < bestLen || !key.startsWith(known) || key === known) continue;
      // Require the extra characters to start a part letter, so "1" is never
      // treated as the parent of "10c" (same rule as backend isParentOf).
      if (!/[a-z]/.test(key.charAt(known.length))) continue;
      best = position;
      bestLen = known.length;
    }
    if (best !== null) return best;
  }

  return null;
}

/**
 * Order graded rows by the canonical question order.
 *
 * @param {object[]} questions
 * @param {object|null} assignmentInventory
 * @param {{fallbackSort?: (rows: object[]) => object[]}} [opts]
 *        `fallbackSort` is the viewer's existing physical-placement sort. It
 *        orders the whole list when there is no inventory, and orders the
 *        off-inventory tail when there is one.
 */
export function orderQuestionsByInventory(questions, assignmentInventory, opts = {}) {
  const rows = Array.isArray(questions) ? questions : [];
  const sortFallback = typeof opts.fallbackSort === "function" ? opts.fallbackSort : (r) => r;

  const orderIndex = buildInventoryOrderIndex(assignmentInventory);
  if (orderIndex.size === 0) return sortFallback(rows);

  const known = [];
  const unknown = [];
  for (const q of rows) {
    const position = inventoryPositionOf(q, orderIndex);
    if (position === null) unknown.push(q);
    else known.push({ q, position });
  }

  // Stable within a shared slot (sub-parts inheriting one parent) by keeping
  // the caller's incoming order as the tiebreak.
  known.forEach((entry, i) => { entry.seq = i; });
  known.sort((a, b) => a.position - b.position || a.seq - b.seq);

  return [...known.map((entry) => entry.q), ...sortFallback(unknown)];
}

/** Normalized labels the pairing pass could not find on the question paper. */
export function buildMarkSchemeOnlyKeys(prunedQuestions) {
  const keys = new Set();
  for (const entry of Array.isArray(prunedQuestions) ? prunedQuestions : []) {
    const key = normalizeQuestionKey(entry?.msLabel);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Attach the two scope flags the reviewer needs beside each question. Returns
 * new row objects; the input is never mutated.
 *
 *   _scopeFlags.notAnswered    - the model found no answer for this question
 *                                (a backfilled stub, or an explicitly blank
 *                                row). "We did not find this", not "wrong".
 *   _scopeFlags.markSchemeOnly - this question exists in the mark scheme but
 *                                was not found on the question paper, so it
 *                                may not have been asked at all.
 *   _scopeFlags.offInventory   - graded but absent from the assignment's
 *                                question list entirely.
 */
export function annotateQuestionScopeFlags(questions, opts = {}) {
  const rows = Array.isArray(questions) ? questions : [];
  const { assignmentInventory = null, prunedQuestions = null, isBackfilledStub = null } = opts;

  const orderIndex = buildInventoryOrderIndex(assignmentInventory);
  const msOnlyKeys = buildMarkSchemeOnlyKeys(prunedQuestions);

  return rows.map((q) => {
    const stub = typeof isBackfilledStub === "function" ? isBackfilledStub(q) : q?._backfilled === true;
    const blank = q?.checklist?.answerIsBlank === true;
    const key = normalizeQuestionKey(q?.questionNumber);

    const flags = {
      notAnswered: Boolean(stub || blank),
      notDetected: Boolean(stub),
      markSchemeOnly: Boolean(key && msOnlyKeys.has(key)),
      offInventory: orderIndex.size > 0 && inventoryPositionOf(q, orderIndex) === null,
    };

    const any = flags.notAnswered || flags.markSchemeOnly || flags.offInventory;
    return any ? { ...q, _scopeFlags: flags } : q;
  });
}
