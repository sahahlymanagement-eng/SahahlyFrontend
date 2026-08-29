/**
 * A teacher changes a grade — does it reach the annotated PDF?
 *
 *   node tests/gradeEditToPdf/run.mjs
 *
 * WHAT THIS PROTECTS
 *
 * The chain from a typed mark to the badge on the script runs through four
 * separate pieces, and a break in any one of them leaves a teacher looking at a
 * PDF that disagrees with the marks they just entered:
 *
 *   1. questionsHavePendingEdits    — notices the mark changed, which is what
 *                                     enables the "Save & regenerate PDF" hint;
 *   2. applyTeacherEditsToResult    — carries the new mark into the result and
 *                                     re-derives the paper total from the rows;
 *   3. syncExaminerFeedback         — rewrites "Awarded 2/4" so the sentence
 *                                     under the badge cannot contradict it;
 *   4. annotatePdf                  — draws it.
 *
 * The interaction with the mark-scheme answer block is pinned here too: raising
 * a question to full marks must REMOVE that block, because a question that lost
 * nothing has nothing to correct. That coupling is easy to break by touching
 * either feature alone.
 *
 * Source is bundled with esbuild for the same reason as
 * tests/manualQuestionWorkflow — these modules use extensionless relative
 * imports that Node cannot resolve directly.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { build } from "esbuild";

let passed = 0;
let failed = 0;
function section(name) { console.log("\n" + name); }
function test(name, fn) {
  try { fn(); console.log("  ok  " + name); passed += 1; }
  catch (err) { console.log("  FAIL " + name + "\n       " + err.message); failed += 1; }
}

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const root = path.resolve(here, "..", "..");
const entry = path.join(here, "_entry.generated.mjs");
const bundle = path.join(here, "_bundle.generated.mjs");

fs.writeFileSync(entry, [
  `export { applyTeacherEditsToResult, questionsHavePendingEdits, sanitizeQuestionForStudentPdf } from ${JSON.stringify(path.join(root, "src/utils/markingFormData.js"))};`,
  `export { annotatePdf } from ${JSON.stringify(path.join(root, "src/utils/annotatePdf.js"))};`,
  `export { PDFDocument, StandardFonts } from "pdf-lib";`,
].join("\n"));

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
  logLevel: "silent",
  absWorkingDir: root,
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE_URL: "http://localhost:6001/api" }) },
});

const {
  applyTeacherEditsToResult,
  questionsHavePendingEdits,
  sanitizeQuestionForStudentPdf,
  annotatePdf,
  PDFDocument,
  StandardFonts,
} = await import("file://" + bundle.replace(/\\/g, "/"));

/** A written question the AI marked down. */
const marked = (over = {}) => ({
  questionNumber: "4",
  maxMarks: 4,
  marksAwarded: 1,
  pageNumber: 1,
  yPercent: 40,
  markedKeywords: [],
  missingKeywords: ["units omitted"],
  studentAnswer: "x = 4",
  correctAnswer: "x = 4 cm, with the unit stated as the mark scheme requires.",
  reason: "Awarded 1/4 marks. The unit was missing.",
  checklist: { answerIsBlank: false },
  ...over,
});

const baseResult = () => ({
  questions: [marked()],
  totalMarks: 1,
  finalObtainedMarks: 1,
});

// ------------------------------------------------------- 1. the edit is seen
section("1. the edit is noticed");

test("REGRESSION: raising a mark counts as a pending edit", () => {
  // This is what enables the "Save & regenerate PDF" prompt. If it returns
  // false, the teacher gets no hint that the PDF is now out of date.
  const confirmed = { questions: [marked()] };
  const edited = [marked({ marksAwarded: 4 })];
  assert.strictEqual(questionsHavePendingEdits(edited, confirmed), true);
});

test("an unchanged paper reports no pending edits", () => {
  const confirmed = { questions: [marked()] };
  assert.strictEqual(questionsHavePendingEdits([marked()], confirmed), false);
});

test("adding a question counts as a pending edit", () => {
  const confirmed = { questions: [marked()] };
  const edited = [marked(), marked({ questionNumber: "5" })];
  assert.strictEqual(questionsHavePendingEdits(edited, confirmed), true);
});

// --------------------------------------------------- 2. the edit is applied
section("2. the edit reaches the result");

test("REGRESSION: the new mark lands on the question", () => {
  const out = applyTeacherEditsToResult(baseResult(), [marked({ marksAwarded: 4 })], 4);
  assert.strictEqual(out.questions[0].marksAwarded, 4);
});

test("REGRESSION: the paper total is re-derived, not left stale", () => {
  // The cover score box reads this. Left stale, the badge says 4/4 and the
  // cover still says 1.
  const out = applyTeacherEditsToResult(baseResult(), [marked({ marksAwarded: 4 })], 4);
  assert.strictEqual(out.totalMarks, 4);
});

test("REGRESSION: the examiner note is rewritten to match the new mark", () => {
  // Without this the note under the badge still reads "Awarded 1/4 marks"
  // beside a 4/4 badge — the exact contradiction syncExaminerFeedback exists
  // to prevent.
  const out = applyTeacherEditsToResult(baseResult(), [marked({ marksAwarded: 4 })], 4);
  assert.ok(
    !/Awarded 1\/4/.test(out.questions[0].reason),
    "the note still quotes the old mark: " + out.questions[0].reason
  );
});

test("lowering a mark is carried through too", () => {
  const out = applyTeacherEditsToResult(baseResult(), [marked({ marksAwarded: 0 })], 4);
  assert.strictEqual(out.questions[0].marksAwarded, 0);
  assert.strictEqual(out.totalMarks, 0);
});

// ------------------------------------------------------- 3. the PDF redraws
section("3. the PDF reflects it");

const makeScript = async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595.28, 841.89]).drawText("page 1", { x: 60, y: 760, size: 14, font });
  return new File([await doc.save()], "student.pdf", { type: "application/pdf" });
};

const render = async (questions) =>
  annotatePdf({
    studentFile: await makeScript(),
    questions,
    maxTotalMarks: 4,
    summary: "grade edit test",
    skipCompress: true,
  });

const out = {};
{
  const lost = applyTeacherEditsToResult(baseResult(), [marked({ marksAwarded: 1 })], 4);
  const full = applyTeacherEditsToResult(baseResult(), [marked({ marksAwarded: 4 })], 4);
  out.lost = await render(lost.questions);
  out.full = await render(full.questions);
  out.fullNoScheme = await render(
    full.questions.map((q) => ({ ...q, correctAnswer: "" }))
  );
}

test("a regenerated PDF renders without throwing", () => {
  assert.ok(out.lost.length > 1000 && out.full.length > 1000);
});

test("REGRESSION: full marks removes the mark scheme answer block", () => {
  // The coupling between the two features. A question that lost nothing has
  // nothing to correct, so raising it to full marks must drop the block —
  // otherwise a student is handed the model answer for a question they got
  // completely right.
  assert.strictEqual(
    out.full.length,
    out.fullNoScheme.length,
    "the mark scheme answer was still drawn after the question reached full marks"
  );
});

test("REGRESSION: a question that lost marks still prints the block", () => {
  // The other half of the same coupling — proves the test above is not passing
  // simply because the block never draws at all.
  const lostHasBlock = out.lost.length > out.full.length;
  assert.ok(lostHasBlock, "the block did not appear on a question that lost marks");
});

fs.rmSync(entry, { force: true });
fs.rmSync(bundle, { force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
