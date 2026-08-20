import { estimateMarkingCost } from "./markingCost";
import { canViewMoneyCostsFromStorage } from "./moneyVisibility";
import { questionRowHasEdits, criteriaGradeHasEdits } from "./markingQuestionEdits";
import { isBackfilledStub } from "./backfilledStub";
import {
  isReportOnlyBlankQuestion,
  summarizeUnansweredQuestions,
  isPlaceableScriptQuestion,
} from "./blankQuestionFeedback";
import {
  alignExaminerFeedbackToMarks,
  syncQuestionsExaminerFeedback,
} from "./syncExaminerFeedback";

export { prepareEditingQuestions } from "./recoverMisassignedAnswers";

export function modalSubmissionId(modal) {
  return modal?.submissionId || modal?.student?.submissionId || null;
}

export function isSameSubmissionModal(modal, submissionId) {
  const openId = modalSubmissionId(modal);
  return openId != null && submissionId != null && String(openId) === String(submissionId);
}

function attachEstimatedCost(result, geminiModel, tokenUsage, options) {
  if (!canViewMoneyCostsFromStorage()) return;
  if (!tokenUsage || !geminiModel) return;
  const cost = estimateMarkingCost(geminiModel, tokenUsage, options);
  if (!cost) return;
  result.estimatedCost = cost;
  result.estimatedCostUsd = cost.usd;
  result.estimatedCostEgp = cost.egp;
  if (options?.batch) result.batchPricing = true;
  if (options?.priority) result.priorityPricing = true;
}

/** Attach assignment context for backend logging (person comes from JWT only). */
export function appendMarkingContext(formData, { assignmentId, classroomId } = {}) {
  if (assignmentId) formData.append("assignmentId", assignmentId);
  if (classroomId) formData.append("classroomId", classroomId);
}



export function currentUserId() {

  try {

    const user = JSON.parse(localStorage.getItem("user") || "{}");

    return user?.id || null;

  } catch {

    return null;

  }

}



/** Coerce guidance/prompt values to a safe trimmed string. */

export function normalizeGuidance(value) {

  if (value == null) return "";

  if (typeof value === "string") return value.trim();

  return String(value).trim();

}



/** Return trimmed guidance for FormData, or null when empty. */

export function guidanceForForm(value) {

  const text = normalizeGuidance(value);

  return text || null;

}

/** Prefer explicit guidance; fall back to assignment-specific saved prompt. */
export function resolveMarkingGuidanceText(userGuidance, assignmentPrompt) {
  const explicit = normalizeGuidance(userGuidance);
  if (explicit) return explicit;
  return normalizeGuidance(assignmentPrompt);
}



/** Read a useful API error message (including JSON-in-blob error bodies). */

export function formatGoogleOAuthError(raw) {
  const text = String(raw ?? "").trim();
  const lower = text.toLowerCase();
  if (
    lower.includes("invalid_grant") ||
    lower.includes("invalid_request") ||
    lower.includes("token has been expired or revoked")
  ) {
    return "Google sign-in expired or was revoked. Ask the director to reconnect the Gmail account under Director → Google Accounts.";
  }
  if (lower.includes("refresh token")) {
    return "Google sign-in expired for this classroom. Ask the director to reconnect the Gmail account under Google Accounts.";
  }
  return text;
}

/** Strip vendor names from messages shown in toasts/modals. */
function scrubProviderNames(text) {
  if (text == null || text === "") return text;
  let out = String(text);
  out = out.replace(/\bOpenAI\b/gi, "AI");
  out = out.replace(/\bChatGPT\b/gi, "AI");
  out = out.replace(/\bGemini\b/gi, "AI");
  out = out.replace(/\bClaude\b/gi, "AI");
  out = out.replace(/https?:\/\/platform\.openai\.com\/[^\s)]+/gi, "your AI billing settings");
  out = out.replace(/\bGEMINI_API_KEY\b/g, "API key");
  out = out.replace(/\bOPENAI_API_KEY\b/g, "API key");
  return out;
}

export async function getApiErrorMessage(err) {

  const data = err?.response?.data;

  // Multer file upload limit errors surface a raw message like:
  // "Total file size exceeds the limit of 50MB".
  // Replace it so prompt-generation/upload UI doesn't show that hard error string.
  const directMsg = String(
    err?.message ||
      data?.message ||
      data?.error ||
      data?.errors?.[0]?.message ||
      ""
  );
  if (/total file size exceeds the limit of\s*50\s*mb/i.test(directMsg)) {
    return "Selected files are too large for AI marking (max 50MB total). Please upload fewer submissions or smaller PDFs.";
  }

  if (data instanceof Blob) {

    try {

      const text = await data.text();

      try {

        const parsed = JSON.parse(text);

        return scrubProviderNames(
          formatGoogleOAuthError(parsed.message || parsed.error || text) || text || err.message
        );

      } catch {

        return scrubProviderNames(formatGoogleOAuthError(text) || text || err.message);

      }

    } catch {

      return scrubProviderNames(formatGoogleOAuthError(err.message) || err.message || "Request failed");

    }

  }

  if (data && typeof data === "object") {
    const msg = data.message || data.error;
    if (msg) {
      if (/total file size exceeds the limit of\s*50\s*mb/i.test(String(msg))) {
        return "Selected files are too large for AI marking (max 50MB total). Please upload fewer submissions or smaller PDFs.";
      }
      return scrubProviderNames(formatGoogleOAuthError(msg));
    }
  }

  if (
    err?.code === "ECONNABORTED" ||
    /timed?\s*out|timeout of \d+ms exceeded/i.test(String(err?.message || ""))
  ) {
    return "Request timed out. The server may still be working — wait a moment and refresh, or try again with fewer submissions.";
  }

  return scrubProviderNames(formatGoogleOAuthError(err?.message) || err?.message || "Request failed");

}



/** Ensure a downloaded blob is a real PDF before sending to marking. */

export async function assertPdfBlob(blob, label = "PDF") {

  if (!(blob instanceof Blob)) {

    throw new Error(`${label}: invalid file response`);

  }



  if (blob.size < 100) {

    let message = `${label}: file is missing or empty`;

    try {

      const text = await blob.text();

      const parsed = JSON.parse(text);

      if (parsed.message) message = parsed.message;

    } catch {

      // keep default message

    }

    throw new Error(message);

  }



  const head = await blob.slice(0, 4).text();

  if (!head.startsWith("%PDF")) {

    throw new Error(`${label}: no PDF attachment found for this submission`);

  }

}



export function hasTeacherEdits(originalQuestions, editingQuestions) {

  if (!Array.isArray(originalQuestions) || !Array.isArray(editingQuestions)) return false;

  const origMap = new Map(
    originalQuestions.map((q) => [String(q.questionNumber), q])
  );

  for (const q of editingQuestions) {

    const orig = origMap.get(String(q.questionNumber));

    if (!orig) return true;

    if (Number(q.marksAwarded) !== Number(orig.marksAwarded)) return true;

    if (String(q.reason || "").trim() !== String(orig.reason || "").trim()) return true;

  }

  return false;

}



/** Resolve overall summary from live AI result and/or DB-persisted sources. */
export function normalizeMarkingSummaryBullets(summary) {
  const text = String(summary || "").trim();
  if (!text) return "";

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => /^[•\-*]/.test(line));
  if (bulletLines.length >= 2) {
    return bulletLines
      .map((line) => (line.startsWith("•") ? line : `• ${line.replace(/^[\-*]\s*/, "")}`))
      .slice(0, 6)
      .join("\n");
  }

  const chunks = text
    .replace(/\s*After review:\s*/gi, "\n")
    .replace(/\s*Marks were lost on:\s*/gi, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim().replace(/^[•\-*]\s*/, ""))
    .filter((part) => part.length > 8);

  if (!chunks.length) return text;

  return chunks
    .slice(0, 5)
    .map((part) => `• ${part}`)
    .join("\n");
}

export function getMarkingResultSummary(result, { storedSummary, studentSummary } = {}) {
  const fromResult =
    (typeof result?.summary === "string" && result.summary.trim()) ||
    (typeof result?.criteriaGrade?.summary === "string" && result.criteriaGrade.summary.trim()) ||
    "";
  if (fromResult) return normalizeMarkingSummaryBullets(fromResult);

  const fromStored =
    (typeof storedSummary === "string" && storedSummary.trim()) ||
    "";
  if (fromStored) return normalizeMarkingSummaryBullets(fromStored);

  const fromStudent = (typeof studentSummary === "string" && studentSummary.trim()) || "";
  return fromStudent ? normalizeMarkingSummaryBullets(fromStudent) : "";
}

export function sumQuestionMarks(questions) {
  return (questions || []).reduce(
    (sum, q) => sum + (Number(q.marksAwarded) || 0),
    0
  );
}

const STAFF_ONLY_COPY_PATTERNS = [
  /added manually by teacher/i,
  /question not detected during automated marking/i,
  /was not detected during automated marking/i,
  /please verify the student'?s script/i,
  /please review manually/i,
  /please review the script manually/i,
  /added manually after automated marking/i,
  /adjust marks and feedback as needed/i,
];

/** True when copy is meant for staff/QC only — must not appear on student PDFs. */
export function isStaffOnlyCopy(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return STAFF_ONLY_COPY_PATTERNS.some((re) => re.test(t));
}

function studentFacingReasonForQuestion(q) {
  const max = Math.max(0, Number(q.maxMarks) || 0);
  const aw = Math.max(0, Number(q.marksAwarded) || 0);
  const qNum = q.questionNumber != null ? String(q.questionNumber) : "?";
  if (max > 0 && aw >= max) return `Full marks awarded for Q${qNum}.`;
  if (aw === 0) {
    const topic = q.studyTopic ? String(q.studyTopic).trim() : "";
    return topic
      ? `No marks awarded — review ${topic}.`
      : `No marks awarded for Q${qNum}.`;
  }
  return `Awarded ${aw}/${max} marks for Q${qNum}.`;
}

/** Strip internal staff/QC wording before rendering a returned student PDF. */
export function sanitizeQuestionForStudentPdf(q) {
  if (!q) return q;
  const next = { ...q };

  if (isStaffOnlyCopy(next.studentAnswer)) {
    next.studentAnswer =
      Number(next.marksAwarded) > 0
        ? ""
        : "Question left blank — no answer provided.";
  }

  if (isStaffOnlyCopy(next.reason)) {
    next.reason = studentFacingReasonForQuestion(next);
  }

  if (next.reason) {
    next.reason = String(next.reason).replace(/\(ticked\)/gi, "(marked)");
  }

  if (next._manual && next.checklist) {
    next.checklist = { ...next.checklist, answerIsBlank: false };
  }

  return alignExaminerFeedbackToMarks(next, "prefix");
}

export function sanitizeQuestionsForStudentPdf(questions) {
  return (questions || []).map(sanitizeQuestionForStudentPdf);
}

/** Total marks for annotatePdf cover + score box — always matches edited rows. */
export function resolveAnnotatePdfTotalMarks({
  questions = [],
  criteriaGrade = null,
  markingMode = "normal",
  result = null,
} = {}) {
  if (result?.finalObtainedMarks != null && Number.isFinite(Number(result.finalObtainedMarks))) {
    return Number(result.finalObtainedMarks);
  }
  if (markingMode === "criteria" && criteriaGrade) {
    if (Array.isArray(criteriaGrade.breakdown) && criteriaGrade.breakdown.length) {
      return sumQuestionMarks(criteriaGrade.breakdown);
    }
    if (criteriaGrade.totalMarks != null && criteriaGrade.totalMarks !== "") {
      return Number(criteriaGrade.totalMarks) || 0;
    }
  }
  return sumQuestionMarks(questions);
}

/** Authoritative grade from per-question marks when available. */
export function resolveTotalMarksFromResult(result) {
  if (!result) return null;

  if (result.finalObtainedMarks != null && Number.isFinite(Number(result.finalObtainedMarks))) {
    return Number(result.finalObtainedMarks);
  }

  if (Array.isArray(result.questions) && result.questions.length > 0) {
    return sumQuestionMarks(result.questions);
  }

  const breakdown = result.criteriaGrade?.breakdown;
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    return sumQuestionMarks(breakdown);
  }

  const stored =
    result.criteriaGrade?.totalMarks ??
    result.totalMarks ??
    null;
  return stored != null ? Number(stored) : null;
}

export function totalMarksMismatchInfo(result) {
  if (!result) return null;

  const questions = Array.isArray(result.questions)
    ? result.questions
    : Array.isArray(result.criteriaGrade?.breakdown)
      ? result.criteriaGrade.breakdown
      : null;

  if (!questions?.length) return null;

  const paperTotal = sumQuestionMarks(questions);
  const coverRaw = result.criteriaGrade?.totalMarks ?? result.totalMarks;
  if (coverRaw == null || coverRaw === "") return null;

  const coverTotal = Number(coverRaw);
  if (!Number.isFinite(coverTotal)) return null;
  if (coverTotal === paperTotal) return null;

  return {
    coverTotal,
    paperTotal,
    message: `Cover page total ${coverTotal} does not match paper total ${paperTotal}`,
  };
}

/**
 * Structural equality for two marking results.
 *
 * Used to decide whether a save is worth making at all. Deliberately
 * conservative: reporting "different" when they match only costs a save that
 * would have happened anyway, while reporting "same" when they differ would
 * silently drop somebody's marking — so this compares serialised form, which
 * can say "different" over key order but can never say "same" wrongly.
 */
export function markingResultsAreIdentical(a, b) {
  // Nullish first: "nothing on either side" is not something to skip a save
  // over, and an identity check would call two absent results a match.
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Grade for a saved MarkingResult row (DB totalMarks + nested result). */
export function resolveSavedMarkingGrade(savedRow) {
  if (!savedRow) return null;
  const fromResult = resolveTotalMarksFromResult(savedRow.result);
  if (fromResult != null) return fromResult;
  const stored = savedRow.totalMarks;
  return stored != null ? Number(stored) : null;
}

export function gradeScorePercent(total, max) {
  const t = Number(total) || 0;
  const m = Number(max) || 0;
  return m > 0 ? Math.round((t / m) * 100) : 0;
}

/** Rebuild overall summary as short bullet points when marks or feedback change. */
export function rebuildMarkingSummary({
  questions = [],
  maxTotalMarks,
  previousSummary = "",
} = {}) {
  const total = sumQuestionMarks(questions);
  const max = Math.max(1, Number(maxTotalMarks) || 1);
  const pct = gradeScorePercent(total, max);

  const performance =
    pct >= 75
      ? "strong"
      : pct >= 50
        ? "satisfactory"
        : "needs improvement";

  const bullets = [`• Score: ${total}/${max} (${pct}%) — ${performance} performance`];

  const lost = (questions || []).filter((q) => {
    if (isBackfilledStub(q)) return false;
    if (isReportOnlyBlankQuestion(q, { isBackfilledStub })) return false;
    const aw = Number(q.marksAwarded) || 0;
    const mx = Number(q.maxMarks) || 0;
    return mx > 0 && aw < mx;
  });

  if (lost.length === 0) {
    bullets.push("• Full marks on all graded questions");
  } else {
    for (const q of lost.slice(0, 4)) {
      let line = `• Q${q.questionNumber} (${q.marksAwarded}/${q.maxMarks})`;
      if (q.studyTopic) {
        line += ` — ${q.studyTopic}`;
      } else if (q.missingKeywords?.length) {
        line += ` — missing: ${q.missingKeywords.slice(0, 2).join(", ")}`;
      } else if (q.reason?.trim()) {
        const short = q.reason.trim().split(/[.!]/)[0].slice(0, 72);
        if (short) line += ` — ${short}`;
      }
      bullets.push(line);
    }
    if (lost.length > 4) {
      bullets.push(`• ${lost.length - 4} more question(s) with lost marks`);
    }
  }

  const unanswered = summarizeUnansweredQuestions(questions, { isBackfilledStub });
  if (unanswered.count > 0) {
    const listed = unanswered.questionNumbers.slice(0, 6).join(", ");
    const more =
      unanswered.questionNumbers.length > 6
        ? ` (+${unanswered.questionNumbers.length - 6} more)`
        : "";
    bullets.push(
      `• Left unanswered: ${listed}${more} — ${unanswered.marksDeducted} mark(s) deducted`
    );
  }

  const prevBullets = normalizeMarkingSummaryBullets(previousSummary)
    .split("\n")
    .filter((line) => /revise|focus|strength|well|excellent|improve|weak/i.test(line));

  for (const line of prevBullets.slice(0, 2)) {
    if (!bullets.includes(line)) bullets.push(line);
  }

  return bullets.slice(0, 6).join("\n");
}

export function getOutOfScopeNotes(result) {
  return Array.isArray(result?.outOfScopeNotes) ? result.outOfScopeNotes : [];
}

const CORRECTION_PATCH_FIELDS = [
  "marksAwarded",
  "reason",
  "markedKeywords",
  "missingKeywords",
  "studentAnswer",
  "correctAnswer",
  "studyTopic",
  "mistakeAdvice",
];

/** Merge AI correction suggestions into live editing state. */
export function createManualQuestion({
  questionNumber,
  maxMarks = 1,
  pageNumber = 1,
  yPercent = 30,
  marksAwarded = 0,
} = {}) {
  const max = Math.max(1, Number(maxMarks) || 1);
  const awarded = Math.min(max, Math.max(0, Number(marksAwarded) || 0));
  const qNum = String(questionNumber || "").trim();
  return {
    questionNumber: qNum,
    pageNumber: Math.max(1, Number(pageNumber) || 1),
    yPercent: Math.min(100, Math.max(0, Number(yPercent) || 30)),
    maxMarks: max,
    marksAwarded: awarded,
    markedKeywords: [],
    missingKeywords: [],
    studyTopic: "",
    mistakeAdvice: "",
    checklist: {
      scanningClarity: true,
      handwritingClarity: true,
      markSchemeUnderstanding: true,
      studentAnswerUnderstanding: true,
      answerIsBlank: awarded === 0,
    },
    studentAnswer: awarded === 0 ? "Question left blank — no answer provided." : "",
    correctAnswer: "",
    reason:
      awarded >= max
        ? `Full marks awarded for Q${qNum}.`
        : awarded === 0
          ? `No marks awarded for Q${qNum}.`
          : `Awarded ${awarded}/${max} marks for Q${qNum}.`,
    _manual: true,
    _staffNote: "Added manually by teacher — adjust marks and feedback as needed.",
  };
}

/**
 * Collapse a question label to a comparable key.
 *
 * A correction can name a question in a different shape than the result stored
 * it: the marking model writes "5a" while the correction model copies the
 * printed label and writes "5(a)". Matching those as raw strings silently
 * matches nothing, so the correction appears to apply while the mark never
 * moves. "Q5(a)", "5 (a)", "5a" all collapse to "5a" here.
 */
export function questionRefKey(value) {
  const s = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return "";
  return s.startsWith("q") ? s.slice(1) : s;
}

/**
 * Apply correction-chat changes to the editing questions.
 *
 * Returns `{ questions, summary, matched, unmatched }`. `unmatched` lists the
 * question numbers a change targeted that exist nowhere in the result — the
 * caller is expected to surface those rather than let them disappear.
 */
export function applyCorrectionPatch(editingQuestions, { changes = [], summary = null } = {}) {
  const edits = (changes || []).filter((c) => c?.action !== "add");

  const patchMap = new Map();
  for (const change of edits) {
    const key = questionRefKey(change.questionNumber);
    if (key && !patchMap.has(key)) patchMap.set(key, change);
  }

  const usedKeys = new Set();

  let questions = (editingQuestions || []).map((q) => {
    // Prefer the stored question number; fall back to the printed label, which
    // is what the correction model tends to quote.
    const key = [q.questionNumber, q.printedQuestionNumber]
      .map(questionRefKey)
      .find((k) => k && patchMap.has(k));

    const patch = key ? patchMap.get(key) : null;
    if (!patch) return { ...q };
    usedKeys.add(key);

    const next = { ...q };
    for (const field of CORRECTION_PATCH_FIELDS) {
      if (patch[field] !== undefined && patch[field] !== null) {
        next[field] = patch[field];
      }
    }
    // Never let a correction rename the question — the label is how every other
    // consumer (annotation placement, dedupe) finds this row.
    next.questionNumber = q.questionNumber;

    const max = Number(next.maxMarks) || 0;
    if (max > 0) {
      next.marksAwarded = Math.min(max, Math.max(0, Number(next.marksAwarded) || 0));
    }

    const marksChanged =
      Number(next.marksAwarded) !== Number(q.marksAwarded) ||
      Number(next.maxMarks) !== Number(q.maxMarks);
    if (marksChanged) {
      const patchedReason = patch.reason;
      Object.assign(next, alignExaminerFeedbackToMarks(next, "full"));
      if (patchedReason !== undefined && patchedReason !== null) {
        next.reason = patchedReason;
      }
    }

    // A correction that fills in a backfilled stub turns it into reviewed work
    // in the editor (_stubEdited) but it stays in the report breakdown only.
    if (isBackfilledStub(q) && questionRowHasEdits(next, q)) {
      next._stubEdited = true;
    }
    return next;
  });

  for (const add of (changes || []).filter((c) => c?.action === "add")) {
    const qNum = String(add.questionNumber || "").trim();
    if (!qNum) continue;
    const key = questionRefKey(qNum);
    if (questions.some((q) => questionRefKey(q.questionNumber) === key)) continue;
    questions.push(
      createManualQuestion({
        questionNumber: qNum,
        maxMarks: add.maxMarks,
        pageNumber: add.pageNumber,
        marksAwarded: add.marksAwarded,
      })
    );
  }

  const unmatched = edits
    .filter((c) => !usedKeys.has(questionRefKey(c.questionNumber)))
    .map((c) => String(c.questionNumber));

  return {
    questions,
    summary:
      summary != null && String(summary).trim()
        ? normalizeMarkingSummaryBullets(summary)
        : null,
    matched: usedKeys.size,
    unmatched,
  };
}

export { getTeacherAnnotations } from "./teacherAnnotations";

export function buildFinalMarkingResult(baseResult, editingQuestions) {

  const totalMarks = sumQuestionMarks(editingQuestions);

  return {

    ...baseResult,

    questions: editingQuestions,

    totalMarks,

  };

}

export function getResultMaxTotal(result) {
  if (!result) return 0;
  if (result.markingMode === "criteria") {
    return Number(result.criteriaGrade?.maxTotalMarks) || 10;
  }
  return Number(result.maxTotalMarks) || 0;
}

export function sumQuestionMaxMarks(items) {
  return (items || []).reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0);
}

/** Max derived from the mark-scheme items (per-question or per-criterion) — internally
 *  consistent, so it beats the AI's separate headline max when that is wrong/missing. */
export function resolveMaxTotalFromItems(result) {
  if (!result) return 0;
  if (result.markingMode === "criteria") {
    const breakdown = result.criteriaGrade?.breakdown;
    return Array.isArray(breakdown) && breakdown.length
      ? sumQuestionMaxMarks(breakdown)
      : 0;
  }
  return Array.isArray(result.questions) && result.questions.length
    ? sumQuestionMaxMarks(result.questions)
    : 0;
}

/** Max shown in results modal / PDF. Priority: manual edit → Classroom assignment max →
 *  sum of mark-scheme item maxes → AI headline max (last resort). */
export function resolveDisplayMaxTotal({
  assignmentMaxPoints = null,
  result = null,
  editingMaxTotal = null,
} = {}) {
  if (editingMaxTotal !== null && editingMaxTotal !== undefined) {
    return Math.max(1, Number(editingMaxTotal) || 1);
  }
  const fromAssignment = Number(assignmentMaxPoints);
  if (Number.isFinite(fromAssignment) && fromAssignment > 0) {
    return fromAssignment;
  }
  const fromItems = Number(resolveMaxTotalFromItems(result));
  if (Number.isFinite(fromItems) && fromItems > 0) {
    return fromItems;
  }
  return Math.max(1, Number(getResultMaxTotal(result)) || 1);
}

/** Drop questions staged for removal (indices refer to the full editingQuestions array). */
export function filterQuestionsPendingRemoval(questions, pendingRemovedIndices) {
  if (!pendingRemovedIndices?.size) return questions || [];
  return (questions || []).filter((_, i) => !pendingRemovedIndices.has(i));
}

/** Stable key for placement drag state — index when available, else page + label. */
export function placementKey(q) {
  if (q != null && q._placementIndex != null && q._placementIndex !== "") {
    return `idx:${q._placementIndex}`;
  }
  const id = String(q?.questionNumber ?? "").trim();
  const page = Math.max(1, Number(q?.pageNumber) || 1);
  const y = Math.min(100, Math.max(0, Number(q?.yPercent) || 0));
  const yBucket = Math.round(y / 5) * 5;
  return id ? `${id}::p${page}::y${yBucket}` : `anon::p${page}::y${yBucket}`;
}

/** Apply a drag placement update to one row (by index, not questionNumber). */
export function applyPlacementChange(questions, { placementIndex, pageNumber, yPercent }) {
  const idx = Number(placementIndex);
  if (!Number.isFinite(idx) || idx < 0) return questions;
  return (questions || []).map((q, i) =>
    i === idx
      ? {
          ...q,
          pageNumber: Math.max(1, Number(pageNumber) || 1),
          yPercent,
        }
      : q
  );
}

/** Normalize a typed preview label ("Q1a", "1 a") into a question id ("1a"). */
export function normalizeQuestionLabelInput(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^Q+/i, "")
    .replace(/\s+/g, "");
}

/**
 * Rename a question from the annotated PDF preview overlay.
 * Updates the visible id and printed label so the overlay matches immediately.
 */
export function applyQuestionLabelChange(questions, { placementIndex, questionNumber }) {
  const idx = Number(placementIndex);
  const next = normalizeQuestionLabelInput(questionNumber);
  if (!Number.isFinite(idx) || idx < 0 || !next) return questions;
  return (questions || []).map((q, i) => {
    if (i !== idx) return q;
    const prev = String(q.questionNumber ?? "").trim();
    const patch = {
      ...q,
      questionNumber: next,
      printedQuestionNumber: next,
    };
    if (!q.msQuestionNumber && prev && prev !== next) {
      patch.msQuestionNumber = prev;
    }
    return patch;
  });
}

/**
 * Preview overlay list — keeps original indices for remove handlers.
 *
 * Backfilled / not-on-script stubs are excluded (report-only). Genuine blanks
 * with a page stay as drag handles so unanswered items can be moved.
 */
export function buildPlacementQuestions(questions, pendingRemovedIndices) {
  return (questions || [])
    .map((q, i) => ({ ...q, _placementIndex: i }))
    .filter((q) => !pendingRemovedIndices?.has(q._placementIndex))
    .filter((q) => isPlaceableScriptQuestion(q, { isBackfilledStub }));
}

export function stripQuestionPlacementMeta(question) {
  if (!question || typeof question !== "object") return question;
  const { _placementIndex, ...rest } = question;
  return rest;
}

export function questionsForConfirmEdits(questions, pendingRemovedIndices) {
  return filterQuestionsPendingRemoval(questions, pendingRemovedIndices).map(stripQuestionPlacementMeta);
}

export function questionsHavePendingEdits(currentQuestions, confirmedSnapshot) {
  if (!confirmedSnapshot) return false;
  const current = currentQuestions || [];
  const confirmed = confirmedSnapshot.questions || [];
  if (current.length !== confirmed.length) return true;

  return current.some((q, i) => questionRowHasEdits(q, confirmed[i]));
}

export function markingResultHasPendingCriteriaEdits(
  editingCriteriaGrade,
  confirmedSnapshot
) {
  if (!confirmedSnapshot?.criteriaGrade && !editingCriteriaGrade) return false;
  return criteriaGradeHasEdits(
    editingCriteriaGrade,
    confirmedSnapshot?.criteriaGrade
  );
}

/** Apply teacher question edits and an optional new max-total to a marking result. */
export function applyTeacherEditsToResult(
  baseResult,
  editingQuestions,
  maxTotalMarks,
  editingAnnotations = null,
  summaryOverride = null,
  editingCriteriaGrade = null
) {
  const questions = syncQuestionsExaminerFeedback(
    editingQuestions,
    baseResult?.questions || []
  );
  const totalMarks = sumQuestionMarks(questions);

  const finalResult = {
    ...baseResult,
    questions,
    totalMarks,
  };

  const max = Math.max(1, Number(maxTotalMarks) || getResultMaxTotal(baseResult));

  finalResult.maxTotalMarks = max;
  if (finalResult.markingMode === "criteria" && finalResult.criteriaGrade) {
    const criteria = editingCriteriaGrade
      ? {
          ...finalResult.criteriaGrade,
          ...editingCriteriaGrade,
          breakdown: (editingCriteriaGrade.breakdown || []).map((row) => ({
            ...row,
          })),
        }
      : { ...finalResult.criteriaGrade };
    if (Array.isArray(criteria.breakdown) && criteria.breakdown.length) {
      criteria.breakdown = syncQuestionsExaminerFeedback(
        criteria.breakdown,
        baseResult?.criteriaGrade?.breakdown || []
      );
    }
    const breakdownSum = Array.isArray(criteria.breakdown) && criteria.breakdown.length
      ? sumQuestionMarks(criteria.breakdown)
      : totalMarks;
    finalResult.criteriaGrade = {
      ...criteria,
      maxTotalMarks: max,
      totalMarks: breakdownSum,
    };
    finalResult.totalMarks = breakdownSum;
  } else {
    finalResult.totalMarks = totalMarks;
  }

  if (editingAnnotations != null) {
    finalResult.teacherAnnotations = editingAnnotations.map((a) => ({ ...a }));
  }

  if (summaryOverride != null && String(summaryOverride).trim()) {
    finalResult.summary = normalizeMarkingSummaryBullets(summaryOverride);
  } else {
    finalResult.summary = rebuildMarkingSummary({
      questions,
      maxTotalMarks: max,
      previousSummary: baseResult?.summary || baseResult?.criteriaGrade?.summary || "",
    });
  }

  finalResult.unansweredQuestions = summarizeUnansweredQuestions(questions, {
    isBackfilledStub,
  });

  // Hard cap: obtained can never exceed the maximum (e.g. 85/82 → 82/82).
  finalResult.totalMarks = Math.min(finalResult.totalMarks, max);
  if (finalResult.criteriaGrade) {
    finalResult.criteriaGrade = {
      ...finalResult.criteriaGrade,
      totalMarks: Math.min(finalResult.criteriaGrade.totalMarks ?? finalResult.totalMarks, max),
    };
  }

  // Canonical final fields — same shape the backend persists on Save.
  // Preview / download / return must prefer these over ad-hoc recalculation.
  finalResult.finalQuestions = questions;
  finalResult.finalObtainedMarks = finalResult.totalMarks;
  finalResult.finalMaximumMarks = max;
  finalResult.finalPercentage = gradeScorePercent(finalResult.totalMarks, max);
  finalResult.backfilledQuestions = {
    questionNumbers: questions
      .filter(isBackfilledStub)
      .map((q) => String(q.questionNumber ?? "").trim())
      .filter(Boolean),
    count: questions.filter(isBackfilledStub).length,
  };
  finalResult.studentFeedback = {
    summary: finalResult.summary || "",
    questions: sanitizeQuestionsForStudentPdf(questions),
    unansweredMessage: finalResult.unansweredQuestions?.message || null,
  };
  finalResult.staffOnlyMetadata = {
    notes: questions
      .filter((q) => q?._staffNote || isBackfilledStub(q))
      .map((q) => ({
        questionNumber: String(q.questionNumber ?? "").trim() || "?",
        note:
          String(q._staffNote || "").trim() ||
          "Question not detected during automated marking — please review manually.",
      })),
    backfilledQuestions: finalResult.backfilledQuestions,
  };

  return finalResult;
}

export function isStudentSubmitted(state) {
  return state === "TURNED_IN" || state === "RETURNED";
}

export function buildNoSubmissionMarkingResult({
  markingMode = "normal",
  maxTotalMarks = null,
} = {}) {
  const max = maxTotalMarks != null ? Number(maxTotalMarks) : 0;
  const summary = "Student submitted but no PDF was attached — awarded 0 marks.";

  if (markingMode === "criteria") {
    return {
      markingMode,
      questions: [],
      criteriaGrade: {
        breakdown: [],
        totalMarks: 0,
        maxTotalMarks: max,
        summary,
      },
      totalMarks: 0,
      maxTotalMarks: max,
      summary,
      noSubmission: true,
    };
  }

  return {
    markingMode,
    questions: [],
    totalMarks: 0,
    maxTotalMarks: max,
    summary,
    noSubmission: true,
    checklist: {
      scanningClarity: false,
      handwritingClarity: false,
      markSchemeUnderstanding: true,
      studentAnswerUnderstanding: false,
      answerIsBlank: true,
    },
  };
}



export function buildBatchMarkingResult(parsed, tokenUsage, geminiModel, pdfCompression = null) {
  const result = {
    ...parsed,
    provider: "gemini-batch",
    geminiModel: geminiModel || null,
    tokenUsage: tokenUsage || null,
  };

  if (pdfCompression) {
    result.pdfCompression = pdfCompression;
  }

  attachEstimatedCost(result, geminiModel, tokenUsage, { batch: true });

  return result;
}

/**
 * Enrich a gradingv2 result.
 *
 * v2 returns the identical result shape as v1 — that is what lets the annotation
 * editor, correction chat and grade push work unchanged. The distinct `provider`
 * value is the only reliable way to tell afterwards which engine produced a
 * stored result, so keep it distinct.
 *
 * `diagnostics` (window count, mark-scheme pages per window, retried windows) is
 * v2-only and every consumer treats it as optional.
 */
export function buildV2MarkingResult(
  parsed,
  tokenUsage,
  geminiModel,
  { batch = false, pdfCompression = null, diagnostics = null } = {}
) {
  const result = {
    ...parsed,
    provider: batch ? "gemini-v2-batch" : "gemini-v2",
    markingEngine: "v2",
    geminiModel: geminiModel || null,
    tokenUsage: tokenUsage || null,
  };

  if (pdfCompression) result.pdfCompression = pdfCompression;
  if (diagnostics) result.gradingV2Diagnostics = diagnostics;

  attachEstimatedCost(result, geminiModel, tokenUsage, { batch });

  return result;
}

export function buildPriorityMarkingResult(parsed, tokenUsage, geminiModel, servedServiceTier) {
  // Premium only applies when Gemini actually served the request at priority tier.
  const servedPriority = servedServiceTier === "priority";
  const result = {
    ...parsed,
    provider: "gemini-priority",
    geminiModel: geminiModel || null,
    tokenUsage: tokenUsage || null,
    requestedServiceTier: "priority",
    servedServiceTier: servedServiceTier || null,
  };

  attachEstimatedCost(result, geminiModel, tokenUsage, { priority: servedPriority });

  return result;
}

