import { FileDrop } from "../ui.jsx";
import ExpectedQuestionsTable, { emptyExpectedRow } from "./ExpectedQuestionsTable.jsx";

// One complete setup form shared by the library and the connected assignment dialog.
export default function ExamSetupFields({ form, setForm: onChange, disabled = false }) {
  const setForm = (update) => {
    if (!disabled) onChange(update);
  };
  const qpRows = Array.isArray(form.expectedQpRows) ? form.expectedQpRows : [emptyExpectedRow()];
  const msRows = Array.isArray(form.expectedMsRows) ? form.expectedMsRows : [emptyExpectedRow()];

  return (
    <fieldset className="exam-setup-fields" disabled={disabled}>
      <div className="drops">
        <FileDrop
          label="Question paper"
          hint="The blank QP"
          file={form.questionPaper}
          onFile={(file) => setForm((f) => ({ ...f, questionPaper: file }))}
        />
        <FileDrop
          label="Mark scheme"
          hint="The official MS"
          file={form.markScheme}
          onFile={(file) => setForm((f) => ({ ...f, markScheme: file }))}
        />
      </div>

      <label>
        Title <span className="muted">(optional — read from the PDFs if blank)</span>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="IGCSE Chemistry Paper 2 June 2024"
        />
      </label>

      <div className="row-4">
        <label>
          Subject
          <input
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Chemistry"
          />
        </label>
        <label>
          Board
          <input
            value={form.board}
            onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}
            placeholder="Cambridge"
          />
        </label>
        <label>
          Session
          <input
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            placeholder="May/June 2024"
          />
        </label>
        <label>
          Paper code
          <input
            value={form.paperCode}
            onChange={(e) => setForm((f) => ({ ...f, paperCode: e.target.value }))}
            placeholder="0620/21"
          />
        </label>
      </div>

      <div className="expected-labels">
        <ExpectedQuestionsTable
          label="Expected QP questions"
          hint="Optional — used as the indexing target"
          rows={qpRows}
          disabled={disabled}
          onChange={(expectedQpRows) => setForm((f) => ({ ...f, expectedQpRows }))}
        />
        <ExpectedQuestionsTable
          label="Expected MS questions"
          hint="Optional — leave empty to reuse the QP list"
          rows={msRows}
          disabled={disabled}
          onChange={(expectedMsRows) => setForm((f) => ({ ...f, expectedMsRows }))}
        />
      </div>
      <p className="muted small" style={{ marginTop: -8 }}>
        Tip: enter the finest parts you want indexed (e.g. <code>1(a)</code> with marks{" "}
        <code>2</code>). Gemini uses this list instead of guessing the full set.
      </p>
    </fieldset>
  );
}
