import { estimateMarkingCost } from "./markingCost";

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

export async function getApiErrorMessage(err) {

  const data = err?.response?.data;

  if (data instanceof Blob) {

    try {

      const text = await data.text();

      try {

        const parsed = JSON.parse(text);

        return formatGoogleOAuthError(parsed.message || parsed.error || text) || text || err.message;

      } catch {

        return formatGoogleOAuthError(text) || text || err.message;

      }

    } catch {

      return formatGoogleOAuthError(err.message) || err.message || "Request failed";

    }

  }

  if (data && typeof data === "object") {
    const msg = data.message || data.error;
    if (msg) return formatGoogleOAuthError(msg);
  }

  return formatGoogleOAuthError(err?.message) || err?.message || "Request failed";

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

/** Authoritative grade from per-question marks when available. */
export function resolveTotalMarksFromResult(result) {
  if (!result) return null;

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
      studentAnswerUnderstanding: false,
      answerIsBlank: awarded === 0,
    },
    studentAnswer: "Added manually by teacher — adjust marks and feedback as needed.",
    correctAnswer: "",
    reason: `Awarded ${awarded}/${max} marks. Q${qNum} was added manually after automated marking.`,
    _manual: true,
  };
}

export function applyCorrectionPatch(editingQuestions, { changes = [], summary = null } = {}) {
  const patchMap = new Map(
    (changes || [])
      .filter((c) => c?.action !== "add")
      .map((c) => [String(c.questionNumber), c])
  );

  let questions = (editingQuestions || []).map((q) => {
    const patch = patchMap.get(String(q.questionNumber));
    if (!patch) return { ...q };

    const next = { ...q };
    for (const key of CORRECTION_PATCH_FIELDS) {
      if (patch[key] !== undefined && patch[key] !== null) {
        next[key] = patch[key];
      }
    }
    const max = Number(next.maxMarks) || 0;
    if (max > 0) {
      next.marksAwarded = Math.min(max, Math.max(0, Number(next.marksAwarded) || 0));
    }
    return next;
  });

  for (const add of (changes || []).filter((c) => c?.action === "add")) {
    const qNum = String(add.questionNumber || "").trim();
    if (!qNum) continue;
    if (questions.some((q) => String(q.questionNumber) === qNum)) continue;
    questions.push(
      createManualQuestion({
        questionNumber: qNum,
        maxMarks: add.maxMarks,
        pageNumber: add.pageNumber,
        marksAwarded: add.marksAwarded,
      })
    );
  }

  return {
    questions,
    summary:
      summary != null && String(summary).trim()
        ? normalizeMarkingSummaryBullets(summary)
        : null,
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

/** Max shown in results modal / PDF — Classroom sync wins over saved AI max. */
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
  return Math.max(1, Number(getResultMaxTotal(result)) || 1);
}

/** Drop questions staged for removal (indices refer to the full editingQuestions array). */
export function filterQuestionsPendingRemoval(questions, pendingRemovedIndices) {
  if (!pendingRemovedIndices?.size) return questions || [];
  return (questions || []).filter((_, i) => !pendingRemovedIndices.has(i));
}

/** Preview overlay list — keeps original indices for remove handlers. */
export function buildPlacementQuestions(questions, pendingRemovedIndices) {
  return (questions || [])
    .map((q, i) => ({ ...q, _placementIndex: i }))
    .filter((q) => !pendingRemovedIndices?.has(q._placementIndex));
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

  const normKw = (arr) =>
    JSON.stringify((arr || []).map((s) => String(s).trim()).filter(Boolean));

  return current.some(
    (q, i) =>
      Number(q.marksAwarded) !== Number(confirmed[i]?.marksAwarded) ||
      String(q.reason || "") !== String(confirmed[i]?.reason || "") ||
      Number(q.yPercent) !== Number(confirmed[i]?.yPercent) ||
      Number(q.pageNumber) !== Number(confirmed[i]?.pageNumber) ||
      normKw(q.markedKeywords) !== normKw(confirmed[i]?.markedKeywords) ||
      normKw(q.missingKeywords) !== normKw(confirmed[i]?.missingKeywords)
  );
}

/** Apply teacher question edits and an optional new max-total to a marking result. */
export function applyTeacherEditsToResult(
  baseResult,
  editingQuestions,
  maxTotalMarks,
  editingAnnotations = null,
  summaryOverride = null
) {
  const finalResult = buildFinalMarkingResult(baseResult, editingQuestions);
  const max = Math.max(1, Number(maxTotalMarks) || getResultMaxTotal(baseResult));

  finalResult.maxTotalMarks = max;
  if (finalResult.markingMode === "criteria" && finalResult.criteriaGrade) {
    finalResult.criteriaGrade = {
      ...finalResult.criteriaGrade,
      maxTotalMarks: max,
      totalMarks: finalResult.totalMarks,
    };
  }

  if (editingAnnotations != null) {
    finalResult.teacherAnnotations = editingAnnotations.map((a) => ({ ...a }));
  }

  if (summaryOverride != null && String(summaryOverride).trim()) {
    finalResult.summary = normalizeMarkingSummaryBullets(summaryOverride);
  } else {
    finalResult.summary = rebuildMarkingSummary({
      questions: editingQuestions,
      maxTotalMarks: max,
      previousSummary: baseResult?.summary || baseResult?.criteriaGrade?.summary || "",
    });
  }

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

  if (tokenUsage && geminiModel) {
    const cost = estimateMarkingCost(geminiModel, tokenUsage, { batch: true });
    if (cost) {
      result.estimatedCost = cost;
      result.estimatedCostUsd = cost.usd;
      result.estimatedCostEgp = cost.egp;
      result.batchPricing = true;
    }
  }

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

  if (tokenUsage && geminiModel) {
    const cost = estimateMarkingCost(geminiModel, tokenUsage, { priority: servedPriority });
    if (cost) {
      result.estimatedCost = cost;
      result.estimatedCostUsd = cost.usd;
      result.estimatedCostEgp = cost.egp;
      if (servedPriority) result.priorityPricing = true;
    }
  }

  return result;
}

