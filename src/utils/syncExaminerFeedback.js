/**
 * Keep examiner-facing copy (PDF note, earned/missing lines) consistent with
 * the marks a teacher just set. Without this, changing 0/5 → 5/5 still left
 * "Awarded 0/5. Not attempted" and red Missing lines on the script.
 */

const AWARD_LEAD_RE =
  /^(?:Awarded\s+\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?(?:\s+marks?)?(?:\s+for\s+Q[^\s.]+)?\.?\s*|Full marks awarded(?:\s+for\s+Q[^\s.]+)?\.?\s*|No marks awarded(?:\s+for\s+Q[^\s.]+)?(?:\s+[—\-–]\s+review[^.]+)?\.?\s*)/i;

const BLANK_CLAUSE_RE =
  /(?:Q[^\s]*\s+)?(?:was\s+)?(?:not attempted|left blank|unanswered)(?:\s*\([^)]*\))?\.?\s*|Question left blank[^.]*\.\s*|no (?:working or )?(?:final )?answer(?: was)? provided[^.]*\.\s*|Please ensure every question is answered[^.]*\.?\s*/gi;

const NEGATIVE_REST_RE =
  /\b(missing|incorrect|wrong|not awarded|no marks|failed to|did not|didn't)\b/i;

const POSITIVE_REST_RE = /\b(full marks|correct(?:ly)?|neat working)\b/i;

const STANDARD_BLANK_ANSWER_RE =
  /^(question left blank|not attempted|blank|unanswered|no answer provided)\b/i;

function qNumOf(q) {
  return q?.questionNumber != null && String(q.questionNumber).trim()
    ? String(q.questionNumber).trim()
    : "?";
}

export function awardLeadForMarks(awarded, max, qNum) {
  const aw = Math.max(0, Number(awarded) || 0);
  const mx = Math.max(0, Number(max) || 0);
  const label = qNum || "?";
  if (mx > 0 && aw >= mx) return `Full marks awarded for Q${label}.`;
  if (aw === 0) return `Awarded 0/${mx} marks.`;
  return `Awarded ${aw}/${mx} marks.`;
}

export function stripAwardLead(reason) {
  return String(reason || "").replace(AWARD_LEAD_RE, "").trim();
}

function stripBlankClauses(text) {
  return String(text || "")
    .replace(BLANK_CLAUSE_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\s]+/, "")
    .trim();
}

function joinLead(lead, rest) {
  if (!rest) return lead;
  return `${lead} ${rest}`;
}

function cleanKeywordList(list) {
  return Array.isArray(list) ? list.map((s) => String(s).trim()).filter(Boolean) : [];
}

/**
 * @param {object} question
 * @param {"prefix"|"full"} [mode]
 *   prefix — rewrite only the Awarded/Full/No-marks lead (safe while typing).
 *   full — also drop contradictory blank/missing copy and earned/missing lines.
 */
export function alignExaminerFeedbackToMarks(question, mode = "full") {
  if (!question || typeof question !== "object") return question;

  let awarded = Math.max(0, Number(question.marksAwarded) || 0);
  const max = Math.max(0, Number(question.maxMarks) || 0);
  const qNum = qNumOf(question);

  // Blank flag + positive marks is a model contradiction. Prefer the blank
  // flag (zero the award) — never clear answerIsBlank just to match marks.
  let next = { ...question };
  if (awarded > 0 && next.checklist?.answerIsBlank) {
    awarded = 0;
    next.marksAwarded = 0;
    if (Array.isArray(next.markPoints)) {
      next.markPoints = next.markPoints.map((p) => ({ ...p, awarded: false }));
    }
    const isMcq =
      next.isMcq === true ||
      String(next.questionType || "").toLowerCase() === "mcq";
    if (isMcq) {
      next.studentFinalAnswer = "Not attempted";
      const student = String(next.studentAnswer || "").trim();
      if (!student || STANDARD_BLANK_ANSWER_RE.test(student)) {
        next.studentAnswer = "Not attempted";
      }
    }
    next.checklist = {
      ...next.checklist,
      answerIsBlank: true,
      studentAnswerUnderstanding: false,
    };
  }

  const lead = awardLeadForMarks(awarded, max, qNum);
  const full = max > 0 && awarded >= max;

  let rest = stripAwardLead(next.reason);
  if (awarded > 0) rest = stripBlankClauses(rest);
  if (full && NEGATIVE_REST_RE.test(rest)) rest = "";
  if (mode === "full" && awarded === 0 && POSITIVE_REST_RE.test(rest)) rest = "";
  if (awarded === 0 && next.checklist?.answerIsBlank && !rest) {
    rest = "Answer was blank / not attempted.";
  }

  next = {
    ...next,
    marksAwarded: awarded,
    reason: joinLead(lead, rest),
  };

  if (full) {
    next.missingKeywords = [];
  }

  if (awarded > 0) {
    const student = String(next.studentAnswer || "").trim();
    if (student && STANDARD_BLANK_ANSWER_RE.test(student)) {
      next.studentAnswer = "";
    }
  }

  if (mode !== "full") return next;

  if (awarded === 0) {
    next.markedKeywords = [];
  } else {
    next.markedKeywords = cleanKeywordList(next.markedKeywords);
    next.missingKeywords = cleanKeywordList(next.missingKeywords);
  }

  return next;
}

export function syncExaminerFeedbackWithMarks(question, { mode = "full" } = {}) {
  return alignExaminerFeedbackToMarks(question, mode);
}

function questionKey(q, index) {
  const s = String(q?.questionNumber ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return s || `idx:${index}`;
}

/** Full-align rows whose marks/max changed vs a previous snapshot. */
export function syncQuestionsExaminerFeedback(questions, previousQuestions = []) {
  const prevMap = new Map();
  (previousQuestions || []).forEach((q, i) => {
    prevMap.set(questionKey(q, i), q);
  });

  return (questions || []).map((q, i) => {
    const prev = prevMap.get(questionKey(q, i)) || previousQuestions[i];
    const marksChanged =
      !prev ||
      Number(prev.marksAwarded) !== Number(q.marksAwarded) ||
      Number(prev.maxMarks) !== Number(q.maxMarks);
    return marksChanged ? alignExaminerFeedbackToMarks(q, "full") : q;
  });
}
