/**
 * Human examiner-style feedback for blank / unanswered mark-scheme questions.
 */

import { looksLikePlausibleQuestionNumber } from "./markingQuestionDedupe";

export function looksLikePageSplitDeferral(q) {
  if (!q) return false;
  if (q.continuesOnNextPage === true) return true;
  const blob = `${q.reason || ""} ${q.studentAnswer || ""} ${q.mistakeAdvice || ""}`;
  return /on the subsequent page|on the (next|following) page|answer options.{0,60}(next|following) page|stem.{0,80}(next|following) page|cannot be awarded.{0,50}this page|options (are|is) on the next|selection (is|are) on the subsequent/i.test(
    blob
  );
}

function stripLeadingQ(label) {
  const s = String(label || "").trim();
  const m = s.match(/^[Qq](\d.*)$/);
  return m ? m[1] : s;
}

function isOrphanPartLabel(label) {
  const s = String(label || "")
    .trim()
    .replace(/[()[\]\s]/g, "")
    .toLowerCase();
  return /^[a-zivx]{1,4}$/i.test(s);
}

/**
 * Prefer the fuller mark-scheme id over a bare page-local part.
 * Classified sheets often print "(a)" under Q19 — models set printedQuestionNumber
 * to "a" while questionNumber is "19a"; overlays must show "19a", not "a".
 *
 * When printed is only the parent number ("9") and MS is the part ("9a"), show
 * "9a" — otherwise PDF stamps collapse to Q9 while notes still say Q9a.
 */
function preferDeeperPartLabel(a, b) {
  const norm = (v) =>
    String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const pa = norm(a);
  const pb = norm(b);
  if (!pa && !pb) return "";
  if (!pa) return String(b || "");
  if (!pb) return String(a || "");
  const childOf = (parent, child) => {
    if (!parent || !child || parent === child || !child.startsWith(parent)) return false;
    return /[a-z]/.test(child.charAt(parent.length));
  };
  if (childOf(pa, pb)) return String(b);
  if (childOf(pb, pa)) return String(a);
  return null;
}

export function overlayQuestionLabel(q) {
  const printedRaw = stripLeadingQ(q?.printedQuestionNumber);
  const printed = looksLikePlausibleQuestionNumber(printedRaw) ? printedRaw : "";
  const ms = stripLeadingQ(q?.questionNumber);
  const printedKey = printed.toLowerCase().replace(/[()[\]\s]/g, "");
  const msKey = ms.toLowerCase().replace(/[()[\]\s]/g, "");

  if (printed && printedKey && printedKey !== msKey) {
    const deeper = preferDeeperPartLabel(printed, ms);
    if (deeper) return deeper;

    const printedOrphan = isOrphanPartLabel(printedKey);
    const msHasDigit = /\d/.test(msKey);
    if (printedOrphan && msHasDigit) return ms || printed;
    if (printedOrphan && msKey.endsWith(printedKey) && msKey.length > printedKey.length) {
      return ms;
    }
    return printed;
  }
  return ms || "?";
}

export function isBlankQuestion(q) {
  if (!q) return false;
  // A backfilled / never-matched stub means nobody read the answer, not that the
  // student left it empty. Twin of the backend guard in
  // backend/src/utils/blankQuestionFeedback.js.
  if (q._notMarked === true || q.checklist?.notMarked === true) return false;
  if (q.continuesOnNextPage === true) return false;
  if (looksLikePageSplitDeferral(q)) return false;
  const awarded = Number(q.marksAwarded) || 0;
  const max = Number(q.maxMarks) || 0;
  if (max <= 0) return false;

  if (q.checklist?.answerIsBlank === true) return true;

  const student = String(q.studentAnswer || "").trim().toLowerCase();
  if (
    student === "not attempted" ||
    student === "blank" ||
    student === "unanswered" ||
    student === "no answer" ||
    student === "n/a" ||
    student.includes("question left blank") ||
    student.includes("no formula was provided") ||
    student.includes("no answer provided")
  ) {
    return true;
  }

  if (awarded === 0 && !student) return true;

  const reason = String(q.reason || "").trim().toLowerCase();
  if (
    awarded === 0 &&
    (reason.includes("not attempted") ||
      reason.includes("left blank") ||
      reason.includes("no answer") ||
      reason.includes("unanswered"))
  ) {
    return true;
  }

  return false;
}

function reasonIsTerse(reason, max) {
  const text = String(reason || "").trim();
  if (!text) return true;
  if (text.length < 45) return true;
  if (/^0\s*\/\s*\d/.test(text)) return true;
  if (/^awarded\s*0\s*\/\s*\d+\s*\.?\s*$/i.test(text)) return true;
  if (new RegExp(`^awarded\\s*0\\s*/\\s*${max}\\s*\\.?\\s*$`, "i").test(text)) return true;
  return false;
}

export function enrichBlankQuestionFeedback(q) {
  if (!isBlankQuestion(q)) return q;

  const max = Math.max(0, Number(q.maxMarks) || 0);
  // Same label the badge shows — see qNumOf in syncExaminerFeedback.js.
  const qNum = String(overlayQuestionLabel(q) || "") || "?";
  const topic = q.studyTopic ? String(q.studyTopic).trim() : "";
  const correct = q.correctAnswer ? String(q.correctAnswer).trim() : "";

  const next = { ...q };

  const currentStudent = String(next.studentAnswer || "").trim();
  if (
    !currentStudent ||
    /^not attempted$/i.test(currentStudent) ||
    /^blank$/i.test(currentStudent)
  ) {
    next.studentAnswer =
      "Question left blank — no working or final answer was provided on the script.";
  }

  const missing = Array.isArray(next.missingKeywords)
    ? next.missingKeywords.filter(Boolean)
    : [];
  if (!missing.length) {
    if (correct) {
      next.missingKeywords = [`Complete response expected: ${correct}`];
    } else {
      next.missingKeywords = [
        "Full answer required as set out in the mark scheme",
      ];
    }
  } else {
    next.missingKeywords = missing;
  }

  next.markedKeywords = Array.isArray(next.markedKeywords)
    ? next.markedKeywords.filter(Boolean)
    : [];

  if (reasonIsTerse(next.reason, max)) {
    const topicBit = topic ? ` (${topic})` : "";
    const expectedBit = correct
      ? `The mark scheme expects: ${correct}.`
      : "A complete response is required according to the mark scheme.";
    next.reason =
      `Awarded 0/${max} marks. Q${qNum} was not attempted${topicBit}. ` +
      `${expectedBit} Please ensure every question is answered on future work — ` +
      "method marks may still be available when working is shown.";
  }

  if (!String(next.mistakeAdvice || "").trim()) {
    next.mistakeAdvice = correct
      ? `Revise ${topic || "this topic"} and practise similar questions. Model approach: ${correct.slice(0, 140)}`
      : "Attempt every question on the paper, even when unsure — show working where possible.";
  }

  next.checklist = {
    ...(next.checklist || {}),
    answerIsBlank: true,
    studentAnswerUnderstanding: false,
  };

  return next;
}

function enrichZeroMarkFeedback(q) {
  const awarded = Number(q.marksAwarded) || 0;
  const max = Number(q.maxMarks) || 0;
  if (awarded > 0 || max <= 0) return q;
  if (isBlankQuestion(q)) return enrichBlankQuestionFeedback(q);
  if (!reasonIsTerse(q.reason, max)) return q;

  // Same label the badge shows — see qNumOf in syncExaminerFeedback.js.
  const qNum = String(overlayQuestionLabel(q) || "") || "?";
  const correct = q.correctAnswer ? String(q.correctAnswer).trim() : "";
  return {
    ...q,
    reason: correct
      ? `Awarded 0/${max} marks for Q${qNum}. The mark scheme expects: ${correct}.`
      : `Awarded 0/${max} marks for Q${qNum}. See the mark scheme for the expected response.`,
  };
}

export function enrichMarkingQuestions(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.map(enrichZeroMarkFeedback);
}

/**
 * Blank / unanswered rows that still cost marks (0 awarded) — listed in the
 * grading report "left unanswered" box. Rows with a real pageNumber are still
 * stamped on the script; backfilled stubs stay off the pages.
 */
export function isReportOnlyBlankQuestion(q, { isBackfilledStub } = {}) {
  if (!q || !isBlankQuestion(q)) return false;
  if (Number(q.marksAwarded) > 0) return false;
  if (typeof isBackfilledStub === "function" && isBackfilledStub(q)) return false;
  return true;
}

/** Badge / overlay rows on the student script.
 * Inventory / backfilled stubs are NEVER stamped on the exam pages — they only
 * appear in the grading report at the front. Genuine blanks with a real page
 * stay placeable so unanswered work on the script can still be marked. */
export function isPlaceableScriptQuestion(q, { isBackfilledStub } = {}) {
  if (!q) return false;
  const isStub =
    q._backfilled === true ||
    (typeof isBackfilledStub === "function" && isBackfilledStub(q));
  if (isStub) return false;
  const pageOk = Number(q.pageNumber) >= 1;
  if (isBlankQuestion(q) && !pageOk) return false;
  return true;
}

/** Top-level unanswered summary for the marking JSON + PDF report box. */
export function summarizeUnansweredQuestions(questions, { isBackfilledStub } = {}) {
  const blanks = (questions || []).filter((q) =>
    isReportOnlyBlankQuestion(q, { isBackfilledStub })
  );
  // Overlay label, so the "left unanswered" box names the same Q the badge on
  // the page does.
  const questionNumbers = blanks
    .map((q) => String(overlayQuestionLabel(q) ?? "").trim())
    .filter((s) => s && s !== "?");
  const marksDeducted = blanks.reduce(
    (sum, q) => sum + (Number(q.maxMarks) || 0),
    0
  );
  const count = questionNumbers.length;
  const listed = questionNumbers.join(", ");
  return {
    questionNumbers,
    count,
    marksDeducted,
    message:
      count === 0
        ? null
        : count === 1
          ? `The student has left question ${listed} unanswered — ${marksDeducted} mark(s) deducted.`
          : `The student has left questions ${listed} unanswered — ${marksDeducted} mark(s) deducted.`,
  };
}
