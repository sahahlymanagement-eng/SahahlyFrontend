/**
 * Offline checks for correction-panel question ordering and scope flags.
 *
 *   node tests/questionDisplayOrder/run.mjs
 *
 * Unlike tests/normalizeQuestionPlacement (which mirrors its algorithm because
 * the real module pulls in app deps), src/utils/questionDisplayOrder.js is
 * deliberately dependency-free, so this imports the REAL implementation.
 *
 * What this protects:
 *   - the correction list follows the QUESTION PAPER's order when one was
 *     uploaded, and the MARK SCHEME's order when one wasn't — never a
 *     numeric/alphabetical re-sort, and never the model's emission order;
 *   - a question the student did not answer is flagged rather than dropped;
 *   - a question that exists only in the mark scheme (never found on the
 *     question paper) is flagged as such, since it may not have been asked.
 */

import assert from "assert";
import {
  normalizeQuestionKey,
  buildInventoryOrderIndex,
  inventoryPositionOf,
  orderQuestionsByInventory,
  buildMarkSchemeOnlyKeys,
  annotateQuestionScopeFlags,
} from "../../src/utils/questionDisplayOrder.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}
function section(t) {
  console.log(`\n${t}`);
}

/** Inventory item as questionPaperScope.js / the extraction pass emits it. */
function item(msReference, sequenceOrder, extra = {}) {
  return { msReference, sequenceOrder, maxMarks: 2, ...extra };
}
/** A graded row as the marking model returns it. */
function row(questionNumber, extra = {}) {
  return { questionNumber, marksAwarded: 1, maxMarks: 2, ...extra };
}
const labels = (rows) => rows.map((r) => r.questionNumber);
/** Stand-in for the viewer's physical-placement sort. */
const byPlacement = (rows) =>
  [...rows].sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));

section("normalizeQuestionKey");

test("strips punctuation, case and a leading Q so 5(a) == 5A == Q5a", () => {
  assert.strictEqual(normalizeQuestionKey("5(a)"), "5a");
  assert.strictEqual(normalizeQuestionKey("5A"), "5a");
  assert.strictEqual(normalizeQuestionKey("Q5a"), "5a");
  assert.strictEqual(normalizeQuestionKey(null), "");
});

section("order follows the question paper when one was uploaded");

test("REGRESSION: a paper printed 5,4,3,1,2 displays in that order, not 1..5", () => {
  // Exactly the adversarial fixture: question-paper order is NOT numeric.
  const inventory = {
    includedItems: [
      item("5", 1),
      item("4a", 2),
      item("4b", 3),
      item("3", 4),
      item("1", 5),
      item("2", 6),
    ],
  };
  // The model emitted them in numeric order — the display must not keep that.
  const graded = [row("1"), row("2"), row("3"), row("4a"), row("4b"), row("5")];
  const out = orderQuestionsByInventory(graded, inventory, { fallbackSort: byPlacement });
  assert.deepStrictEqual(labels(out), ["5", "4a", "4b", "3", "1", "2"]);
});

test("sub-parts stay in question-paper position, not re-sorted alphabetically", () => {
  const inventory = { includedItems: [item("4b", 1), item("4a", 2)] };
  const out = orderQuestionsByInventory([row("4a"), row("4b")], inventory);
  assert.deepStrictEqual(labels(out), ["4b", "4a"]);
});

test("punctuation differences between scheme and model output still match", () => {
  const inventory = { includedItems: [item("5(a)", 1), item("3", 2)] };
  const out = orderQuestionsByInventory([row("3"), row("5a")], inventory);
  assert.deepStrictEqual(labels(out), ["5a", "3"]);
});

section("order falls back to the mark scheme when no question paper exists");

test("with no question paper the same inventory (mark-scheme built) drives the order", () => {
  // Identical code path — the inventory simply came from the mark scheme.
  const inventory = { includedItems: [item("2", 1), item("1", 2)] };
  const out = orderQuestionsByInventory([row("1"), row("2")], inventory);
  assert.deepStrictEqual(labels(out), ["2", "1"]);
});

test("no inventory at all -> the viewer's placement sort decides, unchanged", () => {
  const graded = [row("2", { pageNumber: 2 }), row("1", { pageNumber: 1 })];
  assert.deepStrictEqual(
    labels(orderQuestionsByInventory(graded, null, { fallbackSort: byPlacement })),
    ["1", "2"]
  );
  assert.deepStrictEqual(
    labels(orderQuestionsByInventory(graded, { includedItems: [] }, { fallbackSort: byPlacement })),
    ["1", "2"]
  );
});

section("rows the inventory does not know about");

test("REGRESSION: an off-inventory graded row is kept, sorted after, never dropped", () => {
  const inventory = { includedItems: [item("1", 1), item("2", 2)] };
  const graded = [row("9"), row("2"), row("1")];
  const out = orderQuestionsByInventory(graded, inventory, { fallbackSort: byPlacement });
  assert.deepStrictEqual(labels(out), ["1", "2", "9"]);
  assert.strictEqual(out.length, 3, "nothing may be silently dropped");
});

test("a sub-part graded under a parent the inventory lists inherits the parent's slot", () => {
  const inventory = { includedItems: [item("5", 1), item("4a", 2)] };
  const out = orderQuestionsByInventory([row("4a(i)"), row("5")], inventory, {
    fallbackSort: byPlacement,
  });
  assert.deepStrictEqual(labels(out), ["5", "4a(i)"], "4a(i) inherits 4a's position");
});

test("a top-level number is never treated as the parent of a longer number", () => {
  const index = buildInventoryOrderIndex({ includedItems: [item("1", 1)] });
  assert.strictEqual(inventoryPositionOf(row("10c"), index), null);
});

test("array position is used when sequenceOrder is absent", () => {
  const inventory = { includedItems: [{ msReference: "7" }, { msReference: "6" }] };
  const out = orderQuestionsByInventory([row("6"), row("7")], inventory);
  assert.deepStrictEqual(labels(out), ["7", "6"]);
});

section("scope flags beside each question");

test("REGRESSION: an unanswered/undetected question is flagged, not silently zero", () => {
  const [flagged] = annotateQuestionScopeFlags(
    [row("3", { marksAwarded: 0, _backfilled: true })],
    { assignmentInventory: { includedItems: [item("3", 1)] } }
  );
  assert.strictEqual(flagged._scopeFlags.notAnswered, true);
  assert.strictEqual(flagged._scopeFlags.notDetected, true);
});

test("an explicitly blank answer is flagged as not answered but not as undetected", () => {
  const [flagged] = annotateQuestionScopeFlags(
    [row("2", { marksAwarded: 0, checklist: { answerIsBlank: true } })],
    { assignmentInventory: { includedItems: [item("2", 1)] } }
  );
  assert.strictEqual(flagged._scopeFlags.notAnswered, true);
  assert.strictEqual(flagged._scopeFlags.notDetected, false);
});

test("REGRESSION: a mark-scheme-only question (never found on the paper) is flagged", () => {
  const [flagged] = annotateQuestionScopeFlags([row("6")], {
    assignmentInventory: { includedItems: [item("6", 1)] },
    prunedQuestions: [{ msLabel: "6", reason: "not found in question paper", needsReview: false }],
  });
  assert.strictEqual(flagged._scopeFlags.markSchemeOnly, true);
});

test("a graded row absent from the question list is flagged off-inventory", () => {
  const [flagged] = annotateQuestionScopeFlags([row("9")], {
    assignmentInventory: { includedItems: [item("1", 1)] },
  });
  assert.strictEqual(flagged._scopeFlags.offInventory, true);
});

test("a clean, answered, in-scope question gets no flags object at all", () => {
  const [clean] = annotateQuestionScopeFlags([row("1")], {
    assignmentInventory: { includedItems: [item("1", 1)] },
  });
  assert.strictEqual(clean._scopeFlags, undefined);
});

test("annotate never mutates the caller's rows", () => {
  const original = row("3", { marksAwarded: 0, _backfilled: true });
  annotateQuestionScopeFlags([original], {
    assignmentInventory: { includedItems: [item("3", 1)] },
  });
  assert.strictEqual(original._scopeFlags, undefined);
});

test("buildMarkSchemeOnlyKeys normalizes labels and tolerates junk", () => {
  const keys = buildMarkSchemeOnlyKeys([{ msLabel: "Q6(a)" }, { msLabel: null }, null]);
  assert.strictEqual(keys.has("6a"), true);
  assert.strictEqual(keys.size, 1);
  assert.strictEqual(buildMarkSchemeOnlyKeys(null).size, 0);
});

section("degenerate input");

test("non-array / null input degrades instead of throwing", () => {
  assert.deepStrictEqual(orderQuestionsByInventory(null, null), []);
  assert.deepStrictEqual(annotateQuestionScopeFlags(undefined, {}), []);
  assert.strictEqual(buildInventoryOrderIndex(null).size, 0);
});

section("a label the mark scheme lists twice gets two slots (live: TEST 3 YASSIN lists 5b at seq 2 and 22)");

test("REGRESSION: the second graded 5b lands on the second 5b slot, not beside the first", () => {
  // Exactly the live inventory shape: 5b appears at sequenceOrder 2 and again
  // at 22. With one position per label both rows collapsed onto slot 2 and
  // rendered adjacent (observed in the browser as 5a, 5b, 5b, 5c...), so the
  // mark scheme's own ordering was not reproduced.
  const inventory = {
    includedItems: [
      item("5a", 1),
      item("5b", 2),
      item("5c", 3),
      item("5a(ii)", 21),
      item("5b", 22),
      item("6a", 23),
    ],
  };
  const graded = [row("5a"), row("5b"), row("5b"), row("5c"), row("5a(ii)"), row("6a")];
  const out = orderQuestionsByInventory(graded, inventory, { fallbackSort: byPlacement });
  assert.deepStrictEqual(labels(out), ["5a", "5b", "5c", "5a(ii)", "5b", "6a"]);
});

test("occurrences are handed out in arrival order, first row to the first slot", () => {
  const inventory = { includedItems: [item("2", 1), item("7", 2), item("2", 3)] };
  const first = row("2", { tag: "first" });
  const second = row("2", { tag: "second" });
  const out = orderQuestionsByInventory([first, second, row("7")], inventory);
  assert.deepStrictEqual(labels(out), ["2", "7", "2"]);
  assert.strictEqual(out[0].tag, "first", "the first 2 row keeps the first 2 slot");
  assert.strictEqual(out[2].tag, "second");
});

test("more graded rows than slots: the extras stay on the last slot, none are dropped", () => {
  const inventory = { includedItems: [item("1", 1), item("9", 2)] };
  const out = orderQuestionsByInventory(
    [row("1", { tag: "a" }), row("1", { tag: "b" }), row("1", { tag: "c" }), row("9")],
    inventory
  );
  assert.strictEqual(out.length, 4, "nothing may be dropped");
  assert.deepStrictEqual(labels(out), ["1", "1", "1", "9"]);
});

test("a single-occurrence label is unaffected by slot consumption", () => {
  const inventory = { includedItems: [item("3", 1), item("1", 2), item("2", 3)] };
  const out = orderQuestionsByInventory([row("1"), row("2"), row("3")], inventory);
  assert.deepStrictEqual(labels(out), ["3", "1", "2"]);
});

test("duplicate labels still resolve when the graded row uses different punctuation", () => {
  const inventory = { includedItems: [item("5(b)", 1), item("9", 2), item("5b", 3)] };
  const out = orderQuestionsByInventory([row("5b"), row("5(b)"), row("9")], inventory);
  assert.deepStrictEqual(labels(out), ["5b", "9", "5(b)"]);
});

test("slot consumption never promotes an off-inventory row out of the tail", () => {
  const inventory = { includedItems: [item("1", 1), item("1", 2)] };
  const out = orderQuestionsByInventory(
    [row("99"), row("1"), row("1")],
    inventory,
    { fallbackSort: byPlacement }
  );
  assert.deepStrictEqual(labels(out), ["1", "1", "99"]);
});

test("REGRESSION: an item whose printed label matches its msReference still yields ONE slot", () => {
  // Live data carries printedQuestion/printedPart as well as msReference, and
  // inventoryItemLabels returns both. When the two aliases normalize to the
  // same key the item pushed its position twice, so a twice-listed label gave
  // [1,1,21,21] and the second graded row consumed index 1 - landing back on
  // position 1. The unit fixtures set msReference only, so this only showed up
  // in the browser: the two 5b rows stayed adjacent after the "fix".
  const inventory = {
    includedItems: [
      { msReference: "5a", printedQuestion: "5", printedPart: "a", sequenceOrder: 1, maxMarks: 2 },
      { msReference: "5b", printedQuestion: "5", printedPart: "b", sequenceOrder: 2, maxMarks: 3 },
      { msReference: "5c", printedQuestion: "5", printedPart: "c", sequenceOrder: 3, maxMarks: 2 },
      { msReference: "5b", printedQuestion: "5", printedPart: "b", sequenceOrder: 4, maxMarks: 4 },
      { msReference: "6a", printedQuestion: "6", printedPart: "a", sequenceOrder: 5, maxMarks: 2 },
    ],
  };
  const graded = [row("5a"), row("5b"), row("5b"), row("5c"), row("6a")];
  const out = orderQuestionsByInventory(graded, inventory, { fallbackSort: byPlacement });
  assert.deepStrictEqual(
    labels(out),
    ["5a", "5b", "5c", "5b", "6a"],
    "the second 5b must take the second 5b slot even when printed aliases duplicate it"
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
