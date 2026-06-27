/** Round grade ÷ max to 0–100 for report display. */
export function computeGradePercent(assignedGrade, maxPoints) {
  const grade = Number(assignedGrade);
  const max = Number(maxPoints);
  if (!Number.isFinite(grade) || !Number.isFinite(max) || max <= 0) return "";
  return String(Math.round((grade / max) * 100));
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
  if (storedPercent != null && storedPercent !== "") {
    return String(storedPercent);
  }
  return computeGradePercent(assignedGrade, maxPoints);
}
