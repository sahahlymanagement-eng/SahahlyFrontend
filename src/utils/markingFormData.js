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



/** Read a useful API error message (including JSON-in-blob error bodies). */

export async function getApiErrorMessage(err) {

  const data = err?.response?.data;

  if (data instanceof Blob) {

    try {

      const text = await data.text();

      try {

        const parsed = JSON.parse(text);

        return parsed.message || text || err.message;

      } catch {

        return text || err.message;

      }

    } catch {

      return err.message || "Request failed";

    }

  }

  if (data && typeof data === "object" && data.message) return data.message;

  return err?.message || "Request failed";

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

    if (!orig) continue;

    if (Number(q.marksAwarded) !== Number(orig.marksAwarded)) return true;

    if (String(q.reason || "").trim() !== String(orig.reason || "").trim()) return true;

  }

  return false;

}



/** Resolve overall summary from live AI result and/or DB-persisted sources. */
export function getMarkingResultSummary(result, { storedSummary, studentSummary } = {}) {
  const fromResult =
    (typeof result?.summary === "string" && result.summary.trim()) ||
    (typeof result?.criteriaGrade?.summary === "string" && result.criteriaGrade.summary.trim()) ||
    "";
  if (fromResult) return fromResult;

  const fromStored =
    (typeof storedSummary === "string" && storedSummary.trim()) ||
    "";
  if (fromStored) return fromStored;

  return (typeof studentSummary === "string" && studentSummary.trim()) || "";
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

export function questionsHavePendingEdits(currentQuestions, confirmedSnapshot) {
  if (!confirmedSnapshot) return false;
  const current = currentQuestions || [];
  const confirmed = confirmedSnapshot.questions || [];
  if (current.length !== confirmed.length) return true;
  return current.some(
    (q, i) =>
      Number(q.marksAwarded) !== Number(confirmed[i]?.marksAwarded) ||
      String(q.reason || "") !== String(confirmed[i]?.reason || "")
  );
}

/** Apply teacher question edits and an optional new max-total to a marking result. */
export function applyTeacherEditsToResult(baseResult, editingQuestions, maxTotalMarks) {
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

