import { resolveSavedMarkingGrade } from "./markingFormData.js";
import {
  computeGradePercent,
  normalizeAssignedGrade,
  parsePercentInput,
} from "./reportGradePercent.js";

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

/**
 * Grade shown in the submission table.
 *
 * Priority: table override → current AI/teacher marking draft → Classroom
 * (synced or last-returned) → roster fields.
 *
 * Classroom must not win over a saved marking result: after rematch the draft
 * is the live total, while classroomAssignedGrade can still hold the previous
 * return (e.g. list 20/56 while Results shows 45/56).
 */
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
  } else {
    const fromSaved = resolveSavedMarkingGrade(savedResults?.[submissionId]);
    if (fromSaved != null) {
      grade = fromSaved;
    } else if (
      submissionId &&
      classroomSyncedGrades?.[submissionId] != null &&
      classroomSyncedGrades[submissionId] !== ""
    ) {
      grade = classroomSyncedGrades[submissionId];
    } else {
      const persistedClassroom =
        savedResults?.[submissionId]?.classroomAssignedGrade;
      if (persistedClassroom != null && persistedClassroom !== "") {
        grade = Number(persistedClassroom);
      } else if (student?.aiGrade != null && student.aiGrade !== "") {
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
  // A deliberate grade typed in the table is the only value allowed to beat
  // the corrected marking result being returned.
  if (
    submissionId &&
    gradeOverrides?.[submissionId] != null &&
    gradeOverrides[submissionId] !== ""
  ) {
    const override = Number(gradeOverrides[submissionId]);
    if (Number.isFinite(override)) {
      return maxPoints != null && Number(maxPoints) > 0
        ? normalizeAssignedGrade(override, maxPoints)
        : override;
    }
  }

  // Prefer the canonical saved marking when this live submission id maps
  // directly to it. This is the teacher-confirmed result, not Classroom's old
  // assignedGrade from the student roster.
  const savedGrade = resolveSavedMarkingGrade(savedResults?.[submissionId]);
  if (savedGrade != null && Number.isFinite(Number(savedGrade))) {
    return maxPoints != null && Number(maxPoints) > 0
      ? normalizeAssignedGrade(savedGrade, maxPoints)
      : Number(savedGrade);
  }

  // Return All can re-key a stale Classroom submission id to a live one. In
  // that case savedResults[liveId] is absent, but fallbackTotal is computed
  // from the exact corrected result/PDF currently being returned. It must win
  // over student.assignedGrade and classroomAssignedGrade, which describe the
  // previous return (e.g. edited 22 -> 28 must post 28, not the old 22).
  if (fallbackTotal != null && Number.isFinite(Number(fallbackTotal))) {
    return maxPoints != null && Number(maxPoints) > 0
      ? normalizeAssignedGrade(fallbackTotal, maxPoints)
      : Number(fallbackTotal);
  }

  const fromTable = resolveTableGrade(
    submissionId,
    student,
    gradeOverrides,
    savedResults,
    classroomSyncedGrades,
    maxPoints
  );
  if (fromTable != null) return fromTable;
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
