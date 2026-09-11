import ExamSetupFields from "../components/ExamSetupFields.jsx";
import { emptyExpectedRow, textFromExpectedRows } from "../components/ExpectedQuestionsTable.jsx";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  AnimatedNumber,
  Empty,
  Icon,
  Skeleton,
  Stat,
  StatusChip,
  formatEgp,
  useToast,
} from "../ui.jsx";

const BLANK = {
  title: "",
  subject: "",
  board: "",
  year: "",
  paperCode: "",
  expectedQpRows: [emptyExpectedRow()],
  expectedMsRows: [emptyExpectedRow()],
  questionPaper: null,
  markScheme: null,
};

export default function Library() {
  const toast = useToast();
  const [exams, setExams] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    const load = () => api.exams().then(setExams).catch((err) => setError(err.message));
    load();
    const timer = setInterval(() => api.exams().then(setExams).catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    const rows = exams || [];
    return {
      packs: rows.length,
      ready: rows.filter((exam) => exam.status === "ready").length,
      questions: rows.reduce((sum, exam) => sum + (exam.questionCount || 0), 0),
      marks: rows.reduce((sum, exam) => sum + (exam.totalMarks || 0), 0),
      spend: rows.reduce((sum, exam) => sum + (exam.cost?.egp || 0), 0),
    };
  }, [exams]);

  const ready = Boolean(form.questionPaper && form.markScheme);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    if (!ready) {
      setError("Attach both the question paper and the mark scheme.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      for (const key of ["title", "subject", "board", "year", "paperCode"]) {
        data.set(key, form[key]);
      }
      data.set("expectedQpLabels", textFromExpectedRows(form.expectedQpRows));
      data.set("expectedMsLabels", textFromExpectedRows(form.expectedMsRows));
      data.set("questionPaper", form.questionPaper);
      data.set("markScheme", form.markScheme);
      const created = await api.createExam(data);
      setForm(BLANK);
      toast({ kind: "ok", title: "Indexing started", body: "Pairing the paper with its mark scheme." });
      window.location.hash = `#/exams/${created.id}`;
    } catch (err) {
      setError(err.message);
      toast({ kind: "bad", title: "Could not start indexing", body: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hero">
        <div className="hero-inner">
          <div>
            <p className="eyebrow">Sahahly · Exam Indexer</p>
            <h1>
              Pre-process once, then <em>mark from the index</em>
            </h1>
            <p className="subtitle">
              Pair a blank question paper with its official mark scheme. The packed exam is stored
              locally, so every later script is marked against that index instead of re-reading both
              PDFs.
            </p>
          </div>
          <a className="button" href="#/grade">
            <Icon name="mark" size={15} />
            Mark scripts
          </a>
        </div>
      </div>

      {totals.packs > 0 && (
        <div className="stat-grid">
          <Stat
            icon="library"
            label="Stored packs"
            value={<AnimatedNumber value={totals.packs} />}
            foot={`${totals.ready} ready to mark`}
          />
          <Stat
            icon="stack"
            tone="accent"
            label="Questions"
            value={<AnimatedNumber value={totals.questions} />}
            foot="Indexed across all packs"
          />
          <Stat
            icon="target"
            tone="good"
            label="Marks covered"
            value={<AnimatedNumber value={totals.marks} />}
          />
          <Stat
            icon="coins"
            tone="warn"
            label="Spend"
            value={formatEgp(totals.spend)}
            foot="Indexing, lifetime"
          />
        </div>
      )}

      <div className="grid-two">
        <section className="panel">
          <h2>New exam pack</h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            Index the original PDFs once. Review and approve the pack before marking.
          </p>

          <form onSubmit={onSubmit} className="stack">
            <ExamSetupFields form={form} setForm={setForm} disabled={busy} />

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={busy || !ready}>
              {busy ? (
                <>
                  <span className="spinner tiny" /> Starting…
                </>
              ) : (
                <>
                  <Icon name="bolt" size={15} />
                  Index and save to library
                </>
              )}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head" style={{ marginBottom: 14 }}>
            <h2>Library</h2>
            {exams?.length > 0 && (
              <span className="chip neutral">
                {exams.length} pack{exams.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {exams === null ? (
            <div className="skeleton-stack">
              <Skeleton height={72} radius={14} />
              <Skeleton height={72} radius={14} />
              <Skeleton height={72} radius={14} />
            </div>
          ) : exams.length === 0 ? (
            <Empty title="Nothing indexed yet">
              Drop a question paper and its mark scheme on the left to build your first pack.
            </Empty>
          ) : (
            <ul className="cards">
              {exams.map((exam, i) => (
                <li key={exam.id} style={{ animationDelay: `${i * 0.04}s` }}>
                  <a href={`#/exams/${exam.id}`}>
                    <div className="card-head">
                      <strong>{exam.title}</strong>
                      <StatusChip item={exam} />
                    </div>
                    <p>
                      {[exam.board, exam.subject, exam.paperCode, exam.year]
                        .filter(Boolean)
                        .join(" · ") || "Metadata fills in after indexing"}
                    </p>
                    <p className="muted">
                      {exam.questionCount || 0} questions
                      {exam.totalMarks != null ? ` · ${exam.totalMarks} marks` : ""}
                      {exam.qpPageCount ? ` · QP ${exam.qpPageCount}p` : ""}
                      {exam.cost?.egp != null ? ` · ${formatEgp(exam.cost.egp)}` : ""}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
