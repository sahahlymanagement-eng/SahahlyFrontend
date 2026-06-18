/** Attach user/assignment context so the backend can log AI token usage. */

export function appendMarkingContext(formData, { personId, assignmentId, classroomId } = {}) {

  if (personId) formData.append("personId", personId);

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



/** Phase 1 — validate mark scheme once and build/reuse assignment correction memory. */

export async function ensureAssignmentMemory(

  api,

  {

    assignmentId,

    studentFile,

    msFile,

    markingMode = "normal",

    guidance = null,

    totalGrade = null,

    classroomId = null,

    geminiModel = null,

  } = {}

) {

  const fd = new FormData();

  fd.append("studentPdf", studentFile);

  fd.append("markSchemePdf", msFile);

  fd.append("markingMode", markingMode);

  if (guidance) fd.append("guidance", guidance);

  if (totalGrade != null && totalGrade !== "") fd.append("totalGrade", String(totalGrade));

  appendMarkingContext(fd, {

    personId: currentUserId(),

    assignmentId,

    classroomId,

  });

  if (geminiModel) fd.append("geminiModel", geminiModel);

  try {

    const res = await api.post("/marking/ensure-assignment-memory", fd, {

      headers: { "Content-Type": "multipart/form-data" },

      timeout: 600000,

    });

    return res.data;

  } catch (err) {

    throw new Error(await getApiErrorMessage(err));

  }

}



/** Phase 2 — persist teacher edits and append corrections to assignment memory. */

export async function confirmTeacherEdits(

  api,

  {

    assignmentId,

    submissionId,

    studentId,

    studentName,

    mode,

    provider,

    originalQuestions,

    finalQuestions,

    finalResult,

  } = {}

) {

  const res = await api.post("/marking/record-correction", {

    assignmentId,

    submissionId,

    studentId,

    studentName,

    mode,

    provider,

    originalQuestions,

    finalQuestions,

    finalResult,

  });

  return res.data;

}

/** Merge batch API marking JSON with per-student token usage for UI + save-results. */
export function buildBatchMarkingResult(parsed, tokenUsage) {
  return {
    ...parsed,
    provider: "gemini-batch",
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
}

