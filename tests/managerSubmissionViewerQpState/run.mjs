/**
 * Offline checks for question-paper / exclusion state sync in
 * src/pages/manager/ManagerSubmissionViewer.jsx.
 *
 *   node tests/managerSubmissionViewerQpState/run.mjs
 *
 * REGRESSION (audit Finding 4): question-paper state (qpInfo, scopeLockedAt,
 * prunedQuestions, excludedQuestions) was populated at the primary assignment-
 * load effect ONLY. Every other branch that switches or reloads the assignment
 * cleared the mark-scheme state but left the question-paper state untouched, so
 * switching assignments kept the PREVIOUS assignment's "scope locked" badge and
 * pruned/excluded lists on screen. A stale scope-lock indicator is worse than a
 * missing one — it claims a safety gate passed for an assignment it never ran
 * against.
 *
 * WHY THIS IS A SOURCE-LEVEL TEST, NOT A COMPONENT TEST:
 * this repo has exactly one frontend test convention (tests/<name>/run.mjs,
 * plain node + assert, no framework — see tests/normalizeQuestionPlacement),
 * and no jsdom / testing-library / test runner is installed. The two helpers
 * under test are defined inside the component and close over useState setters,
 * so they cannot be imported and called directly. Mirroring them into this file
 * (the convention used by normalizeQuestionPlacement) would test a COPY and
 * prove nothing about whether the real branches call them — which is precisely
 * the bug. Asserting against the real source text does catch the real
 * regression: a new switch/reset branch added without the mirror fails here.
 * Introducing a component-test framework was ruled out as scope creep.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(__dirname, "../../src/pages/manager/ManagerSubmissionViewer.jsx"),
  "utf8"
);

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

/** Body of a `const <name> = ...` arrow function, up to the next top-level const. */
function namedFunctionBody(name) {
  const start = SRC.indexOf(`const ${name} = `);
  assert.notStrictEqual(start, -1, `function not found: ${name}`);
  const rest = SRC.slice(start + name.length);
  const nextIdx = rest.indexOf("\n  const ");
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

console.log("\nhelpers exist and are used as a pair");

test("both helpers are defined", () => {
  assert.ok(
    /const applyQuestionPaperStateFrom = \(/.test(SRC),
    "applyQuestionPaperStateFrom must exist"
  );
  assert.ok(
    /const resetQuestionPaperState = \(/.test(SRC),
    "resetQuestionPaperState must exist"
  );
});

test("applyQuestionPaperStateFrom sets all four pieces of state", () => {
  const body = namedFunctionBody("applyQuestionPaperStateFrom");
  for (const setter of [
    "setQpInfo(",
    "setScopeLockedAt(",
    "setPrunedQuestions(",
    "setExcludedQuestions(",
  ]) {
    assert.ok(body.includes(setter), `applyQuestionPaperStateFrom must call ${setter}`);
  }
});

test("resetQuestionPaperState clears all four pieces of state", () => {
  const body = namedFunctionBody("resetQuestionPaperState");
  for (const setter of [
    "setQpInfo(null)",
    "setScopeLockedAt(null)",
    "setPrunedQuestions([])",
    "setExcludedQuestions([])",
  ]) {
    assert.ok(body.includes(setter), `resetQuestionPaperState must call ${setter}`);
  }
});

console.log("\nREGRESSION: every assignment switch/reset branch mirrors the question-paper state");

for (const branch of [
  "selectClassroom",
  "selectAssignment",
  "expandClassroomSection",
  "expandAssignmentSection",
]) {
  test(`${branch} resets question-paper state alongside setMsInfo(null)`, () => {
    const body = namedFunctionBody(branch);
    assert.ok(body.includes("setMsInfo(null)"), `${branch} should still clear msInfo`);
    assert.ok(
      body.includes("resetQuestionPaperState()"),
      `${branch} clears mark-scheme state but NOT question-paper state — stale scope-lock bug`
    );
  });
}

test("the deep-link branch populates from the full assignment doc, not just resets", () => {
  // The assignments-list endpoint does not .select(), so `assignment` there is
  // the whole doc and carries every field these helpers read.
  assert.ok(
    /applyQuestionPaperStateFrom\(assignment\)/.test(SRC),
    "deep-link branch must call applyQuestionPaperStateFrom(assignment)"
  );
});

test("the primary load effect still populates from /full", () => {
  assert.ok(
    /applyQuestionPaperStateFrom\(a\)/.test(SRC),
    "primary load effect must call applyQuestionPaperStateFrom(a)"
  );
});

console.log("\nguard against a future unmirrored branch");

test("every setMsInfo(null) reset sits near a question-paper state call", () => {
  // Heuristic by design: a ±14-line window around each reset. Precise enough to
  // fail loudly when someone adds a new switch/reset branch and forgets the
  // mirror (the exact Finding 4 regression), without needing a JS parser.
  //
  // Comments are blanked first (line-length preserved so line numbers in the
  // failure message stay accurate): prose mentioning setMsInfo(null) — such as
  // resetQuestionPaperState's own doc comment — is not a call site.
  const codeOnly = SRC
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  const lines = codeOnly.split("\n");
  const WINDOW = 14;
  const offenders = [];

  lines.forEach((line, i) => {
    if (!line.includes("setMsInfo(null)")) return;
    const from = Math.max(0, i - WINDOW);
    const to = Math.min(lines.length, i + WINDOW + 1);
    const near = lines.slice(from, to).join("\n");
    if (
      !near.includes("resetQuestionPaperState()") &&
      !near.includes("applyQuestionPaperStateFrom(")
    ) {
      offenders.push(i + 1);
    }
  });

  assert.deepStrictEqual(
    offenders,
    [],
    `setMsInfo(null) at line(s) ${offenders.join(", ")} has no question-paper state call nearby — ` +
      "a new branch was added without mirroring the question-paper/exclusion reset"
  );
});

test("the /markscheme response is never used to populate question-paper state", () => {
  // GET /:assignmentId/markscheme returns only {fileId, webLink}. Populating
  // from it would silently set scopeLockedAt/pruned/excluded to a guessed empty
  // state and render a confidently-wrong indicator.
  assert.ok(
    !/applyQuestionPaperStateFrom\(\s*msRes/.test(SRC),
    "must not populate question-paper state from the /markscheme response"
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
