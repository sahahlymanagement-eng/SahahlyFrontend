/**
 * Frontend helpers for teacher AI Agent actions (Phases 2–5).
 * Uses additive /teacher-chatbot/actions/* endpoints + existing send-report.
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

export async function loadClassrooms(personId) {
  const { data } = await api.get("/teacher-chatbot/actions/classrooms", {
    params: { personId },
  });
  return data.classrooms || [];
}

export async function loadAssignments(personId, classroomId) {
  const { data } = await api.get("/teacher-chatbot/actions/assignments", {
    params: { personId, classroomId },
  });
  return data.assignments || [];
}

export async function loadStudents(personId, { assignmentId, classroomId }) {
  const { data } = await api.get("/teacher-chatbot/actions/students", {
    params: { personId, assignmentId, classroomId },
  });
  return data.students || [];
}

export async function prepareAssignmentReport(body) {
  const { data } = await api.post(
    "/teacher-chatbot/actions/prepare-assignment-report",
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
  const { data } = await api.get("/teacher-chatbot/actions/monthly-preview", {
    params,
  });
  return data.report;
}

export async function sendMonthly(body) {
  const { data } = await api.post("/teacher-chatbot/actions/send-monthly", {
    ...body,
    clientSendId: body.clientSendId || crypto.randomUUID(),
  });
  return data;
}

export async function loadAssistantMetrics(personId) {
  const { data } = await api.get("/teacher-chatbot/actions/assistant-metrics", {
    params: { personId },
  });
  return data;
}

export async function createCoursework(body) {
  const { data } = await api.post(
    "/teacher-chatbot/actions/create-coursework",
    body
  );
  return data;
}

export async function downloadGradesExcel(personId, assignmentId, targetMax) {
  const res = await api.get(
    `/teacher-chatbot/actions/export-grades/${assignmentId}`,
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

export async function sendExecutiveReport(body) {
  const { data } = await api.post("/reports/assignment-executive/send", {
    ...body,
    clientSendId: body.clientSendId || crypto.randomUUID(),
  });
  return data;
}

export async function sendTeacherCollectiveReport(body) {
  const { data } = await api.post("/manager-assignments/send-teacher-collective-report", {
    ...body,
    clientSendId: body.clientSendId || crypto.randomUUID(),
  });
  return data;
}

/* ── Submission Viewer ── */

export async function loadSubmissionOverview(personId, assignmentId) {
  const { data } = await api.get(
    `/teacher-chatbot/actions/submissions/${assignmentId}`,
    { params: { personId } }
  );
  return data;
}

export async function loadStudentSubmission(personId, assignmentId, studentName) {
  const { data } = await api.get(
    `/teacher-chatbot/actions/submissions/${assignmentId}`,
    { params: { personId, studentName } }
  );
  return data;
}

/* ── Students ── */

export async function loadStudentContacts(personId, classroomId) {
  const { data } = await api.get(
    `/teacher-chatbot/actions/student-contacts/${classroomId}`,
    { params: { personId } }
  );
  return data;
}

export async function syncStudentRoster(body) {
  const { data } = await api.post(
    "/teacher-chatbot/actions/sync-student-roster",
    body
  );
  return data;
}

export async function updateStudentContact(body) {
  const { data } = await api.put(
    "/teacher-chatbot/actions/update-student-contact",
    body
  );
  return data;
}

/* ── Grades & Google Classroom sync ── */

export async function pushClassroomGrades(body) {
  const { data } = await api.post(
    "/teacher-chatbot/actions/push-classroom-grades",
    body
  );
  return data;
}

export async function syncClassroom(body) {
  const { data } = await api.post("/teacher-chatbot/actions/sync-classroom", body);
  return data;
}

export async function syncCourseworkFromGoogle(body) {
  const { data } = await api.post(
    "/teacher-chatbot/actions/sync-coursework-from-google",
    body
  );
  return data;
}

export const ACTION_MENU =
  "What would you like to do?\n\n" +
  "1. Send assignment grade reports (WhatsApp)\n" +
  "2. Send monthly parent report (WhatsApp)\n" +
  "3. Show assistant workload\n" +
  "4. Create an assignment\n" +
  "5. Export grades to Excel\n" +
  "6. View submissions for an assignment\n" +
  "7. View one student's marked submission\n" +
  "8. View student contacts (parent phones)\n\n" +
  "Reply with a number. Preview always comes before any send.";
