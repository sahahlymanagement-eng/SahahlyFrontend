/**
 * The workflow a teacher or assistant actually follows when the AI misses a
 * question.
 *
 *   node tests/manualQuestionWorkflow/run.mjs
 *
 * WHAT THIS PROTECTS
 *
 * A hand-added question used to reach the annotated PDF as a mark badge and
 * nothing else. The row carried no question text and no student answer, so the
 * examiner column printed a score beside an empty block - which read, to the
 * person who had just typed it in, as though the question had never been added
 * at all.
 *
 * Three separate gates had to open for it to appear, and missing any one of
 * them still produces a blank block:
 *
 *   1. the factory has to STORE what the teacher typed;
 *   2. the student-PDF sanitiser has to PRESERVE it;
 *   3. annotatePdf has to PRINT it - and that check is duplicated, once where
 *      the lines are measured and once where they are drawn.
 *
 * The tests below walk that chain in order, then render a real PDF as a smoke
 * check. They also pin the opposite case: an ORDINARY AI-marked row must not
 * start printing its question text, because the annotation is stamped on the
 * student's own script and the question is already there.
 *
 * Unlike tests/questionDisplayOrder, the modules here pull in app dependencies
 * with extensionless imports, so the source is bundled first (esbuild is
 * already a dependency) rather than imported directly.
 */

import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { build } from "esbuild";

let passed = 0;
let failed = 0;
function section(name) { console.log("\n" + name); }
function test(name, fn) {
  try { fn(); console.log("  ok  " + name); passed += 1; }
  catch (err) { console.log("  FAIL " + name + "\n       " + err.message); failed += 1; }
}

// ---------------------------------------------------------------- load source
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
// Both live inside the project: esbuild resolves bare imports (pdf-lib)
// relative to the importing FILE, so an entry in the system temp directory
// cannot see node_modules. Removed at the end of the run.
const entry = path.join(here, "_entry.generated.mjs");
const bundle = path.join(here, "_bundle.generated.mjs");

fs.writeFileSync(entry, [
  `export { createManualQuestion, sanitizeQuestionForStudentPdf } from ${JSON.stringify(path.join(root, "src/utils/markingFormData.js"))};`,
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
  // Resolve bare imports (pdf-lib) against the project, not the temp dir the
  // entry file lives in.
  absWorkingDir: root,
  // markingFormData reaches axios transitively, and axios' form-data uses a
  // dynamic require that an ESM bundle cannot satisfy on its own.
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
  // src/api/api.js reads import.meta.env, which does not exist outside Vite.
  define: { "import.meta.env": JSON.stringify({ VITE_API_BASE_URL: "http://localhost:6001/api" }) },
});

const {
  createManualQuestion,
  sanitizeQuestionForStudentPdf,
  annotatePdf,
  PDFDocument,
  StandardFonts,
} = await import(pathToFileURL(bundle).href);

/** What the Add-question form hands to createManualQuestion. */
const typedByTeacher = {
  questionNumber: "7b",
  maxMarks: 3,
  marksAwarded: 2,
  pageNumber: 2,
  printedStem: "Explain why the reaction rate increases when the temperature is raised.",
  studentAnswer: "The rate doubles because the temperature rose by 10 degrees.",
  reason: "Correct idea, but the units were missing.",
};

// ---------------------------------------------------------------- 1. factory
section("1. the factory stores what the teacher typed");

test("REGRESSION: the question text is kept", () => {
  const q = createManualQuestion(typedByTeacher);
  assert.strictEqual(q.printedStem, typedByTeacher.printedStem);
});

test("REGRESSION: the student's answer is kept", () => {
  const q = createManualQuestion(typedByTeacher);
  assert.strictEqual(q.studentAnswer, typedByTeacher.studentAnswer);
});

test("REGRESSION: the row is marked _manual", () => {
  // Every downstream gate keys off this flag. Without it the row is treated as
  // an ordinary AI row and prints nothing extra.
  assert.strictEqual(createManualQuestion(typedByTeacher)._manual, true);
});

test("an answered question is NOT recorded as blank", () => {
  // answerIsBlank used to be hardcoded false regardless of what was typed.
  const q = createManualQuestion(typedByTeacher);
  assert.strictEqual(q.checklist.answerIsBlank, false);
});

test("REGRESSION: an empty answer with NO marks is recorded as blank", () => {
  const q = createManualQuestion({ ...typedByTeacher, studentAnswer: "", marksAwarded: 0 });
  assert.strictEqual(q.checklist.answerIsBlank, true);
});

test("REGRESSION: an empty answer that SCORED is not blank", () => {
  // A teacher who awards marks without typing the answer has judged something
  // was there. Calling that blank would tell the student they left it empty.
  const q = createManualQuestion({ ...typedByTeacher, studentAnswer: "", marksAwarded: 2 });
  assert.strictEqual(q.checklist.answerIsBlank, false);
});

test("marks and page survive", () => {
  const q = createManualQuestion(typedByTeacher);
  assert.strictEqual(q.marksAwarded, 2);
  assert.strictEqual(q.maxMarks, 3);
  assert.strictEqual(q.pageNumber, 2);
});

test("omitting the optional fields still yields a usable row", () => {
  const q = createManualQuestion({ questionNumber: "9", maxMarks: 2, marksAwarded: 1 });
  assert.strictEqual(q.printedStem, "");
  assert.strictEqual(q.studentAnswer, "");
  assert.ok(q.reason, "no fallback feedback was generated");
});

// ---------------------------------------------------------------- 2. sanitiser
section("2. the student-PDF sanitiser preserves them");

test("REGRESSION: the question text survives sanitising", () => {
  // This step rewrites staff-only wording before a student sees the PDF. It
  // must not treat a teacher's typed question as internal copy.
  const s = sanitizeQuestionForStudentPdf(createManualQuestion(typedByTeacher));
  assert.strictEqual(s.printedStem, typedByTeacher.printedStem);
});

test("REGRESSION: the student's answer survives sanitising", () => {
  const s = sanitizeQuestionForStudentPdf(createManualQuestion(typedByTeacher));
  assert.strictEqual(s.studentAnswer, typedByTeacher.studentAnswer);
});

test("the _manual flag survives sanitising", () => {
  const s = sanitizeQuestionForStudentPdf(createManualQuestion(typedByTeacher));
  assert.strictEqual(s._manual, true);
});

// ---------------------------------------------------------------- 3. the PDF
section("3. the annotated PDF renders it");

const makeScript = async (pages = 2) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    doc.addPage([595.28, 841.89]).drawText(`page ${i}`, { x: 60, y: 760, size: 14, font });
  }
  return new File([await doc.save()], "student.pdf", { type: "application/pdf" });
};

const render = async (questions) =>
  annotatePdf({
    studentFile: await makeScript(),
    questions,
    maxTotalMarks: 10,
    summary: "workflow test",
    skipCompress: true,
  });

const results = {};
{
  const full = createManualQuestion(typedByTeacher);
  const noStem = createManualQuestion({ ...typedByTeacher, printedStem: "" });
  const noAnswer = createManualQuestion({ ...typedByTeacher, studentAnswer: "" });
  const aiRow = {
    questionNumber: "1", maxMarks: 2, marksAwarded: 2, pageNumber: 1, yPercent: 20,
    markedKeywords: ["correct"], missingKeywords: [],
    printedStem: "An ordinary AI row stem that must never print.",
    studentAnswer: "an ordinary AI marked row",
    reason: "Full marks awarded.",
    checklist: { answerIsBlank: false },
  };
  results.full = await render([full]);
  results.noStem = await render([noStem]);
  results.noAnswer = await render([noAnswer]);
  results.aiOnly = await render([aiRow]);
  // The same AI row with its stem removed. If the stem is correctly ignored
  // for AI rows, both renders are byte-identical in length.
  results.aiNoStem = await render([{ ...aiRow, printedStem: "" }]);
  results.aiPlusManual = await render([aiRow, full]);
}

test("a manual row renders without throwing", () => {
  assert.ok(results.full.length > 1000, "PDF suspiciously small");
});

test("REGRESSION: typing the question makes the PDF bigger", () => {
  // The only signal available without parsing the content stream: the block is
  // present when the text is, absent when it is not.
  assert.ok(
    results.full.length > results.noStem.length,
    "PDF did not grow when a question was typed - the stem block is not being drawn"
  );
});

test("REGRESSION: typing the answer makes the PDF bigger", () => {
  assert.ok(
    results.full.length > results.noAnswer.length,
    "PDF did not grow when an answer was typed - the answer block is not being drawn"
  );
});

test("REGRESSION: an ordinary AI row does NOT print its question text", () => {
  // The annotation is stamped on the student's own script, so the question is
  // already in front of them. Printing every stem would fill the column with
  // what the reader is already looking at. Same row, with and without a stem:
  // identical output means the stem was ignored, which is what we want.
  assert.strictEqual(
    results.aiOnly.length,
    results.aiNoStem.length,
    "an AI row printed its question text - the stem block is not scoped to manual rows"
  );
});

section("4. the mark scheme answer is printed when marks were lost");

const solved = {};
{
  const wrong = {
    questionNumber: "4", maxMarks: 4, marksAwarded: 1, pageNumber: 1, yPercent: 40,
    markedKeywords: [], missingKeywords: ["units omitted"],
    studentAnswer: "x = 4",
    correctAnswer: "x = 4 cm, with the unit stated as the mark scheme requires.",
    reason: "Awarded 1/4 marks. The unit was missing.",
    checklist: { answerIsBlank: false },
  };
  solved.wrong = await render([wrong]);
  solved.wrongNoScheme = await render([{ ...wrong, correctAnswer: "" }]);
  solved.full = await render([{ ...wrong, marksAwarded: 4, missingKeywords: [] }]);
  solved.fullNoScheme = await render([
    { ...wrong, marksAwarded: 4, missingKeywords: [], correctAnswer: "" },
  ]);
  // blankQuestionFeedback already writes the scheme answer into the note for
  // untouched blanks. Printing it again in its own block is the duplication
  // this render must not produce.
  const quoted =
    "Awarded 1/4 marks. x = 4 cm, with the unit stated as the mark scheme requires.";
  solved.staffCopy = await render([
    { ...wrong, correctAnswer: "Question not detected during automated marking - please review manually." },
  ]);
  solved.inNote = await render([{ ...wrong, reason: quoted }]);
  solved.inNoteNoScheme = await render([{ ...wrong, correctAnswer: "", reason: quoted }]);
}

test("REGRESSION: a written answer that lost marks prints the scheme answer", () => {
  // The point of the change: before it, a written row showed only what was
  // missing and never what the right answer was, so a student read "final
  // value wrong" with no way to learn the value. MCQs had shown it all along.
  assert.ok(
    solved.wrong.length > solved.wrongNoScheme.length,
    "the mark scheme answer was not drawn for a written question that lost marks"
  );
});

test("REGRESSION: a full-marks row does NOT print the scheme answer", () => {
  // Nothing to correct. Same row with and without correctAnswer must match.
  assert.strictEqual(
    solved.full.length,
    solved.fullNoScheme.length,
    "the scheme answer was drawn on a full-marks row - it is not gated on lost marks"
  );
});

test("REGRESSION: staff-only boilerplate in the field is not shown to a student", () => {
  // The field was staff-only for written questions until this change, so what
  // sits in it on older rows has never been read by a student.
  assert.strictEqual(
    solved.staffCopy.length,
    solved.wrongNoScheme.length,
    "staff review boilerplate was printed to the student as a mark scheme answer"
  );
});

test("REGRESSION: the scheme answer is not printed twice when the note quotes it", () => {
  assert.strictEqual(
    solved.inNote.length,
    solved.inNoteNoScheme.length,
    "the scheme answer was printed in its own block as well as inside the note"
  );
});

test("adding a manual row does not disturb the AI row", () => {
  assert.ok(
    results.aiPlusManual.length > results.aiOnly.length,
    "adding a manual question did not add anything to the PDF"
  );
});

fs.rmSync(entry, { force: true });
fs.rmSync(bundle, { force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
