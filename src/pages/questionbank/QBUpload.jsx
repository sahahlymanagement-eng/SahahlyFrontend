import { useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import QBLayout from "./QBLayout";
import "./QuestionBank.css";

const SESSIONS  = ["May/June", "Oct/Nov", "Feb/Mar"];
const VARIANTS  = ["1", "2", "3"];
const THIS_YEAR = new Date().getFullYear();
const YEARS     = Array.from({ length: THIS_YEAR - 1999 }, (_, i) => THIS_YEAR - i);

export default function QBUpload() {
  const fileInputRef = useRef();
  const msInputRef   = useRef();

  const [boards,   setBoards]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [units,    setUnits]    = useState([]);
  const [chapters, setChapters] = useState([]);

  const [form, setForm] = useState({
    boardId: "", subjectId: "", unitId: "", chapterId: "",
    year: "", examSession: "", variant: "", paperNumber: "", questionNumber: ""
  });

  const [files,     setFiles]     = useState([]);
  const [msFiles,   setMsFiles]   = useState([]);
  const [dragging,  setDragging]  = useState(false);
  const [msDragging,setMsDragging]= useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/qb/boards").then(r => setBoards(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.boardId) { setSubjects([]); return; }
    api.get(`/qb/subjects?boardId=${form.boardId}`).then(r => setSubjects(r.data)).catch(() => {});
    setForm(f => ({ ...f, subjectId: "", unitId: "", chapterId: "", paperNumber: "" }));
    setUnits([]); setChapters([]);
  }, [form.boardId]);

  useEffect(() => {
    if (!form.subjectId) { setUnits([]); return; }
    api.get(`/qb/units?subjectId=${form.subjectId}`).then(r => setUnits(r.data)).catch(() => {});
    setForm(f => ({ ...f, unitId: "", chapterId: "" }));
    setChapters([]);
  }, [form.subjectId]);

  useEffect(() => {
    if (!form.unitId) { setChapters([]); return; }
    api.get(`/qb/chapters?unitId=${form.unitId}`).then(r => setChapters(r.data)).catch(() => {});
    setForm(f => ({ ...f, chapterId: "" }));
  }, [form.unitId]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const selectedSubject = subjects.find(s => s._id === form.subjectId);

  const validateFiles = (incoming) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp"];
    return Array.from(incoming).filter(f => {
      if (!allowed.includes(f.type)) { toast.warn(`${f.name} is not a supported format`); return false; }
      if (f.size > 20 * 1024 * 1024) { toast.warn(`${f.name} exceeds 20MB`);              return false; }
      return true;
    });
  };

  const handleFiles   = (incoming) => setFiles(prev  => [...prev,  ...validateFiles(incoming)]);
  const handleMsFiles = (incoming) => setMsFiles(prev => [...prev,  ...validateFiles(incoming)]);

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleMsDrop = (e) => {
    e.preventDefault(); setMsDragging(false);
    handleMsFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    const { boardId, subjectId, unitId, chapterId, year, examSession, variant, paperNumber } = form;

    // Required fields
    if (!boardId)      return toast.warn("Board is required");
    if (!subjectId)    return toast.warn("Subject is required");
    if (!unitId)       return toast.warn("Unit is required");
    if (!chapterId)    return toast.warn("Chapter is required");
    if (!year)         return toast.warn("Year is required");
    if (!examSession)  return toast.warn("Exam session is required");
    if (!variant)      return toast.warn("Variant is required");
    if (!paperNumber)  return toast.warn("Paper number is required");
    if (files.length === 0) return toast.warn("Please select at least one question file");


    const user = JSON.parse(localStorage.getItem("user") || "{}");

    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) formData.append(k, v); });
    if (user.id) formData.append("uploadedBy", user.id);
    files.forEach(f   => formData.append("files",       f));
    msFiles.forEach(f => formData.append("markschemes", f));

    setUploading(true);
    try {
      await api.post("/qb/questions", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });
      toast.success(`Uploaded ${files.length} question file(s)${msFiles.length > 0 ? ` + ${msFiles.length} mark scheme(s)` : ""}`);
      setFiles([]);
      setMsFiles([]);
      setForm({
        boardId: "", subjectId: "", unitId: "", chapterId: "",
        year: "", examSession: "", variant: "", paperNumber: "", questionNumber: ""
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024)      return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  };

  const FileItem = ({ f, onRemove, isMs }) => (
    <div className="qb-file-item" style={isMs ? { borderLeft: "3px solid var(--success)" } : {}}>
      <div className="qb-file-item-left">
        <span className="qb-file-icon">{f.type === "application/pdf" ? "📄" : "🖼️"}</span>
        <div>
          <div className="qb-file-name">{f.name}</div>
          <div className="qb-file-size">
            {formatSize(f.size)}{isMs ? " · Mark Scheme" : " · Question"}
          </div>
        </div>
      </div>
      <button className="qb-btn qb-btn--danger" onClick={onRemove}>
        <FiX size={13} />
      </button>
    </div>
  );

  return (
    <QBLayout title="Upload Questions" subtitle="Upload question files with full metadata">

      {/* ── REQUIRED DETAILS ── */}
      <div className="qb-panel">
        <div className="qb-panel-title">📌 Required Details</div>
        <div className="qb-form-row">
          <div className="qb-form-group">
            <label className="qb-label">Board *</label>
            <select className="qb-select" value={form.boardId} onChange={e => set("boardId", e.target.value)}>
              <option value="">Select board</option>
              {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Subject *</label>
            <select className="qb-select" value={form.subjectId} onChange={e => set("subjectId", e.target.value)} disabled={!form.boardId}>
              <option value="">Select subject</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Unit *</label>
            <select className="qb-select" value={form.unitId} onChange={e => set("unitId", e.target.value)} disabled={!form.subjectId}>
              <option value="">Select unit</option>
              {units.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Chapter *</label>
            <select className="qb-select" value={form.chapterId} onChange={e => set("chapterId", e.target.value)} disabled={!form.unitId}>
              <option value="">Select chapter</option>
              {chapters.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── OPTIONAL DETAILS ── */}
      <div className="qb-panel">
        <div className="qb-panel-title">🗓️ Exam Details</div>
        <div className="qb-form-row">
          <div className="qb-form-group">
            <label className="qb-label">Year *</label>
            <select className="qb-select" value={form.year} onChange={e => set("year", e.target.value)}>
              <option value="">Select year</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Exam Session *</label>
            <select className="qb-select" value={form.examSession} onChange={e => set("examSession", e.target.value)}>
              <option value="">Select session</option>
              {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Variant *</label>
            <select className="qb-select" value={form.variant} onChange={e => set("variant", e.target.value)}>
              <option value="">Select variant</option>
              {VARIANTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Paper Number *</label>
            <select
              className="qb-select"
              value={form.paperNumber}
              onChange={e => set("paperNumber", e.target.value)}
              disabled={!selectedSubject?.paperNumbers?.length}
            >
              <option value="">Select paper</option>
              {(selectedSubject?.paperNumbers || []).map(p => (
                <option key={p} value={p}>Paper {p}</option>
              ))}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Question Number</label>
            <input
              className="qb-input"
              placeholder="e.g. 3b"
              value={form.questionNumber}
              onChange={e => set("questionNumber", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── FILES ── */}
      <div className="qb-panel">
        <div className="qb-panel-title">📁 Question Files</div>

        {/* Question dropzone */}
        <div
          className={`qb-dropzone ${dragging ? "qb-dropzone--active" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            style={{ display: "none" }}
            onChange={e => handleFiles(e.target.files)}
          />
          <div className="qb-dropzone-icon">☁️</div>
          <div className="qb-dropzone-text">Drop question files here or click to browse</div>
          <div className="qb-dropzone-hint">PDF, JPG, PNG, WEBP — max 20MB per file</div>
        </div>

        {files.length > 0 && (
          <div className="qb-file-list">
            {files.map((f, i) => (
              <FileItem key={i} f={f} isMs={false} onRemove={() => setFiles(arr => arr.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        <hr className="qb-divider" />

        {/* Mark scheme section */}
        <div className="qb-panel-title" style={{ marginBottom: 12 }}>
          📋 Mark Scheme Files
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>Optional</span>
        </div>

        <div
          className={`qb-dropzone ${msDragging ? "qb-dropzone--active" : ""}`}
          style={{ borderColor: msFiles.length > 0 ? "color-mix(in srgb, var(--success) 40%, transparent)" : "var(--border)", background: msFiles.length > 0 ? "color-mix(in srgb, var(--success) 4%, transparent)" : undefined }}
          onDragOver={e => { e.preventDefault(); setMsDragging(true); }}
          onDragLeave={() => setMsDragging(false)}
          onDrop={handleMsDrop}
          onClick={() => msInputRef.current.click()}
        >
          <input
            ref={msInputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            style={{ display: "none" }}
            onChange={e => handleMsFiles(e.target.files)}
          />
          <div className="qb-dropzone-icon">📋</div>
          <div className="qb-dropzone-text">Drop mark scheme files here or click to browse</div>
          <div className="qb-dropzone-hint">Will be stored alongside the question files in Drive</div>
        </div>

        {msFiles.length > 0 && (
          <div className="qb-file-list">
            {msFiles.map((f, i) => (
              <FileItem key={i} f={f} isMs={true} onRemove={() => setMsFiles(arr => arr.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}

        {/* Summary + Upload button */}
        {(files.length > 0 || msFiles.length > 0) && (
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button
              className="qb-btn qb-btn--primary"
              onClick={handleSubmit}
              disabled={uploading || files.length === 0}
              style={{ fontSize: 14, padding: "12px 28px" }}
            >
              {uploading
                ? <><span className="qb-spinner" /> Uploading to Drive…</>
                : `⬆️ Upload ${files.length} Question${files.length !== 1 ? "s" : ""}${msFiles.length > 0 ? ` + ${msFiles.length} Mark Scheme${msFiles.length !== 1 ? "s" : ""}` : ""}`
              }
            </button>
            {(files.length > 0 || msFiles.length > 0) && !uploading && (
              <button
                className="qb-btn qb-btn--ghost"
                onClick={() => { setFiles([]); setMsFiles([]); }}
              >
                Clear All
              </button>
            )}
          </div>
        )}

        {files.length === 0 && msFiles.length === 0 && (
          <div style={{ marginTop: 20 }}>
            <button
              className="qb-btn qb-btn--primary"
              onClick={handleSubmit}
              disabled={uploading}
              style={{ fontSize: 14, padding: "12px 28px", opacity: 0.5, cursor: "not-allowed" }}
            >
              ⬆️ Upload
            </button>
          </div>
        )}

      </div>

    </QBLayout>
  );
}