function isStudentSubmitted(state) {
  return state === "TURNED_IN" || state === "RETURNED";
}

export function getSubmissionStatusDisplay(student) {
  if (isStudentSubmitted(student?.state)) {
    if (student?.hasAttachment === false) {
      return { tone: "yellow", label: "No attachment" };
    }
    if (student?.isLate) return { tone: "orange", label: "Late" };
    if (student?.isOnTime) return { tone: "green", label: "On Time" };
    return { tone: "green", label: "Submitted" };
  }
  if (student?.state === "NEW" || student?.state === "CREATED") {
    return { tone: "red", label: "Not Submitted" };
  }
  return { tone: "gray", label: student?.state || "Unknown" };
}

export function SubmissionStatusBadge({ student }) {
  const { tone, label } = getSubmissionStatusDisplay(student);
  return <span className={`ma-badge ma-badge--${tone}`}>{label}</span>;
}
