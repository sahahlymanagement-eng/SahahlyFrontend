import {
  parseGradeInput,
  resolveTableGrade,
  studentHasEditableGrade,
} from "../utils/submissionGrades";

export default function SubmissionGradeInput({
  student,
  submissionId,
  assignmentMaxPoints,
  gradeOverrides,
  savedResults,
  classroomSyncedGrades = {},
  onGradeChange,
}) {
  if (!studentHasEditableGrade(submissionId, student, savedResults)) {
    return <span className="ma-cell-empty">—</span>;
  }

  let displayGrade = resolveTableGrade(
    submissionId,
    student,
    gradeOverrides,
    savedResults,
    classroomSyncedGrades,
    assignmentMaxPoints
  );

  // Saved AI result with no extractable total still deserves a visible cell
  // (e.g. after safe batch before totals are normalized).
  if (displayGrade == null && savedResults?.[submissionId]?.result) {
    displayGrade = 0;
  }

  if (displayGrade == null) {
    return <span className="ma-cell-empty">—</span>;
  }

  const max = Number(assignmentMaxPoints) > 0 ? Number(assignmentMaxPoints) : undefined;

  return (
    <div className="ma-grade-wrap">
      <input
        type="number"
        min={0}
        max={max}
        step={1}
        className="ma-grade-input"
        value={gradeOverrides?.[submissionId] ?? displayGrade}
        onChange={(e) => onGradeChange(submissionId, parseGradeInput(e.target.value, max))}
        title="Confirm grade before returning to Classroom"
      />
      {max ? (
        <span className="ma-grade-suffix">/ {max}</span>
      ) : null}
    </div>
  );
}
