/**
 * Return All queue: papers without a marking blob must not be queued.
 *
 *   node tests/returnAllQueue/run.mjs
 */

import assert from "assert";
import { buildReturnAllQueue, isSubmissionAlreadyReturned } from "../../src/utils/returnAllQueue.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ok  " + name);
    passed += 1;
  } catch (err) {
    console.log("  FAIL " + name + "\n       " + err.message);
    failed += 1;
  }
}

console.log("returnAllQueue");

test("skips light rows that have hasResult but no marking blob", () => {
  const { bulkQueue, batchQueue } = buildReturnAllQueue({
    savedResults: {
      sub1: { hasResult: true, returnedAt: null },
    },
    allStudents: [{ submissionId: "sub1", name: "Ada" }],
  });
  assert.equal(bulkQueue.length, 0);
  assert.equal(batchQueue.length, 0);
});

test("queues a saved paper that has a result blob and was not returned", () => {
  const { bulkQueue } = buildReturnAllQueue({
    savedResults: {
      sub1: {
        hasResult: true,
        result: { questions: [{ questionNumber: "1", marksAwarded: 1, maxMarks: 1 }] },
        returnedAt: null,
      },
    },
    allStudents: [{ submissionId: "sub1", name: "Ada" }],
  });
  assert.equal(bulkQueue.length, 1);
  assert.equal(bulkQueue[0].submissionId, "sub1");
});

test("already-returned papers stay out of the queue", () => {
  const saved = {
    returnedAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T11:00:00.000Z",
  };
  assert.equal(isSubmissionAlreadyReturned({ saved }), true);
});

test("re-queues when marking changed after return", () => {
  const saved = {
    returnedAt: "2026-09-01T12:00:00.000Z",
    teacherEditedAt: "2026-09-02T12:00:00.000Z",
  };
  assert.equal(isSubmissionAlreadyReturned({ saved }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
