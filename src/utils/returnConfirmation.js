import { confirmToast } from "./confirmToast";

/**
 * Confirm returning a single graded paper to a student.
 */
export function confirmReturnSingle(studentName, { rereturn = false } = {}) {
  const name = (studentName || "").trim() || "this student";
  return confirmToast(
    rereturn
      ? `Return the graded paper to ${name} again? Their existing marked PDF and grade in Google Classroom will be refreshed with the current version.`
      : `Are you sure you want to return the graded paper to ${name}? The student will receive the annotated PDF via Google Classroom.`,
    {
      title: rereturn ? "Return graded paper again" : "Return graded paper",
      confirmLabel: rereturn ? "Return again" : "Return",
      cancelLabel: "Cancel",
      danger: true,
    }
  );
}

/**
 * Confirm returning multiple graded papers (Return All).
 */
export function confirmReturnAll(count) {
  const n = Number(count) || 0;
  const papersLabel = n === 1 ? "1 graded paper" : `${n} graded papers`;
  return confirmToast(
    `Are you sure you want to return ${papersLabel} to students? Each student will receive their annotated PDF via Google Classroom.`,
    {
      title: "Return all graded papers",
      confirmLabel: n === 1 ? "Return" : `Return all (${n})`,
      cancelLabel: "Cancel",
      danger: true,
      toastId: "return-all-confirm",
    }
  );
}
