import { useId, useMemo, useState } from "react";
import { rowsFromColumns, expectedRowsError } from "./expectedQuestionColumns";

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
  const error = expectedRowsError(rows);
  if (error) throw new Error(error);
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
  const [mode, setMode] = useState("table");
  const [columns, setColumns] = useState({ questions: "", marks: "" });
  const id = useId();
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
  const error = expectedRowsError(safeRows);
  const textColumns = columns.rows === rows ? columns : {
    questions: safeRows.map(r => r.label).join("\n"),
    marks: safeRows.map(r => r.marks).join("\n"),
  };

  function changeMode(next) {
    if (next === "text") {
      setColumns({ questions: safeRows.map(r => r.label).join("\n"), marks: safeRows.map(r => r.marks).join("\n"), rows });
    }
    setMode(next);
  }

  function updateColumn(key, value) {
    if (disabled) return;
    const next = { ...textColumns, [key]: value };
    const nextRows = rowsFromColumns(next.questions, next.marks);
    setColumns({ ...next, rows: nextRows });
    onChange(nextRows);
  }

  return (
    <div className="expected-q-table-wrap">
      <div className="expected-q-table-head">
        <strong>{label}</strong>
        {hint ? <span className="muted small">{hint}</span> : null}
      </div>
      <div className="expected-q-entry-modes" role="group" aria-label={`${label} entry method`}>
        <button type="button" disabled={disabled} aria-pressed={mode === "table"} onClick={() => changeMode("table")}>Table</button>
        <button type="button" disabled={disabled} aria-pressed={mode === "text"} onClick={() => changeMode("text")}>Text</button>
      </div>
      {mode === "text" ? <>
        <p id={`${id}-hint`} className="muted small">Enter one question and one mark per line. Matching lines belong together. Marks may be left blank if unknown.</p>
        <div className="expected-q-text-columns">
          <label htmlFor={`${id}-questions`}>Questions
            <textarea id={`${id}-questions`} rows={8} wrap="off" spellCheck={false} disabled={disabled}
              value={textColumns.questions} placeholder={"1a\n1b\n2a\n3a"} aria-describedby={`${id}-hint`}
              onChange={e => updateColumn("questions", e.target.value)} />
          </label>
          <label htmlFor={`${id}-marks`}>Marks
            <textarea id={`${id}-marks`} rows={8} wrap="off" spellCheck={false} disabled={disabled}
              value={textColumns.marks} placeholder={"1\n3\n2\n2"} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={Boolean(error)}
              onChange={e => updateColumn("marks", e.target.value)} />
          </label>
        </div>
      </> : <div className="expected-q-table-scroll">
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
      </div>}
      {error && <p id={`${id}-error`} className="error" role="alert">{error}</p>}
      <div className="expected-q-table-foot">
        {mode === "table" && <button type="button" className="expected-q-add" disabled={disabled} onClick={addRow}>
          + Add question
        </button>}
        <span className="muted small">
          {safeRows.filter((r) => String(r.label || "").trim()).length} questions
          {marksTotal > 0 ? ` · ${marksTotal} marks` : ""}
        </span>
      </div>
    </div>
  );
}
