import { resolveSavedMarkingGrade } from "./markingFormData";
import {
  computeGradePercent,
  normalizeAssignedGrade,
  parsePercentInput,
} from "./reportGradePercent";

export function parseGradeInput(value, maxPoints) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const max = Number(maxPoints);
  if (Number.isFinite(max) && max > 0) {
    return Math.max(0, Math.min(max, Math.round(n)));
  }
  return Math.max(0, Math.round(n));
}

export function gradeFromPercent(percent, maxPoints) {
  const pct = Number(percent);
  const max = Number(maxPoints);
  if (!Number.isFinite(pct) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((pct / 100) * max);
}

/** Grade shown in the submission table (override → synced Classroom → saved AI → Classroom). */
export function resolveTableGrade(
  submissionId,
  student,
  gradeOverrides,
  savedResults,
  classroomSyncedGrades = {},
  maxPoints = null
) {
  let grade = null;
  if (
    submissionId &&
    gradeOverrides?.[submissionId] != null &&
    gradeOverrides[submissionId] !== ""
  ) {
    grade = gradeOverrides[submissionId];
  } else if (
    submissionId &&
    classroomSyncedGrades?.[submissionId] != null &&
    classroomSyncedGrades[submissionId] !== ""
  ) {
    grade = classroomSyncedGrades[submissionId];
  } else {
    const persistedClassroom = savedResults?.[submissionId]?.classroomAssignedGrade;
    if (persistedClassroom != null && persistedClassroom !== "") {
      grade = Number(persistedClassroom);
    } else {
      const fromSaved = resolveSavedMarkingGrade(savedResults?.[submissionId]);
      if (fromSaved != null) grade = fromSaved;
      else if (student?.aiGrade != null && student.aiGrade !== "") {
        grade = Number(student.aiGrade);
      } else if (student?.assignedGrade != null) {
        grade = student.assignedGrade;
      }
    }
  }

  if (grade == null || grade === "") return null;
  if (maxPoints != null && Number(maxPoints) > 0) {
    return normalizeAssignedGrade(grade, maxPoints);
  }
  const n = Number(grade);
  return Number.isFinite(n) ? n : null;
}

/** Grade posted to Google Classroom on return. */
export function resolveClassroomReturnGrade(
  submissionId,
  student,
  gradeOverrides,
  savedResults,
  fallbackTotal = null,
  classroomSyncedGrades = {},
  maxPoints = null
) {
  const fromTable = resolveTableGrade(
    submissionId,
    student,
    gradeOverrides,
    savedResults,
    classroomSyncedGrades,
    maxPoints
  );
  if (fromTable != null) return fromTable;
  if (fallbackTotal != null) {
    if (maxPoints != null && Number(maxPoints) > 0) {
      return normalizeAssignedGrade(fallbackTotal, maxPoints);
    }
    return Number(fallbackTotal);
  }
  return null;
}

export function appendClassroomGradeToFormData(
  fd,
  {
    submissionId,
    student,
    gradeOverrides,
    savedResults,
    fallbackTotal,
    classroomSyncedGrades,
    maxPoints = null,
  }
) {
  const grade = resolveClassroomReturnGrade(
    submissionId,
    student,
    gradeOverrides,
    savedResults,
    fallbackTotal,
    classroomSyncedGrades,
    maxPoints
  );
  if (grade != null && Number.isFinite(grade)) {
    fd.append("classroomGrade", String(grade));
  }
}

/** Grades edited in the table that should be pushed to Google Classroom on refresh. */
export function buildGradesToPush(
  gradeOverrides,
  students = [],
  savedResults = {},
  classroomSyncedGrades = {}
) {
  const byId = new Map((students || []).map((s) => [s.submissionId, s]));

  return Object.entries(gradeOverrides || {})
    .filter(([submissionId, grade]) => {
      if (!submissionId || grade == null || grade === "") return false;
      const num = Number(grade);
      if (!Number.isFinite(num)) return false;

      const student = byId.get(submissionId);
      if (student) {
        const current = resolveTableGrade(
          submissionId,
          student,
          {},
          savedResults,
          classroomSyncedGrades
        );
        if (current != null && Math.round(num) === Math.round(Number(current))) {
          return false;
        }
      }
      return true;
    })
    .map(([submissionId, grade]) => ({
      submissionId,
      assignedGrade: Math.round(Number(grade)),
    }));
}

export function studentHasEditableGrade(submissionId, student, savedResults) {
  if (resolveTableGrade(submissionId, student, {}, savedResults) != null) {
    return true;
  }
  if (student?.aiGrade != null && student.aiGrade !== "") return true;
  return Boolean(savedResults?.[submissionId]);
}
