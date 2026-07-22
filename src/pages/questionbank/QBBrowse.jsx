import { useEffect, useState, useCallback } from "react";
import { FiSearch, FiTrash2, FiEye, FiEdit2, FiX, FiCheck } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import QBLayout from "./QBLayout";
import "./QuestionBank.css";

const SESSIONS  = ["May/June", "Oct/Nov", "Feb/Mar"];
const VARIANTS  = ["1", "2", "3"];
const THIS_YEAR = new Date().getFullYear();
const YEARS     = Array.from({ length: THIS_YEAR - 1999 }, (_, i) => THIS_YEAR - i);
const BASE_URL  = import.meta.env.VITE_API_BASE_URL || "http://localhost:6001/api";

export default function QBBrowse() {
  const [boards,    setBoards]    = useState([]);
  const [subjects,  setSubjects]  = useState([]);
  const [units,     setUnits]     = useState([]);
  const [chapters,  setChapters]  = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const [filters, setFilters] = useState({
    boardId: "", subjectId: "", unitId: "", chapterId: "",
    year: "", examSession: "", variant: "", paperNumber: ""
  });

  // Preview modal
  const [previewQ,    setPreviewQ]    = useState(null);
  const [previewFile, setPreviewFile] = useState(0);

  // Edit modal
  const [editQ,    setEditQ]    = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => { api.get("/qb/boards").then(r => setBoards(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!filters.boardId) { setSubjects([]); return; }
    api.get(`/qb/subjects?boardId=${filters.boardId}`).then(r => setSubjects(r.data)).catch(() => {});
    setFilters(f => ({ ...f, subjectId: "", unitId: "", chapterId: "" }));
    setUnits([]); setChapters([]);
  }, [filters.boardId]);

  useEffect(() => {
    if (!filters.subjectId) { setUnits([]); return; }
    api.get(`/qb/units?subjectId=${filters.subjectId}`).then(r => setUnits(r.data)).catch(() => {});
    setFilters(f => ({ ...f, unitId: "", chapterId: "" }));
    setChapters([]);
  }, [filters.subjectId]);

  useEffect(() => {
    if (!filters.unitId) { setChapters([]); return; }
    api.get(`/qb/chapters?unitId=${filters.unitId}`).then(r => setChapters(r.data)).catch(() => {});
    setFilters(f => ({ ...f, chapterId: "" }));
  }, [filters.unitId]);

  const setF = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      const res = await api.get(`/qb/questions?${params.toString()}`);
      setQuestions(res.data);
    } catch {
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadQuestions(); }, []);

  const clearFilters = () => {
    setFilters({ boardId: "", subjectId: "", unitId: "", chapterId: "", year: "", examSession: "", variant: "", paperNumber: "" });
    setSubjects([]); setUnits([]); setChapters([]);
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await api.delete(`/qb/questions/${id}`);
      toast.success("Deleted");
      setQuestions(q => q.filter(x => x._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    }
  };

  const openEdit = (q) => {
    setEditQ(q);
    setEditForm({
      year:           q.year           || "",
      examSession:    q.examSession    || "",
      variant:        q.variant        || "",
      paperNumber:    q.paperNumber    || "",
      questionNumber: q.questionNumber || ""
    });
  };

  const saveEdit = async () => {
    try {
      const res = await api.put(`/qb/questions/${editQ._id}`, editForm);
      setQuestions(qs => qs.map(q => q._id === editQ._id ? res.data : q));
      setEditQ(null);
      toast.success("Updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update");
    }
  };

  const getFileUrl = (q, filename) =>
    `${BASE_URL}/qb/file/${q._id}/${filename}`;

  const selectedSubject = subjects.find(s => s._id === filters.subjectId);

  return (
    <QBLayout title="Browse Questions" subtitle="Search and filter your question bank">

      {/* FILTERS */}
      <div className="qb-panel">
        <div className="qb-panel-title">🔍 Filters</div>
        <div className="qb-filter-row">
          <div className="qb-filter-group">
            <label className="qb-label">Board</label>
            <select className="qb-select" value={filters.boardId} onChange={e => setF("boardId", e.target.value)}>
              <option value="">All boards</option>
              {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Subject</label>
            <select className="qb-select" value={filters.subjectId} onChange={e => setF("subjectId", e.target.value)} disabled={!filters.boardId}>
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Unit</label>
            <select className="qb-select" value={filters.unitId} onChange={e => setF("unitId", e.target.value)} disabled={!filters.subjectId}>
              <option value="">All units</option>
              {units.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Chapter</label>
            <select className="qb-select" value={filters.chapterId} onChange={e => setF("chapterId", e.target.value)} disabled={!filters.unitId}>
              <option value="">All chapters</option>
              {chapters.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Year</label>
            <select className="qb-select" value={filters.year} onChange={e => setF("year", e.target.value)}>
              <option value="">Any year</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Session</label>
            <select className="qb-select" value={filters.examSession} onChange={e => setF("examSession", e.target.value)}>
              <option value="">Any session</option>
              {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Variant</label>
            <select className="qb-select" value={filters.variant} onChange={e => setF("variant", e.target.value)}>
              <option value="">Any variant</option>
              {VARIANTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="qb-filter-group">
            <label className="qb-label">Paper</label>
            <select className="qb-select" value={filters.paperNumber} onChange={e => setF("paperNumber", e.target.value)} disabled={!selectedSubject?.paperNumbers?.length}>
              <option value="">Any paper</option>
              {(selectedSubject?.paperNumbers || []).map(p => <option key={p} value={p}>Paper {p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="qb-btn qb-btn--primary" onClick={loadQuestions}>
            <FiSearch size={13} /> Search
          </button>
          <button className="qb-btn qb-btn--ghost" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* RESULTS */}
      {loading && <p className="qb-loading">Loading questions…</p>}

      {!loading && (
        <>
          <p className="qb-results-count">{questions.length} question{questions.length !== 1 ? "s" : ""} found</p>

          {questions.length === 0 && (
            <div className="qb-empty" style={{ padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p>No questions found. Try adjusting your filters or upload some questions.</p>
            </div>
          )}

          <div className="qb-questions-grid">
            {questions.map(q => (
              <div key={q._id} className="qb-question-card">

                <div className="qb-question-card-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {q.boardId?.name} · {q.subjectId?.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                      {q.unitId?.name} → {q.chapterId?.name}
                    </div>
                  </div>
                  <span className="qb-badge">{q.files?.length} file{q.files?.length !== 1 ? "s" : ""}</span>
                </div>

                <div className="qb-question-card-meta">
                  {q.year        && <span className="qb-paper-tag" style={{ cursor: "default" }}>{q.year}</span>}
                  {q.examSession && <span className="qb-paper-tag" style={{ cursor: "default" }}>{q.examSession}</span>}
                  {q.variant     && <span className="qb-paper-tag" style={{ cursor: "default" }}>V{q.variant}</span>}
                  {q.paperNumber && <span className="qb-paper-tag" style={{ cursor: "default" }}>Paper {q.paperNumber}</span>}
                  {q.questionNumber && <span className="qb-paper-tag" style={{ cursor: "default" }}>Q{q.questionNumber}</span>}
                </div>

                <div className="qb-question-card-actions">
                  <button className="qb-btn qb-btn--primary" onClick={() => { setPreviewQ(q); setPreviewFile(0); }}>
                    <FiEye size={13} /> Preview
                  </button>
                  <button className="qb-btn qb-btn--ghost" onClick={() => openEdit(q)}>
                    <FiEdit2 size={13} /> Edit
                  </button>
                  <button className="qb-btn qb-btn--danger" onClick={() => deleteQuestion(q._id)}>
                    <FiTrash2 size={13} />
                  </button>
                </div>

              </div>
            ))}
          </div>
        </>
      )}

      {/* PREVIEW MODAL */}
      {previewQ && (
        <div className="qb-modal-overlay" onClick={() => setPreviewQ(null)}>
          <div className="qb-modal" onClick={e => e.stopPropagation()}>
            <div className="qb-modal-header">
              <span className="qb-modal-title">
                {previewQ.boardId?.name} · {previewQ.subjectId?.name}
                {previewQ.questionNumber && ` · Q${previewQ.questionNumber}`}
              </span>
              <button className="qb-modal-close" onClick={() => setPreviewQ(null)}>✕ Close</button>
            </div>
            <div className="qb-modal-body">
              {previewQ.files?.length > 1 && (
                <div className="qb-preview-tabs">
                  {previewQ.files.map((f, i) => (
                    <button
                      key={i}
                      className={`qb-preview-tab ${previewFile === i ? "qb-preview-tab--active" : ""}`}
                      onClick={() => setPreviewFile(i)}
                      style={f.type === "markscheme" ? {
                        borderColor: previewFile === i ? "var(--success)" : "color-mix(in srgb, var(--success) 40%, transparent)",
                        background:  previewFile === i ? "var(--success)" : "transparent",
                        color:       previewFile === i ? "var(--primary-contrast)" : "var(--success)"
                      } : {}}
                    >
                      {f.type === "markscheme" ? "📋 " : "📄 "}
                      {f.originalName}
                    </button>
                  ))}
                </div>
              )}

              {previewQ.files?.[previewFile] && (() => {
                const file = previewQ.files[previewFile];

                // Drive file — use embed URL
                if (file.driveFileId) {
                  return (
                    <iframe
                      src={`https://drive.google.com/file/d/${file.driveFileId}/preview`}
                      className="qb-preview-frame"
                      title={file.originalName}
                      allow="autoplay"
                    />
                  );
                }

                // Image from Drive web link
                if (file.driveWebLink && file.mimetype?.startsWith("image/")) {
                  return (
                    <img
                      src={`https://drive.google.com/uc?export=view&id=${file.driveFileId}`}
                      className="qb-preview-img"
                      alt={file.originalName}
                    />
                  );
                }

                // Local fallback
                const url = `${BASE_URL}/qb/file/${previewQ._id}/${file.filename}`;
                if (file.mimetype === "application/pdf") {
                  return <iframe src={url} className="qb-preview-frame" title={file.originalName} />;
                }
                return <img src={url} className="qb-preview-img" alt={file.originalName} />;
              })()}
            </div>
          </div>
        </div>
      )}
      {/* EDIT MODAL */}
      {editQ && (
        <div className="qb-modal-overlay" onClick={() => setEditQ(null)}>
          <div className="qb-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="qb-modal-header">
              <span className="qb-modal-title">Edit Question Metadata</span>
              <button className="qb-modal-close" onClick={() => setEditQ(null)}>✕ Close</button>
            </div>
            <div className="qb-modal-body">
              <div className="qb-form-row">
                <div className="qb-form-group">
                  <label className="qb-label">Year</label>
                  <select className="qb-select" value={editForm.year} onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))}>
                    <option value="">None</option>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="qb-form-group">
                  <label className="qb-label">Session</label>
                  <select className="qb-select" value={editForm.examSession} onChange={e => setEditForm(f => ({ ...f, examSession: e.target.value }))}>
                    <option value="">None</option>
                    {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="qb-form-group">
                  <label className="qb-label">Variant</label>
                  <select className="qb-select" value={editForm.variant} onChange={e => setEditForm(f => ({ ...f, variant: e.target.value }))}>
                    <option value="">None</option>
                    {VARIANTS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="qb-form-group">
                  <label className="qb-label">Paper Number</label>
                  <select className="qb-select" value={editForm.paperNumber} onChange={e => setEditForm(f => ({ ...f, paperNumber: e.target.value }))}>
                    <option value="">None</option>
                    {(editQ.subjectId?.paperNumbers || []).map(p => <option key={p} value={p}>Paper {p}</option>)}
                  </select>
                </div>
                <div className="qb-form-group">
                  <label className="qb-label">Question Number</label>
                  <input className="qb-input" value={editForm.questionNumber} onChange={e => setEditForm(f => ({ ...f, questionNumber: e.target.value }))} placeholder="e.g. 3b" />
                </div>
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button className="qb-btn qb-btn--primary" onClick={saveEdit}><FiCheck size={13} /> Save Changes</button>
                <button className="qb-btn qb-btn--ghost"   onClick={() => setEditQ(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </QBLayout>
  );
}