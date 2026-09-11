export function rowsFromColumns(questions, marks) {
  const labels = String(questions ?? "").replace(/\r\n?/g, "\n").split("\n");
  const values = String(marks ?? "").replace(/\r\n?/g, "\n").split("\n");
  return Array.from({ length: Math.max(labels.length, values.length) }, (_, i) => ({
    label: labels[i] ?? "",
    marks: values[i] ?? "",
  }));
}

export function expectedRowsError(rows) {
  for (const [i, row] of (rows || []).entries()) {
    const label = String(row.label ?? "").trim();
    const marks = String(row.marks ?? "").trim();
    if (marks && !label) return `Line ${i + 1}: enter a question for these marks.`;
    if (marks && (!/^\d+(?:\.\d+)?$/.test(marks) || !Number.isFinite(Number(marks)))) {
      return `Line ${i + 1}: marks must be a non-negative number.`;
    }
  }
  return "";
}
