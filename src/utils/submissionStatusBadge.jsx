export function getSubmissionStatusDisplay(student) {
  const state = student?.state;

  if (state === "RETURNED") {
    return { tone: "blue", label: "Returned" };
  }

  if (state === "TURNED_IN") {
    if (student?.hasAttachment === false) {
      return { tone: "yellow", label: "No attachment" };
    }
    if (student?.isLate) return { tone: "orange", label: "Late" };
    if (student?.isOnTime) return { tone: "green", label: "On Time" };
    return { tone: "green", label: "Submitted" };
  }

  if (state === "NEW" || state === "CREATED") {
    return { tone: "red", label: "Not Submitted" };
  }

  return { tone: "gray", label: state || "Unknown" };
}

export function SubmissionStatusBadge({ student }) {
  const { tone, label } = getSubmissionStatusDisplay(student);
  return <span className={`ma-badge ma-badge--${tone}`}>{label}</span>;
}
