/**
 * Fix rows where the model flagged answerIsBlank but also recorded a real
 * student answer (often identical to the mark-scheme answer — e.g. True/True).
 * Twin of backend/src/utils/reconcileBlankFlagContradictions.js.
 *
 * Must NOT promote empty / not-attempted rows to full marks when the model
 * pasted the mark-scheme answer into studentAnswer while still calling it blank.
 */

const GENERIC_BLANK_ANSWER_RE =
  /^(question left blank|left blank|not attempted|blank|unanswered|no answer provided|not answered|n\/?a|none)\.?$/i;

function compactAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function normalizeComparableAnswer(value) {
  const raw = String(value ?? "").trim();
  if (!raw || GENERIC_BLANK_ANSWER_RE.test(raw)) return "";
  const compact = compactAnswer(raw);
  if (compact === "true" || compact === "t") return "true";
  if (compact === "false" || compact === "f") return "false";
  return compact;
}

function pickStudentAnswer(q) {
  const final = String(q?.studentFinalAnswer ?? "").trim();
  const student = String(q?.studentAnswer ?? "").trim();
  if (final && !GENERIC_BLANK_ANSWER_RE.test(final)) return final;
  if (student && !GENERIC_BLANK_ANSWER_RE.test(student)) return student;
  return "";
}

export function answersMatch(student, correct) {
  const a = normalizeComparableAnswer(student);
  const b = normalizeComparableAnswer(correct);
  return Boolean(a && b && a === b);
}

function reasonAdmitsBlank(reason) {
  return /left blank|not attempted|no answer|unanswered|blank space|not answered|question left blank|no (box|option) marked|none visible/i.test(
    String(reason || "")
  );
}

function isClosedShortMatch(student, correct) {
  const a = normalizeComparableAnswer(student);
  const b = normalizeComparableAnswer(correct);
  if (!a || !b || a !== b) return false;
  if (a === "true" || a === "false") return true;
  if (/^[a-e]$/i.test(a)) return true;
  return false;
}

function hasAwardedEvidence(q) {
  const keywords = (Array.isArray(q?.markedKeywords) ? q.markedKeywords : []).filter(
    Boolean
  );
  if (keywords.length > 0) return true;
  const points = Array.isArray(q?.markPoints) ? q.markPoints : [];
  return points.some(
    (p) =>
      (p?.awarded === true || String(p?.awarded).toLowerCase() === "true") &&
      String(p?.evidence || "").trim().length > 2
  );
}

export function reconcileBlankFlagContradictions(questions) {
  if (!Array.isArray(questions)) return questions;

  return questions.map((q) => {
    if (!q || q?.checklist?.answerIsBlank !== true) return q;

    const max = Math.max(0, Number(q.maxMarks) || 0);
    const student = pickStudentAnswer(q);
    const correct = String(q.correctAnswer ?? "").trim();
    const awarded = Math.max(0, Number(q.marksAwarded) || 0);
    const qNum = String(q.questionNumber ?? "").trim() || "?";

    if (!student) return q;
    if (reasonAdmitsBlank(q.reason)) return q;

    const matching = correct && answersMatch(student, correct);
    const hasEvidence = hasAwardedEvidence(q);

    if (!matching && !hasEvidence) return q;

    let nextMarks = awarded;
    if (matching && max > 0) {
      if (hasEvidence || (awarded === 0 && isClosedShortMatch(student, correct))) {
        nextMarks = max;
      } else {
        return q;
      }
    }

    let reason = String(q.reason || "").trim();
    if (matching && nextMarks === max && max > 0) {
      reason = `Full marks awarded for Q${qNum}. Student answer matches the mark scheme.`;
    } else if (hasEvidence) {
      reason = reason.replace(
        /Answer was blank \/ not attempted\.?/i,
        "Answer recorded on the script."
      );
    }

    const next = {
      ...q,
      marksAwarded: nextMarks,
      reason,
      checklist: {
        ...(q.checklist || {}),
        answerIsBlank: false,
        studentAnswerUnderstanding: matching || awarded > 0 || hasEvidence,
      },
      _blankFlagRecovered: true,
    };

    if (matching && nextMarks === max && max > 0 && Array.isArray(next.markPoints) && next.markPoints.length) {
      next.markPoints = next.markPoints.map((p) => ({ ...p, awarded: true }));
    }

    return next;
  });
}
