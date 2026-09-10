import { FileDrop } from "../ui.jsx";

// One complete setup form shared by the library and the connected assignment dialog.
export default function ExamSetupFields({ form, setForm: onChange, disabled = false }) {
  const setForm = update => { if (!disabled) onChange(update); };
  return <fieldset className="exam-setup-fields" disabled={disabled}>
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
              <label>
                Expected QP questions{" "}
                <span className="muted">(optional — one label per line)</span>
                <textarea
                  rows={6}
                  value={form.expectedQpLabels}
                  onChange={(e) => setForm((f) => ({ ...f, expectedQpLabels: e.target.value }))}
                  placeholder={"1\n1(a)\n1(b)\n2\n2(a)\n…"}
                />
              </label>
              <label>
                Expected MS questions{" "}
                <span className="muted">(optional — leave blank to reuse QP list)</span>
                <textarea
                  rows={6}
                  value={form.expectedMsLabels}
                  onChange={(e) => setForm((f) => ({ ...f, expectedMsLabels: e.target.value }))}
                  placeholder={"Same as QP, or MS-only headings if they differ"}
                />
              </label>
            </div>
            <p className="muted small" style={{ marginTop: -8 }}>
              Tip: list the finest parts you want indexed (e.g. <code>19</code>, <code>12(b)</code>).
              Gemini uses this as the target scope instead of guessing the full set.
            </p>

  </fieldset>;
}
