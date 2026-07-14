/** Round grade ÷ max to 0–100 for report display. */
export function computeGradePercent(assignedGrade, maxPoints) {
  const grade = Number(assignedGrade);
  const max = Number(maxPoints);
  if (!Number.isFinite(grade) || !Number.isFinite(max) || max <= 0) return "";
  // Classroom sometimes stores a percentage as assignedGrade while maxPoints is the raw total.
  if (grade > max && grade <= 100 && max < 100) {
    return String(Math.round(grade));
  }
  return String(Math.min(100, Math.round((grade / max) * 100)));
}

/**
 * Prefer live score/max %. Drop stale cart overrides (0% after a real score, or wild mismatches).
 */
export function resolveReportDisplayPercent(assignedGrade, maxPoints, storedPercent) {
  const auto = computeGradePercent(assignedGrade, maxPoints);
  if (storedPercent == null || storedPercent === "") return auto || null;

  const storedN = Number(storedPercent);
  if (!Number.isFinite(storedN)) return auto || null;

  const autoN = auto === "" ? null : Number(auto);
  if (autoN != null) {
    // Tiny rounding only; ignore stale cart % (0 after real score, or leftover 97 on 8/8).
    if (Math.abs(storedN - autoN) <= 1) {
      return String(Math.max(0, Math.min(100, Math.round(storedN))));
    }
    return auto;
  }
  return String(Math.max(0, Math.min(100, Math.round(storedN))));
}

/** Assignment max points from Classroom DB, else from saved AI marking results. */
export function resolveAssignmentMaxPoints(assignment, savedResultsMap = {}) {
  const fromAssignment = Number(assignment?.maxPoints);
  if (Number.isFinite(fromAssignment) && fromAssignment > 0) {
    return fromAssignment;
  }

  for (const sr of Object.values(savedResultsMap || {})) {
    const max =
      Number(sr?.result?.maxTotalMarks) ||
      Number(sr?.result?.criteriaGrade?.maxTotalMarks);
    if (Number.isFinite(max) && max > 0) return max;
  }

  return null;
}

/** Parse editable % field; clamps 0–100. Empty string → null. */
export function parsePercentInput(value) {
  const raw = String(value ?? "").trim().replace(/%/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function displayPercent(assignedGrade, maxPoints, storedPercent) {
  return (
    resolveReportDisplayPercent(assignedGrade, maxPoints, storedPercent) || ""
  );
}
