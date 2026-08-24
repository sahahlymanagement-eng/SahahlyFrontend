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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
