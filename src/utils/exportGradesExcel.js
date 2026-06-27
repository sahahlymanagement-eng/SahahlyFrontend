import * as XLSX from "xlsx";
import { isStudentSubmitted, resolveSavedMarkingGrade, getResultMaxTotal } from "./markingFormData";
import { computeGradePercent } from "./reportGradePercent";

export function scaleGradeToTarget({ assignedGrade, maxPoints, percentOverride, targetMax }) {
  const target = Number(targetMax);
  if (!Number.isFinite(target) || target <= 0) return null;

  const grade = Number(assignedGrade);
  const max = Number(maxPoints);
  if (!Number.isFinite(grade) || !Number.isFinite(max) || max <= 0) return null;

  const percentRaw =
    percentOverride != null && percentOverride !== ""
      ? percentOverride
      : computeGradePercent(grade, max);
  const percent = Number(percentRaw);
  if (!Number.isFinite(percent)) return null;

  return Math.round((percent / 100) * target * 100) / 100;
}

export function formatScaledGrade(scaled) {
  if (scaled == null || !Number.isFinite(scaled)) return null;
  return scaled.toFixed(2);
}

export function buildGradeExportRow(
  student,
  { targetMax, assignmentMaxPoints, savedResults, percentOverrides }
) {
  const name = String(student?.name || "—").trim() || "—";

  if (!isStudentSubmitted(student?.state)) {
    return { name, gradeDisplay: "didn't submit" };
  }

  const savedRow = savedResults?.[student.submissionId];
  const assignedGrade =
    student.assignedGrade != null
      ? student.assignedGrade
      : resolveSavedMarkingGrade(savedRow);

  const maxPoints =
    Number(assignmentMaxPoints) > 0
      ? Number(assignmentMaxPoints)
      : getResultMaxTotal(savedRow?.result) || null;

  const scaled = scaleGradeToTarget({
    assignedGrade,
    maxPoints,
    percentOverride: percentOverrides?.[student.submissionId],
    targetMax,
  });

  return {
    name,
    gradeDisplay: scaled != null ? formatScaledGrade(scaled) : "—",
  };
}

export function buildGradesExcelRows(students, options) {
  return (students || [])
    .map((student) => buildGradeExportRow(student, options))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function sanitizeExcelFilenameBase(title) {
  return String(title || "assignment")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_") || "assignment";
}

export function downloadGradesExcel({ filename, rows, targetMax }) {
  const header = ["Name", `Grade (/${targetMax})`];
  const data = [header, ...(rows || []).map((row) => [row.name, row.gradeDisplay])];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Grades");
  XLSX.writeFile(workbook, filename);
}

export function exportAssignmentGradesExcel({
  students,
  targetMax,
  assignmentMaxPoints,
  savedResults,
  percentOverrides,
  filename,
}) {
  const rows = buildGradesExcelRows(students, {
    targetMax,
    assignmentMaxPoints,
    savedResults,
    percentOverrides,
  });
  downloadGradesExcel({ filename, rows, targetMax });
}
