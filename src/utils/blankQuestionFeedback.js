/**
 * Human examiner-style feedback for blank / unanswered mark-scheme questions.
 */

export function isBlankQuestion(q) {
  if (!q) return false;
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
    student === "n/a"
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
  const qNum = q.questionNumber != null ? String(q.questionNumber) : "?";
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

export function enrichMarkingQuestions(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.map(enrichBlankQuestionFeedback);
}
