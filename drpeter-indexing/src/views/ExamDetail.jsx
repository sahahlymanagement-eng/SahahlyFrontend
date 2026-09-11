import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  AnimatedNumber,
  Bar,
  Empty,
  Icon,
  Loading,
  Stat,
  StatusChip,
  formatEgp,
  formatTokens,
  useToast,
} from "../ui.jsx";
import IndexChat from "./IndexChat.jsx";
import MarkingGuidance from './MarkingGuidance.jsx';
import { apiRoot } from '../workspace.js';
import ExpectedQuestionsTable, {
  emptyExpectedRow,
  rowsFromExamLists,
  textFromExpectedRows,
} from "../components/ExpectedQuestionsTable.jsx";

function cloneQuestions(rows) {
  return (rows || []).map((q, i) => ({
    ...q,
    id: q.id || `tmp_${i}`,
    qpPages: [...(q.qpPages || [])],
    msPages: [...(q.msPages || [])],
    markPoints: (q.markPoints || []).map((p) => ({ ...p, alternatives: [...(p.alternatives || [])] })),
    acceptableAnswers: [...(q.acceptableAnswers || [])],
  }));
}

function pagesToText(pages) {
  if (typeof pages === "string") return pages;
  return (pages || []).join(", ");
}

function blankQuestion(index) {
  return {
    id: `new_${Date.now()}_${index}`,
    label: "",
    stem: "",
    qpPages: [],
    msPages: [],
    msLabel: "",
    maxMarks: null,
    questionType: "calculation",
    isMcq: false,
    correctMcqLetter: null,
    hasDiagram: false,
    markPoints: [],
    acceptableAnswers: [],
    markingNotes: "",
    matchedBy: null,
  };
}

function blankPoint() {
  return { code: "M1", text: "", marks: 1, alternatives: [], notes: "" };
}

export default function ExamDetail({ examId, embedded = false }) {
  const toast = useToast();
  const [exam, setExam] = useState(null);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qpTotal, setQpTotal] = useState('');
  const [msTotal, setMsTotal] = useState('');
  const [extrasResolved, setExtrasResolved] = useState(false);
  const [expectedQpRows, setExpectedQpRows] = useState([emptyExpectedRow()]);
  const [expectedMsRows, setExpectedMsRows] = useState([emptyExpectedRow()]);
  const [expectedDirty, setExpectedDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      Promise.all([api.exam(examId), api.runs(examId)]).then(([next, rows]) => {
        if (cancelled) return;
        setExam(next);
        setRuns(rows);
        setDraft((prev) => {
          // Don't clobber an in-progress edit when the poll lands.
          if (editing && dirty) return prev;
          return cloneQuestions(next.markingPack?.questions);
        });
        setExpectedQpRows((prev) => {
          if (expectedDirty) return prev;
          return rowsFromExamLists(next.expectedQpLabels, next.expectedQpMaxMarks);
        });
        setExpectedMsRows((prev) => {
          if (expectedDirty) return prev;
          return rowsFromExamLists(next.expectedMsLabels, next.expectedMsMaxMarks);
        });
      });
    refresh().catch((err) => {
      if (!cancelled) setError(err.message);
    });
    const timer = setInterval(() => refresh().catch(() => {}), 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [examId, editing, dirty, expectedDirty]);

  const pack = exam?.markingPack;
  const source = useMemo(() => editing ? draft : pack?.questions || [], [editing, draft, pack?.questions]);

  const questions = useMemo(() => {
    const withIndex = source.map((q, idx) => ({ q, idx }));
    const needle = query.trim().toLowerCase();
    const filtered = !needle
      ? withIndex
      : withIndex.filter(({ q }) =>
          `${q.label} ${q.stem || ""} ${q.msLabel || ""}`.toLowerCase().includes(needle)
        );

    if (editing) return filtered.map(({ q, idx }) => ({ ...q, _idx: idx }));

    const pageOf = (q) => {
      const qpPage = Array.isArray(q?.qpPages) ? q.qpPages[0] : null;
      if (Number.isInteger(qpPage) && qpPage >= 1) return qpPage;
      const msPage = Array.isArray(q?.msPages) ? q.msPages[0] : null;
      if (Number.isInteger(msPage) && msPage >= 1) return msPage;
      return Number.POSITIVE_INFINITY;
    };

    filtered.sort((a, b) => {
      const pa = pageOf(a.q);
      const pb = pageOf(b.q);
      return pa - pb || a.idx - b.idx;
    });
    return filtered.map(({ q, idx }) => ({ ...q, _idx: idx }));
  }, [source, query, editing]);

  if (!exam) {
    return error ? <p className="error">{error}</p> : <Loading text="Loading exam…" />;
  }

  const working = exam.status === "queued" || exam.status === "processing";
  const matched = source.filter((q) => q.msLabel).length;
  const totalQ = source.length;
  const draftMarks = source.reduce((sum, q) => sum + (Number(q.maxMarks) || 0), 0);

  function startEdit() {
    setQpTotal(pack?.questionPaperTotalMarks == null ? '' : String(pack.questionPaperTotalMarks));
    setMsTotal(pack?.markSchemeTotalMarks == null ? '' : String(pack.markSchemeTotalMarks));
    setExtrasResolved(false);
    setDraft(cloneQuestions(pack?.questions));
    setDirty(false);
    setEditing(true);
    setQuery("");
  }

  function cancelEdit() {
    if (dirty && !window.confirm("Discard unsaved index edits?")) return;
    setDraft(cloneQuestions(pack?.questions));
    setDirty(false);
    setEditing(false);
  }

  function updateAt(index, patch) {
    setDraft((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
    setDirty(true);
  }

  function moveAt(index, dir) {
    const next = index + dir;
    if (next < 0 || next >= draft.length) return;
    setDraft((prev) => {
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row);
      return copy;
    });
    setDirty(true);
  }

  function removeAt(index) {
    if (!window.confirm("Remove this question from the pack?")) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setOpenId(null);
  }

  function addQuestion() {
    const row = blankQuestion(draft.length);
    setDraft((prev) => [...prev, row]);
    setOpenId(row.id);
    setDirty(true);
  }

  function updatePoint(qIndex, pIndex, patch) {
    setDraft((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const markPoints = (q.markPoints || []).map((p, j) => (j === pIndex ? { ...p, ...patch } : p));
        return { ...q, markPoints };
      })
    );
    setDirty(true);
  }

  function addPoint(qIndex) {
    setDraft((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, markPoints: [...(q.markPoints || []), blankPoint()] } : q
      )
    );
    setDirty(true);
  }

  function removePoint(qIndex, pIndex) {
    setDraft((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, markPoints: (q.markPoints || []).filter((_, j) => j !== pIndex) }
          : q
      )
    );
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const next = await api.savePack(exam.id, { questions: draft, questionPaperTotalMarks: qpTotal === "" ? exam.markingPack.questionPaperTotalMarks : Number(qpTotal), markSchemeTotalMarks: msTotal === "" ? exam.markingPack.markSchemeTotalMarks : Number(msTotal), ...(extrasResolved ? { outOfScope: [] } : {}) });
      setExam(next);
      setDraft(cloneQuestions(next.markingPack?.questions));
      setDirty(false);
      setEditing(false);
      toast({ kind: "ok", title: "Index saved", body: `${next.questionCount} questions · ${next.totalMarks} marks` });
    } catch (err) {
      toast({ kind: "bad", title: "Could not save index", body: err.message });
    } finally {
      setSaving(false);
    }
  }

  function applyChatPatches(nextQuestions, patchCount) {
    if (!editing) {
      setQpTotal(pack?.questionPaperTotalMarks == null ? '' : String(pack.questionPaperTotalMarks));
      setMsTotal(pack?.markSchemeTotalMarks == null ? '' : String(pack.markSchemeTotalMarks));
      setExtrasResolved(false);
    }
    setDraft(cloneQuestions(nextQuestions));
    setEditing(true);
    setDirty(true);
    setQuery("");
    toast({
      kind: "ok",
      title: "Chat changes applied",
      body: `${patchCount} change${patchCount === 1 ? "" : "s"} in the draft — review and Save index.`,
    });
  }

  async function reindex() {
    if (editing && dirty && !window.confirm("Re-index will overwrite unsaved edits. Continue?")) return;
    try {
      setEditing(false);
      setDirty(false);
      setExam(
        await api.reprocess(exam.id, {
          expectedQpLabels: textFromExpectedRows(expectedQpRows),
          expectedMsLabels: textFromExpectedRows(expectedMsRows),
        })
      );
      setExpectedDirty(false);
      toast({ kind: "ok", title: "Re-indexing started" });
    } catch (err) {
      toast({ kind: "bad", title: "Could not re-index", body: err.message });
    }
  }

  async function remove() {
    if (!window.confirm("Delete this exam pack and every grading made against it?")) return;
    try {
      await api.deleteExam(exam.id);
      toast({ kind: "ok", title: "Exam pack deleted" });
      window.location.hash = "#/";
    } catch (err) {
      toast({ kind: "bad", title: "Could not delete", body: err.message });
    }
  }

  return (
    <div className="stack exam-detail" style={{ gap: 20 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <a className="back" href="#/">
          <Icon name="chevronLeft" size={14} /> Exam library
        </a>
        <div className="card-head">
          <div>
            <h1>{exam.title}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {[exam.board, exam.subject, exam.paperCode, exam.year].filter(Boolean).join(" · ") ||
                "No metadata yet"}
            </p>
          </div>
          <StatusChip item={exam} />
        </div>
      </div>

      {working && (
        <p className="pulse" style={{ marginBottom: 0 }}>
          Indexing now — usually under a minute for a typical paper.
        </p>
      )}
      {exam.error && <p className="error">{exam.error}</p>}
      <div className="card" style={{ padding: 16 }}>
        <h2>Source verification</h2>
        {exam.generatedPack && <details><summary>Compare regenerated evidence (saved corrections remain active)</summary><pre style={{ whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>{JSON.stringify(exam.generatedPack, null, 2)}</pre></details>}
        <p><a href={`${apiRoot}/api/exams/${exam.id}/qp.pdf`} target="_blank" rel="noreferrer">Open original question paper</a> · <a href={`${apiRoot}/api/exams/${exam.id}/ms.pdf`} target="_blank" rel="noreferrer">Open original mark scheme</a></p>
        <p>Compare each row with its physical source pages. Correct discrepancies, verify totals, then save and approve. Saved corrections survive repair and re-indexing.</p>
        <label>Question-paper total <input type="number" min="1" disabled={!editing} value={editing ? qpTotal : (pack?.questionPaperTotalMarks ?? '')} onChange={e => { setQpTotal(e.target.value); setDirty(true); }} /></label>
        <label>Mark-scheme total <input type="number" min="1" disabled={!editing} value={editing ? msTotal : (pack?.markSchemeTotalMarks ?? '')} onChange={e => { setMsTotal(e.target.value); setDirty(true); }} /></label>
        {pack?.outOfScope?.length > 0 && <><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(pack.outOfScope, null, 2)}</pre><label><input type="checkbox" disabled={!editing} checked={extrasResolved} onChange={e => { setExtrasResolved(e.target.checked); setDirty(true); }} /> I reviewed every extra/conflicting MS entry and incorporated relevant criteria into the correct rows.</label></>}
      </div>
      {pack?.reviewIssues?.length > 0 && (
        <section className="panel">
          <h2>Index needs review</h2>
          <p>Resolve these matches before marking scripts.</p>
          <ul>{pack.reviewIssues.map((issue, i) => <li key={i}>{issue.label ? `${issue.label}: ` : ""}{issue.reason}</li>)}</ul>
        </section>
      )}
      {editing && dirty && (
        <p className="pulse" style={{ marginBottom: 0 }}>
          Unsaved index edits — Save to use them when marking.
        </p>
      )}

      <div className="stat-grid" style={{ marginBottom: 0 }}>
        <Stat
          icon="stack"
          label="Questions"
          value={<AnimatedNumber value={editing ? totalQ : exam.questionCount || 0} />}
        />
        <Stat
          icon="target"
          tone="good"
          label="Total marks"
          value={<AnimatedNumber value={editing ? draftMarks : exam.totalMarks || 0} />}
        />
        <Stat
          icon="alert"
          tone={(editing ? totalQ - matched : exam.unmatchedCount) ? "warn" : "good"}
          label="Unmatched"
          value={
            <AnimatedNumber value={editing ? totalQ - matched : exam.unmatchedCount || 0} />
          }
          foot={totalQ ? `${matched}/${totalQ} paired with the MS` : null}
        />
        <Stat
          icon="bolt"
          tone="accent"
          label="Indexing tokens"
          value={formatTokens(exam.tokenUsage?.totalTokens)}
        />
        <Stat
          icon="coins"
          tone="warn"
          label="Indexing cost"
          value={formatEgp(exam.cost?.egp)}
        />
      </div>

      <section className="panel expected-panel">
        <div className="panel-head">
          <div>
            <h2>Expected questions</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Optional target list for indexing. Add each question and its marks, then Re-index.
            </p>
          </div>
          {expectedDirty && <span className="chip warn">unsaved for next re-index</span>}
        </div>
        <div className="expected-labels">
          <ExpectedQuestionsTable
            label="From question paper"
            hint="Used as the indexing target"
            rows={expectedQpRows}
            disabled={working}
            onChange={(rows) => {
              setExpectedQpRows(rows);
              setExpectedDirty(true);
            }}
          />
          <ExpectedQuestionsTable
            label="From mark scheme"
            hint="Leave empty to reuse the QP list"
            rows={expectedMsRows}
            disabled={working}
            onChange={(rows) => {
              setExpectedMsRows(rows);
              setExpectedDirty(true);
            }}
          />
        </div>
      </section>

      <div className="actions">
        {!embedded && <a className="button" href={`#/grade/${exam.id}`}>
          <Icon name="mark" size={15} />
          Mark scripts against this pack
        </a>}
        {!editing ? (
          <button type="button" className="ghost" onClick={startEdit} disabled={!pack}>
            <Icon name="pencil" size={15} />
            Edit index
          </button>
        ) : (
          <>
            <button type="button" onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner tiny" /> Saving…
                </>
              ) : (
                <>
                  <Icon name="save" size={15} />
                  Save and approve index
                </>
              )}
            </button>
            <button type="button" className="ghost" onClick={cancelEdit} disabled={saving}>
              <Icon name="x" size={15} />
              Cancel
            </button>
          </>
        )}
        <button type="button" className="ghost" onClick={reindex} disabled={working}>
          <Icon name="refresh" size={15} />
          Re-index{expectedDirty ? " with list" : ""}
        </button>
        <button type="button" className="danger" onClick={remove}>
          <Icon name="trash" size={15} />
          Delete
        </button>
      </div>

      {totalQ > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Indexed questions</h2>
              <p className="muted small" style={{ marginTop: 4 }}>
                {editing
                  ? "Edit labels, pages, marks and mark points. Order here is the marking order."
                  : "Click a row to see the stored mark points."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 200 }}>
              {!editing && (
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by label or stem…"
                />
              )}
              {editing && (
                <button type="button" className="ghost" onClick={addQuestion}>
                  <Icon name="plus" size={14} />
                  Add question
                </button>
              )}
            </div>
          </div>

          {questions.length === 0 ? (
            <Empty title="No matches">Nothing in this pack matches “{query}”.</Empty>
          ) : (
            <ul className="q-list">
              {questions.map((q) => {
                const idx = q._idx;
                const open = openId === q.id;
                return (
                  <li key={q.id} className={editing && dirty ? undefined : undefined}>
                    <button
                      type="button"
                      className="q-toggle"
                      onClick={() => setOpenId(open ? null : q.id)}
                    >
                      <span className="q-id">{q.label || "—"}</span>
                      <span className="grow">{q.stem || "No stem extracted"}</span>
                      <span className="marks">{q.maxMarks ?? "?"}m</span>
                      {!q.msLabel && <span className="chip bad">no MS</span>}
                      <Icon name="chevronDown" size={14} />
                    </button>

                    {open && !editing && (
                      <div className="q-body">
                        <p className="muted">
                          <a target="_blank" rel="noreferrer" href={`${apiRoot}/api/exams/${exam.id}/qp.pdf#page=${q.qpPages?.[0] || 1}`}>QP p{(q.qpPages || []).join(", ") || "?"}</a> · MS {q.msLabel || "unmatched"} p
                          {(q.msPages || []).join(", ") || "?"} · {q.questionType}
                          {q.isMcq ? ` · correct ${q.correctMcqLetter || "?"}` : ""}
                        </p>
                        {q.markPoints?.length > 0 ? (
                          <ul>
                            {q.markPoints.map((point, i) => (
                              <li key={i}>
                                <strong>{point.code}</strong> {point.text}
                                {point.alternatives?.length
                                  ? ` (also: ${point.alternatives.join("; ")})`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">No mark points stored for this row.</p>
                        )}
                        {q.markingNotes && <p style={{ marginTop: 8 }}>{q.markingNotes}</p>}
                        <p><strong>Study topic:</strong> {q.studyTopic || 'Not identified — add in Edit index'}</p>
                      </div>
                    )}

                    {open && editing && (
                      <div className="q-body q-edit">
                        <div className="q-edit-actions">
                          <button type="button" className="ghost" onClick={() => moveAt(idx, -1)} disabled={idx === 0}>
                            <Icon name="chevronUp" size={14} /> Up
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => moveAt(idx, 1)}
                            disabled={idx === draft.length - 1}
                          >
                            <Icon name="chevronDown" size={14} /> Down
                          </button>
                          <button type="button" className="danger" onClick={() => removeAt(idx)}>
                            <Icon name="trash" size={14} /> Remove
                          </button>
                        </div>

                        <div className="q-edit-grid">
                          <label>
                            Label
                            <input
                              value={q.label || ""}
                              onChange={(e) => updateAt(idx, { label: e.target.value })}
                              placeholder="e.g. 5(b)"
                            />
                          </label>
                          <label>
                            Max marks
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={q.maxMarks ?? ""}
                              onChange={(e) =>
                                updateAt(idx, {
                                  maxMarks: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            QP maximum marks
                            <input type="number" value={q.qpMaxMarks ?? ''} onChange={e => updateAt(idx, { qpMaxMarks: e.target.value === '' ? null : Number(e.target.value) })} />
                          </label>
                          <label>
                            QP pages
                            <input
                              value={pagesToText(q.qpPages)}
                              onChange={(e) => updateAt(idx, { qpPages: e.target.value })}
                              placeholder="e.g. 1 or 3, 4"
                            />
                          </label>
                          <label>
                            MS pages
                            <input
                              value={pagesToText(q.msPages)}
                              onChange={(e) => updateAt(idx, { msPages: e.target.value })}
                              placeholder="e.g. 1"
                            />
                          </label>
                          <label className="span-2">
                            MS label
                            <input
                              value={q.msLabel || ""}
                              onChange={(e) => updateAt(idx, { msLabel: e.target.value })}
                              placeholder="Leave blank if unmatched"
                            />
                          </label>
                          <label className="span-2">
                            Stem
                            <textarea
                              rows={2}
                              value={q.stem || ""}
                              onChange={(e) => updateAt(idx, { stem: e.target.value })}
                              placeholder="Short question instruction"
                            />
                          </label>
                          <label className="span-2">
                            Examiner notes
                            <textarea
                              rows={2}
                              value={q.markingNotes || ""}
                              onChange={(e) => updateAt(idx, { markingNotes: e.target.value })}
                            />
                          </label>
                          <label className="span-2">
                            Study topic (shown on marked papers)
                            <input value={q.studyTopic || ''} onChange={(e) => updateAt(idx, { studyTopic: e.target.value })} placeholder="e.g. Atomic structure" />
                          </label>
                        </div>

                        <div className="q-points-head">
                          <strong>Mark points</strong>
                          <button type="button" className="ghost" onClick={() => addPoint(idx)}>
                            <Icon name="plus" size={13} /> Add point
                          </button>
                        </div>
                        {(q.markPoints || []).length === 0 ? (
                          <p className="muted">No mark points yet.</p>
                        ) : (
                          <div className="q-points">
                            {(q.markPoints || []).map((point, pIndex) => (
                              <div key={pIndex} className="q-point-row">
                                <input
                                  className="code"
                                  value={point.code || ""}
                                  onChange={(e) => updatePoint(idx, pIndex, { code: e.target.value })}
                                  placeholder="M1"
                                />
                                <input
                                  className="marks-sm"
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={point.marks ?? 1}
                                  onChange={(e) =>
                                    updatePoint(idx, pIndex, { marks: Number(e.target.value) || 0 })
                                  }
                                />
                                <input
                                  className="grow"
                                  value={point.text || ""}
                                  onChange={(e) => updatePoint(idx, pIndex, { text: e.target.value })}
                                  placeholder="What this point awards"
                                />
                                <button
                                  type="button"
                                  className="ghost icon-only"
                                  onClick={() => removePoint(idx, pIndex)}
                                  aria-label="Remove mark point"
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {pack?.outOfScope?.length > 0 && !editing && (
        <section className="panel">
          <h2>Mark-scheme items not on this paper</h2>
          <p className="muted small" style={{ marginBottom: 14 }}>
            Present in the mark scheme but with no matching question in the QP.
          </p>
          <ul className="plain">
            {pack.outOfScope.map((row, i) => (
              <li key={i}>
                <strong>{row.msLabel}</strong> — {row.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <MarkingGuidance key={exam.id} exam={exam} onSaved={setExam} />

      <section className="panel">
        <h2>Marking runs against this pack</h2>
        <p className="muted small" style={{ marginBottom: 14 }}>
          Every pile of scripts marked from this index.
        </p>
        {runs.length === 0 ? (
          <Empty title="No runs yet">
            {embedded ? "Close this window and select students in the assignment viewer to start marking." : <a href={`#/grade/${exam.id}`}>Mark your first pile of scripts</a>}
          </Empty>
        ) : (
          <ul className="cards">
            {runs.map((run) => (
              <li key={run.id}>
                <a href={`#/runs/${run.id}`}>
                  <div className="card-head">
                    <strong>
                      {run.paperCount} paper{run.paperCount === 1 ? "" : "s"} · {run.mode}
                    </strong>
                    <StatusChip item={run} />
                  </div>
                  <div style={{ margin: "9px 0 7px" }}>
                    <Bar
                      value={run.readyCount + run.failedCount}
                      max={run.paperCount}
                      tone={run.failedCount ? "warn" : "good"}
                    />
                  </div>
                  <p className="muted">
                    {run.readyCount}/{run.paperCount} marked
                    {run.tokenUsage?.totalTokens
                      ? ` · ${formatTokens(run.tokenUsage.totalTokens)} tokens`
                      : ""}
                    {run.cost?.egp != null ? ` · ${formatEgp(run.cost.egp)}` : ""}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pack && (
        <IndexChat
          examId={exam.id}
          questions={source}
          unmatchedCount={totalQ - matched}
          onApplyPatches={applyChatPatches}
          disabled={working || saving}
        />
      )}
    </div>
  );
}
