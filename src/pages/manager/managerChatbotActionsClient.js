/**
 * Frontend helpers for manager AI Agent actions.
 */

import api from "../../api/api";
import { downloadBlob } from "../../utils/downloadBlob";

export function formatNumberedList(items, labelFn) {
  return items.map((item, i) => `${i + 1}. ${labelFn(item)}`).join("\n");
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

export async function transcribeVoiceCommand(blob) {
  const form = new FormData();
  form.append("audio", blob, "voice.webm");
  const { data } = await api.post("/manager-chatbot/actions/transcribe-audio", form);
  return data.text || "";
}

export async function loadClassrooms(personId) {
  const { data } = await api.get("/manager-chatbot/actions/classrooms", {
    params: { personId },
  });
  return data.classrooms || [];
}

export async function loadAssignments(personId, classroomId) {
  const { data } = await api.get("/manager-chatbot/actions/assignments", {
    params: { personId, classroomId },
  });
  return data.assignments || [];
}

export async function loadStudents(personId, { assignmentId, classroomId }) {
  const { data } = await api.get("/manager-chatbot/actions/students", {
    params: { personId, assignmentId, classroomId },
  });
  return data.students || [];
}

export async function loadSentHistory(personId, classroomId) {
  const { data } = await api.get("/manager-chatbot/actions/sent-history", {
    params: { personId, classroomId: classroomId || undefined },
  });
  return data;
}

export async function prepareAssignmentReport(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/prepare-assignment-report",
    body
  );
  return data;
}

export async function previewAssignmentReport(classroomId, reports) {
  const { data } = await api.post("/manager-assignments/report-preview", {
    classroomId,
    reports,
  });
  return data.previews || [];
}

export async function sendAssignmentReport(
  classroomId,
  reports,
  messageOverrides,
  options = {}
) {
  const payload = {
    classroomId,
    reports,
    clientSendId: crypto.randomUUID(),
    ...(options.forceResend ? { forceResend: true } : {}),
  };
  if (messageOverrides) payload.messageOverrides = messageOverrides;
  const { data } = await api.post("/manager-assignments/send-report", payload);
  return data;
}

export async function previewMonthly(params) {
  const { data } = await api.get("/manager-chatbot/actions/monthly-preview", {
    params,
  });
  return data.report;
}

export async function sendMonthly(body) {
  const { data } = await api.post("/manager-chatbot/actions/send-monthly", {
    ...body,
    clientSendId: body.clientSendId || crypto.randomUUID(),
  });
  return data;
}

export async function loadAssistantMetrics(personId) {
  const { data } = await api.get("/manager-chatbot/actions/assistant-metrics", {
    params: { personId },
  });
  return data;
}

export async function createCoursework(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/create-coursework",
    body
  );
  return data;
}

export async function downloadGradesExcel(personId, assignmentId, targetMax) {
  const res = await api.get(
    `/manager-chatbot/actions/export-grades/${assignmentId}`,
    {
      params: { personId, targetMax },
      responseType: "blob",
    }
  );
  const disposition = res.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || "grades.xlsx";
  downloadBlob(res.data, filename);
  return filename;
}

export async function assignAssistant(body) {
  const { data } = await api.post("/manager-chatbot/actions/assign-assistant", body);
  return data;
}

export async function changeAssistant(body) {
  const { data } = await api.put("/manager-chatbot/actions/change-assistant", body);
  return data;
}

export async function removeAssistant(body) {
  const { data } = await api.delete("/manager-chatbot/actions/remove-assistant", {
    data: body,
  });
  return data;
}

export async function runAutomation(body) {
  const { data } = await api.post("/manager-chatbot/actions/run-automation", body);
  return data;
}

export async function startBatchMarking(body) {
  const { data } = await api.post("/manager-chatbot/actions/start-batch-marking", body);
  return data;
}

export async function startPriorityMarking(body) {
  const { data } = await api.post("/manager-chatbot/actions/start-priority-marking", body);
  return data;
}

export async function verifyMarkScheme(body) {
  const { data } = await api.post("/manager-chatbot/actions/verify-mark-scheme", body);
  return data;
}

export async function generateAssignmentPrompt(body) {
  const { data } = await api.post("/manager-chatbot/actions/generate-assignment-prompt", body);
  return data;
}

export async function cancelBatchJob(body) {
  const { data } = await api.post("/manager-chatbot/actions/cancel-batch-job", body);
  return data;
}

export async function pushClassroomGrades(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/push-classroom-grades",
    body
  );
  return data;
}

export async function syncClassroom(body) {
  const { data } = await api.post("/manager-chatbot/actions/sync-classroom", body);
  return data;
}

export async function sendExecutiveReport(body) {
  const { data } = await api.post("/manager-chatbot/actions/send-executive-report", {
    ...body,
    clientSendId: body.clientSendId || crypto.randomUUID(),
  });
  return data;
}

export async function sendTeacherCollectiveReport(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/send-teacher-collective-report",
    {
      ...body,
      clientSendId: body.clientSendId || crypto.randomUUID(),
    }
  );
  return data;
}

/* ── Submission Viewer ── */

export async function loadSubmissionOverview(personId, assignmentId) {
  const { data } = await api.get(
    `/manager-chatbot/actions/submissions/${assignmentId}`,
    { params: { personId } }
  );
  return data;
}

export async function loadStudentSubmission(personId, assignmentId, studentName) {
  const { data } = await api.get(
    `/manager-chatbot/actions/submissions/${assignmentId}`,
    { params: { personId, studentName } }
  );
  return data;
}

/* ── Students Data ── */

export async function loadStudentContacts(personId, classroomId) {
  const { data } = await api.get(
    `/manager-chatbot/actions/student-contacts/${classroomId}`,
    { params: { personId } }
  );
  return data;
}

export async function syncStudentRoster(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/sync-student-roster",
    body
  );
  return data;
}

export async function updateStudentContact(body) {
  const { data } = await api.put(
    "/manager-chatbot/actions/update-student-contact",
    body
  );
  return data;
}

/* ── WhatsApp Scheduler ── */

export async function loadWhatsAppGroups(includeInactive = false) {
  const { data } = await api.get("/manager-chatbot/actions/whatsapp-groups", {
    params: includeInactive ? { includeInactive: true } : {},
  });
  return data;
}

export async function loadScheduledWhatsApp(params = {}) {
  const { data } = await api.get("/manager-chatbot/actions/scheduled-whatsapp", {
    params,
  });
  return data;
}

export async function scheduleWhatsAppMessage(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/schedule-whatsapp",
    body
  );
  return data;
}

/** @param {"send-now"|"cancel"|"delete"} action */
export async function actOnScheduledWhatsApp(scheduledMessageId, action, body) {
  const { data } = await api.post(
    `/manager-chatbot/actions/scheduled-whatsapp/${scheduledMessageId}/${action}`,
    body
  );
  return data;
}

/* ── Automation & Course Management ── */

export async function loadAutomationStatus(personId, assignmentId) {
  const { data } = await api.get(
    `/manager-chatbot/actions/automation-status/${assignmentId}`,
    { params: { personId } }
  );
  return data;
}

export async function continueAutomation(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/continue-automation",
    body
  );
  return data;
}

export async function syncCourseworkFromGoogle(body) {
  const { data } = await api.post(
    "/manager-chatbot/actions/sync-coursework-from-google",
    body
  );
  return data;
}

export const MANAGER_ACTION_MENU =
  "What would you like to do?\n\n" +
  "1. Send assignment grade reports (WhatsApp)\n" +
  "2. Send monthly parent report (WhatsApp)\n" +
  "3. Show assistant workload\n" +
  "4. Assign assistant to assignment\n" +
  "5. Change assistant on assignment\n" +
  "6. Remove assistant from assignment\n" +
  "7. Export grades to Excel\n" +
  "8. Send teacher collective PDF report\n" +
  "9. Send executive analysis report\n" +
  "10. Run marking automation\n" +
  "11. Push grades to Google Classroom\n" +
  "12. Sync submissions from Classroom\n" +
  "13. View sent reports history\n" +
  "14. View submissions for an assignment\n" +
  "15. View one student's marked submission\n" +
  "16. Schedule a WhatsApp message to a group\n" +
  "17. View / cancel scheduled WhatsApp messages\n" +
  "18. View student contacts (parent phones)\n" +
  "19. Import all Google Classroom assignments\n\n" +
  "Reply with a number. Preview always comes before any send.";
