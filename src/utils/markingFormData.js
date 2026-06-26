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

export function buildFinalMarkingResult(baseResult, editingQuestions) {

  const totalMarks = editingQuestions.reduce(

    (s, q) => s + (Number(q.marksAwarded) || 0),

    0

  );

  return {

    ...baseResult,

    questions: editingQuestions,

    totalMarks,

  };

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



export function buildBatchMarkingResult(parsed, tokenUsage, geminiModel) {
  const result = {
    ...parsed,
    provider: "gemini-batch",
    geminiModel: geminiModel || null,
    tokenUsage: tokenUsage || null,
    pdfCompression: {
      applied: false,
      method: "gemini-batch",
      student: {
        applied: false,
        reason: "Batch API — student PDF uploaded directly to Gemini",
      },
      markScheme: {
        applied: false,
        reason: "Batch API — mark scheme shared via Gemini file URI",
      },
    },
  };

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

