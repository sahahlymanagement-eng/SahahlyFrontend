import { useMemo } from "react";

export function emptyExpectedRow() {
  return { label: "", marks: "" };
}

/** Parse stored/API text (`1(a) | 2`) into table rows. */
export function rowsFromExpectedText(text) {
  const lines = String(text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [emptyExpectedRow()];
  return lines.map((line) => {
    const marked = line.match(/^(.+?)\s*(?:[|=:]|\t)\s*(\d+(?:\.\d+)?)\s*$/);
    if (marked) return { label: marked[1].trim(), marks: String(Number(marked[2])) };
    return { label: line, marks: "" };
  });
}

export function rowsFromExamLists(labels = [], maxMarks = []) {
  if (!labels?.length) return [emptyExpectedRow()];
  return labels.map((label, i) => {
    const marks = maxMarks?.[i];
    return {
      label: String(label ?? ""),
      marks: marks != null && marks !== "" && Number.isFinite(Number(marks)) ? String(Number(marks)) : "",
    };
  });
}

/** Serialize table rows for the indexing API (same wire format as before). */
export function textFromExpectedRows(rows) {
  return (rows || [])
    .map((row) => {
      const label = String(row?.label ?? "").trim();
      if (!label) return "";
      const marks = String(row?.marks ?? "").trim();
      if (marks !== "" && Number.isFinite(Number(marks))) return `${label} | ${Number(marks)}`;
      return label;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Friendly question + marks table for indexing expected lists.
 */
export default function ExpectedQuestionsTable({
  label,
  hint,
  rows,
  onChange,
  disabled = false,
}) {
  const safeRows = useMemo(
    () => (Array.isArray(rows) && rows.length ? rows : [emptyExpectedRow()]),
    [rows]
  );

  function updateRow(index, patch) {
    if (disabled) return;
    onChange(safeRows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (disabled) return;
    onChange([...safeRows, emptyExpectedRow()]);
  }

  function removeRow(index) {
    if (disabled) return;
    const next = safeRows.filter((_, i) => i !== index);
    onChange(next.length ? next : [emptyExpectedRow()]);
  }

  const marksTotal = safeRows.reduce((sum, row) => {
    const n = Number(row.marks);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  return (
    <div className="expected-q-table-wrap">
      <div className="expected-q-table-head">
        <strong>{label}</strong>
        {hint ? <span className="muted small">{hint}</span> : null}
      </div>
      <div className="expected-q-table-scroll">
        <table className="expected-q-table">
          <thead>
            <tr>
              <th scope="col" className="expected-q-col-num">#</th>
              <th scope="col">Question</th>
              <th scope="col" className="expected-q-col-marks">Marks</th>
              <th scope="col" className="expected-q-col-actions" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, index) => (
              <tr key={index}>
                <td className="expected-q-col-num muted">{index + 1}</td>
                <td>
                  <input
                    type="text"
                    value={row.label}
                    disabled={disabled}
                    placeholder="e.g. 1(a)"
                    aria-label={`Question ${index + 1} label`}
                    onChange={(e) => updateRow(index, { label: e.target.value })}
                  />
                </td>
                <td className="expected-q-col-marks">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={row.marks}
                    disabled={disabled}
                    placeholder="0"
                    aria-label={`Question ${index + 1} marks`}
                    onChange={(e) => updateRow(index, { marks: e.target.value })}
                  />
                </td>
                <td className="expected-q-col-actions">
                  <button
                    type="button"
                    className="expected-q-remove"
                    disabled={disabled || (safeRows.length === 1 && !row.label && !row.marks)}
                    onClick={() => removeRow(index)}
                    aria-label={`Remove question ${index + 1}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="expected-q-table-foot">
        <button type="button" className="expected-q-add" disabled={disabled} onClick={addRow}>
          + Add question
        </button>
        <span className="muted small">
          {safeRows.filter((r) => String(r.label || "").trim()).length} questions
          {marksTotal > 0 ? ` · ${marksTotal} marks` : ""}
        </span>
      </div>
    </div>
  );
}
