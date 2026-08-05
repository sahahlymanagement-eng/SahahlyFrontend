import api from "../../api/api";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
import { loadEligibleStudentsForMarking } from "../../utils/markingStudentSelection";
import {
  appendMarkingContext,
  assertPdfBlob,
  buildBatchMarkingResult,
  guidanceForForm,
  resolveTotalMarksFromResult,
} from "../../utils/markingFormData";
import {
  DEFAULT_GEMINI_MODEL,
  parseGeminiModelsResponse,
  pickValidGeminiModel,
} from "../../utils/markingCost";
import { runMarkSchemeVerification } from "../../components/MarkSchemeVerificationModal";
import { computeGradePercent } from "../../utils/reportGradePercent";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function errMsg(err, fallback = "Something went wrong") {
  return err?.response?.data?.message || err?.message || fallback;
}

/** Load all delegated assignments for an assistant, optionally filtered later by classroom. */
export async function loadAssistantAssignments(personId) {
  return fetchAllPaginated(
    api,
    "/assignment-workflow/assistant/assignments",
    { personId, status: "ALL" },
    "data",
    50
  );
}

/** Unique classrooms from delegated assignments. */
export function classroomsFromAssignments(assignments) {
  const map = new Map();
  for (const a of assignments || []) {
    const c = a.classroomId;
    const id = c?._id || c;
    if (!id) continue;
    const key = String(id);
    if (!map.has(key)) {
      map.set(key, {
        _id: id,
        name: c.name || "Untitled classroom",
        section: c.section || "",
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

export function assignmentsForClassroom(assignments, classroomId) {
  const id = String(classroomId);
  return (assignments || [])
    .filter((a) => String(a.classroomId?._id || a.classroomId) === id)
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
}

/** Classrooms the assistant can report on. */
export async function loadReportClassrooms(personId) {
  return fetchAllPaginated(
    api,
    "/students/my-classrooms",
    { personId },
    "data",
    50
  );
}

export async function loadClassroomAssignments(classroomId) {
  return fetchAllPaginated(
    api,
    `/manager-assignments/classroom/${classroomId}/assignments`,
    {},
    "data",
    50
  );
}

export async function loadMarkingStudents(assignmentId) {
  return fetchAllPaginated(
    api,
    `/assignment-submissions/${assignmentId}/students`,
    {},
    "students",
    100
  );
}

export async function loadReportStudents(assignmentId) {
  return fetchAllPaginated(
    api,
    `/manager-assignments/${assignmentId}/full`,
    {},
    "students",
    100
  );
}

export async function loadAssignmentMeta(assignmentId) {
  const res = await api.get(`/manager-assignments/${assignmentId}/full`, {
    params: { page: 1, limit: 1 },
  });
  return {
    assignment: res.data.assignment || null,
    maxPoints: res.data.assignment?.maxPoints ?? null,
    classroomId:
      res.data.assignment?.classroomId?._id ||
      res.data.assignment?.classroomId ||
      null,
    subjectId: res.data.assignment?.subjectId || null,
    summaryMap: res.data.summaryMap || {},
  };
}

async function resolveGeminiModel() {
  try {
    const res = await api.get("/marking/gemini-models");
    const models = parseGeminiModelsResponse(res.data);
    return pickValidGeminiModel(models, DEFAULT_GEMINI_MODEL);
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

/**
 * Full marking pipeline with progress callbacks.
 * onProgress(message) — called after each milestone.
 */
export async function runMarkingPipeline({
  assignmentId,
  classroomId,
  maxPoints,
  subjectId,
  students, // null/empty = all eligible; else selected student rows
  onProgress,
}) {
  const progress = (msg) => {
    if (typeof onProgress === "function") onProgress(msg);
  };

  // 1) Prompt generation
  progress("Generating assignment prompt…");
  let promptContent = "";
  try {
    const gen = await api.post(
      `/marking/assignment-prompt/${assignmentId}/generate`,
      { masterPrompt: "" }
    );
    promptContent = gen.data?.content || "";
    progress("Prompt generated successfully.");
  } catch (err) {
    // Fall back to any saved prompt
    try {
      const existing = await api.get(`/marking/assignment-prompt/${assignmentId}`);
      promptContent = existing.data?.content || "";
    } catch {
      /* ignore */
    }
    if (promptContent) {
      progress(
        `Prompt generation failed (${errMsg(err)}). Using the saved prompt instead.`
      );
    } else {
      progress(
        `Prompt generation failed (${errMsg(err)}). Continuing without a custom prompt.`
      );
    }
  }

  // 2) Mark scheme verification
  progress("Running mark scheme verification…");
  try {
    const verification = await runMarkSchemeVerification(assignmentId, "");
    const status = String(verification?.status || "unknown").toLowerCase();
    const verdict = verification?.verdict || verification?.summary || "";
    if (status === "pass") {
      progress(
        `Mark scheme verification succeeded${verdict ? `: ${verdict}` : "."}`
      );
    } else if (status === "warning") {
      progress(
        `Mark scheme verification completed with warnings${verdict ? `: ${verdict}` : "."} Continuing.`
      );
    } else {
      progress(
        `Mark scheme verification status: ${status}${verdict ? ` — ${verdict}` : "."} Continuing with marking.`
      );
    }
  } catch (err) {
    progress(
      `Mark scheme verification failed (${errMsg(err)}). Continuing with marking.`
    );
  }

  // 3) Mark
  const selectedIds =
    students?.length > 0
      ? new Set(students.map((s) => s.submissionId).filter(Boolean))
      : null;

  const { eligible, error } = await loadEligibleStudentsForMarking(api, {
    assignmentId,
    studentsUrl: `/assignment-submissions/${assignmentId}/students`,
    selectedIds,
    requireSubmitted: false,
  });

  if (error === "none_of_selected_found") {
    throw new Error("Selected student was not found for marking.");
  }
  if (!eligible?.length) {
    throw new Error(
      "No eligible students to mark (need a PDF submission and mark scheme)."
    );
  }

  const geminiModel = await resolveGeminiModel();
  const guidanceValue = guidanceForForm(promptContent);

  if (eligible.length === 1) {
    progress(`Marking ${eligible[0].name || "1 student"}…`);
    const result = await markSingleStudent({
      assignmentId,
      classroomId,
      maxPoints,
      student: eligible[0],
      guidanceValue,
      geminiModel,
    });
    progress(
      `Marking complete for ${eligible[0].name || "student"}` +
        (result.total != null ? ` — ${result.total}${maxPoints != null ? ` / ${maxPoints}` : ""}` : ".")
    );
    return { mode: "single", ok: 1, failed: 0, total: 1, details: [result] };
  }

  progress(`Uploading ${eligible.length} student PDFs for batch marking…`);
  const uploadRes = await api.post("/marking/mark-batch/upload", {
    assignmentId,
    students: eligible.map((s) => ({
      submissionId: s.submissionId,
      studentId: s.studentId,
      name: s.name,
    })),
  });

  const { msUri, succeeded, failed } = uploadRes.data || {};
  if (failed?.length) {
    progress(`${failed.length} student(s) could not be uploaded.`);
  }
  if (!succeeded?.length) {
    throw new Error("No valid submissions to mark after upload.");
  }

  progress("Submitting batch marking job…");
  let jobId;
  let firstBatch;
  try {
    const submitRes = await api.post("/marking/mark-batch/submit", {
      assignmentId,
      msUri,
      succeeded,
      markingMode: "normal",
      guidance: guidanceValue,
      geminiModel,
      subjectId,
      ...(maxPoints && { totalGrade: maxPoints }),
      classroomId,
    });
    jobId = submitRes.data.jobId;
    firstBatch = submitRes.data.firstBatch;
  } catch (err) {
    if (err.response?.data?.reason === "first_batch_pending") {
      // Nothing new was submitted — this assignment's first batch was
      // already capped and is waiting on a human confirmation.
      progress(
        "This assignment's first batch is already marked and awaiting your confirmation."
      );
      return { mode: "blocked", firstBatchPending: true, firstBatch: err.response.data.firstBatch };
    }
    if (err.response?.status === 409 && err.response?.data?.jobId) {
      jobId = err.response.data.jobId;
      progress("Resuming an existing batch job…");
    } else {
      throw err;
    }
  }

  progress(`Batch marking in progress (job ${jobId}). This may take a few minutes…`);
  const batchResult = await pollBatchUntilDone(jobId, {
    assignmentId,
    geminiModel,
    mode: "normal",
    onProgress: progress,
  });

  progress(
    `Marking finished — ${batchResult.ok} succeeded` +
      (batchResult.failed ? `, ${batchResult.failed} failed` : "") +
      "."
  );

  if (firstBatch?.status === "pending_confirmation") {
    progress(
      `${batchResult.ok} paper(s) marked as a safety check on this new assignment. ` +
        `Reply "yes" to confirm and mark the remaining ${firstBatch.remainingCount ?? "papers"}.`
    );
    return { mode: "batch", ...batchResult, firstBatchPending: true, remainingCount: firstBatch.remainingCount };
  }

  return { mode: "batch", ...batchResult };
}

/** Confirms a capped first batch and auto-continues marking the rest (v1). */
export async function confirmFirstBatch(assignmentId) {
  await api.post(`/marking/first-batch/confirm/${assignmentId}`);
}

async function markSingleStudent({
  assignmentId,
  classroomId,
  maxPoints,
  student,
  guidanceValue,
  geminiModel,
}) {
  const [studentPdfRes, msPdfRes] = await Promise.all([
    api.get("/submission-files/pdf", {
      params: { assignmentId, submissionId: student.submissionId },
      responseType: "blob",
    }),
    api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
      responseType: "blob",
    }),
  ]);

  await assertPdfBlob(
    studentPdfRes.data,
    `${student.name || "Student"} submission`
  );
  await assertPdfBlob(msPdfRes.data, "Mark scheme");

  const studentFile = new File(
    [studentPdfRes.data],
    `${student.name || "student"}.pdf`,
    { type: "application/pdf" }
  );
  const msFile = new File([msPdfRes.data], "markscheme.pdf", {
    type: "application/pdf",
  });

  const fd = new FormData();
  fd.append("studentPdf", studentFile);
  fd.append("markSchemePdf", msFile);
  if (maxPoints) fd.append("totalGrade", maxPoints);
  fd.append("markingMode", "normal");
  if (guidanceValue) fd.append("guidance", guidanceValue);
  fd.append("geminiModel", geminiModel);
  appendMarkingContext(fd, { assignmentId, classroomId });

  const res = await api.post("/marking/mark", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600000,
  });

  await api.post("/submission-files/save-results", {
    assignmentId,
    submissionId: student.submissionId,
    studentId: student.studentId,
    studentName: student.name,
    mode: "normal",
    provider: "gemini",
    result: res.data,
  });

  return {
    name: student.name,
    success: true,
    total: resolveTotalMarksFromResult(res.data),
  };
}

async function pollBatchUntilDone(jobId, { assignmentId, geminiModel, mode, onProgress }) {
  const maxAttempts = 80; // ~20 minutes at 15s
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(attempt === 0 ? 3000 : 15000);
    const { data } = await api.get(`/marking/mark-batch/status/${jobId}`);
    const state = data.state;

    if (state === "JOB_STATE_PENDING" || state === "JOB_STATE_RUNNING") {
      if (attempt > 0 && attempt % 4 === 0) {
        onProgress?.(`Still marking… (check ${attempt + 1})`);
      }
      continue;
    }

    if (state === "JOB_STATE_FAILED") {
      throw new Error("Batch marking job failed.");
    }

    let ok = 0;
    let failed = 0;
    for (const row of data.results || []) {
      const { student, result, success, error, tokenUsage, compression } = row;
      if (!success) {
        failed += 1;
        continue;
      }
      ok += 1;
      const enriched = buildBatchMarkingResult(
        result,
        tokenUsage,
        geminiModel,
        compression
      );
      await api
        .post("/submission-files/save-results", {
          assignmentId,
          submissionId: student.submissionId,
          studentId: student.studentId,
          studentName: student.name,
          mode,
          provider: "gemini-batch",
          result: enriched,
        })
        .catch(() => {});
    }

    return { ok, failed, total: (data.results || []).length };
  }
  throw new Error("Batch marking timed out. Check the assignment page for status.");
}

/**
 * Build and send WhatsApp assignment reports for selected students.
 */
export async function sendAssignmentReports({
  classroomId,
  assignment,
  students,
  summaryMap = {},
  onProgress,
}) {
  const progress = (msg) => {
    if (typeof onProgress === "function") onProgress(msg);
  };

  if (!students?.length) throw new Error("No students selected for the report.");

  progress("Preparing report messages…");

  // Refresh live grades
  let liveStudents = students;
  let liveSummary = summaryMap;
  let maxPoints = assignment.maxPoints ?? null;
  try {
    const fresh = await api.get(`/manager-assignments/${assignment._id}/full`, {
      params: { page: 1, limit: 5000 },
    });
    const byId = Object.fromEntries(
      (fresh.data.students || []).map((s) => [String(s._id), s])
    );
    liveStudents = students.map((s) => byId[String(s._id)] || s);
    liveSummary = fresh.data.summaryMap || summaryMap;
    maxPoints = fresh.data.assignment?.maxPoints ?? maxPoints;
  } catch {
    /* use cached rows */
  }

  const reports = liveStudents.map((student) => {
    const submissionId = student.submissionId || null;
    const assignedGrade = student.assignedGrade ?? null;
    const comment = (
      student.summary ||
      (submissionId && liveSummary[submissionId]) ||
      ""
    ).trim();

    return {
      studentId: student._id,
      name: student.name,
      phone: student.phone,
      parentPhone: student.parentPhone,
      items: [
        {
          assignmentTitle: assignment.title,
          assignmentId: assignment._id,
          submissionId,
          state: student.state,
          submittedAt: student.submittedAt,
          isLate: student.isLate,
          isOnTime: student.isOnTime,
          assignedGrade,
          maxPoints,
          percentage: computeGradePercent(assignedGrade, maxPoints) || null,
          comment,
          includeAttendance: false,
          attendancePresent: null,
          attendanceDate: null,
        },
      ],
    };
  });

  progress("Sending reports via WhatsApp…");
  const res = await api.post("/manager-assignments/send-report", {
    reports,
    classroomId,
    clientSendId: crypto.randomUUID(),
  });

  const summary = res.data.summary || [];
  const succeeded = summary.filter((r) => r.status === "fulfilled").length;
  const failed = summary.filter((r) => r.status === "rejected").length;

  progress(
    `Reports sent — ${succeeded} succeeded` +
      (failed ? `, ${failed} failed` : "") +
      "."
  );

  return { succeeded, failed, total: summary.length };
}

export function formatNumberedList(items, labelFn) {
  return items
    .map((item, i) => `${i + 1}. ${labelFn(item)}`)
    .join("\n");
}

export function parseChoice(input, max) {
  const n = Number(String(input || "").trim());
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

export function parseYesNo(input) {
  const t = String(input || "")
    .trim()
    .toLowerCase();
  if (t === "1" || t === "y" || t === "yes") return true;
  if (t === "2" || t === "n" || t === "no") return false;
  return null;
}
