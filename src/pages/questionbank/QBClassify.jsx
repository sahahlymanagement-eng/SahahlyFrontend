import { useEffect, useRef, useState } from "react";
import { FiX, FiCheck, FiAlertTriangle, FiUploadCloud } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import QBLayout from "./QBLayout";
import "./QuestionBank.css";

const SESSIONS  = ["May/June", "Oct/Nov", "Feb/Mar"];
const VARIANTS  = ["1", "2", "3"];
const THIS_YEAR = new Date().getFullYear();
const YEARS     = Array.from({ length: THIS_YEAR - 1999 }, (_, i) => THIS_YEAR - i);
const BASE_URL  = import.meta.env.VITE_API_BASE_URL || "http://localhost:6001/api";

const STEPS = ["Select Subject", "Upload Exam", "Review & Edit", "Upload to Drive"];

export default function QBClassify() {
  const examRef = useRef();
  const msRef   = useRef();

  // Step
  const [step, setStep] = useState(0);
  const [fullMsTempFile, setFullMsTempFile] = useState(null);
  const [cropModal,      setCropModal]      = useState(null); // { questionIdx, currentFile }
  const [cropPage,       setCropPage]       = useState(1);
  const [cropYStart,     setCropYStart]     = useState(0.0);
  const [cropYEnd,       setCropYEnd]       = useState(1.0);
  const [cropPreview,    setCropPreview]    = useState(null);
  const [cropLoading,    setCropLoading]    = useState(false);
  const [totalPages,     setTotalPages]     = useState(1);

  // Step 0 — subject selection
  const [boards,   setBoards]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selBoard,   setSelBoard]   = useState("");
  const [selSubject, setSelSubject] = useState("");
  const [aiProvider, setAiProvider] = useState("claude");


  // Step 1 — upload
  const [examFile, setExamFile] = useState(null);
  const [msFile,   setMsFile]   = useState(null);
  const [year,         setYear]         = useState("");
  const [examSession,  setExamSession]  = useState("");
  const [variant,      setVariant]      = useState("");
  const [paperNumber,  setPaperNumber]  = useState("");
  const [classifying,  setClassifying]  = useState(false);

  // Step 2 — review
  const [classifyResult, setClassifyResult] = useState(null);
  const [questions,      setQuestions]      = useState([]);
  const [previewQ,       setPreviewQ]       = useState(null);
  const [previewMode,    setPreviewMode]    = useState("question"); // "question" | "markscheme"

  // Step 3 — upload
  const [uploading,     setUploading]     = useState(false);
  const [uploadResults, setUploadResults] = useState(null);

  useEffect(() => {
    api.get("/qb/boards").then(r => setBoards(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selBoard) { setSubjects([]); setSelSubject(""); return; }
    api.get(`/qb/subjects?boardId=${selBoard}`).then(r => setSubjects(r.data)).catch(() => {});
    setSelSubject("");
  }, [selBoard]);

  // ── STEP 1: Classify ─────────────────────────────────────────────
  const handleClassify = async () => {
  if (!selSubject)   return toast.warn("Select a subject first");
  if (!examFile)     return toast.warn("Upload the exam PDF first");
  if (!year)         return toast.warn("Year is required");
  if (!examSession)  return toast.warn("Exam session is required");
  if (!variant)      return toast.warn("Variant is required");
  if (!paperNumber)  return toast.warn("Paper number is required");
    const formData = new FormData();
    formData.append("examPdf",   examFile);
    formData.append("subjectId", selSubject);
    if (msFile) formData.append("markSchemePdf", msFile);

    setClassifying(true);
    try {
      const res = await api.post(`/qb-drive/classify?ai=${aiProvider}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000
      });

      setClassifyResult(res.data);
      setQuestions(res.data.questions.map(q => ({ ...q })));
      setFullMsTempFile(res.data.fullMsTempFile || null);
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.message || "Classification failed");
    } finally {
      setClassifying(false);
    }
  };

  // ── STEP 2: Edit question classification ─────────────────────────
  const updateQuestion = (idx, key, val) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== idx) return q;
      const updated = { ...q, [key]: val };
      // If unit changes, reset chapter
      if (key === "unitId") {
        updated.chapterId   = "";
        updated.chapterName = "";
      }
      // Update name when ID changes
      if (key === "unitId") {
        const unit = classifyResult.units.find(u => String(u._id) === val);
        updated.unitName = unit?.name || "";
      }
      if (key === "chapterId") {
        const chapter = classifyResult.chapters.find(c => String(c._id) === val);
        updated.chapterName = chapter?.name || "";
      }
      return updated;
    }));
  };

  const chaptersForUnit = (unitId) =>
    (classifyResult?.chapters || []).filter(c => String(c.unitId) === String(unitId));

  // ── STEP 3: Confirm upload ────────────────────────────────────────
  const handleConfirmUpload = async () => {
    const unclassified = questions.filter(q => !q.unitId || !q.chapterId);
    if (unclassified.length > 0) {
      return toast.warn(`${unclassified.length} question(s) still need unit/chapter assignment`);
    }

    const selectedSubjectObj = subjects.find(s => s._id === selSubject);

    setUploading(true);
    try {
      const res = await api.post("/qb-drive/confirm-upload", {
        subjectId:   selSubject,
        boardId:     selBoard,
        year:        year        || null,
        examSession: examSession || null,
        variant:     variant     || null,
        paperNumber: paperNumber || null,
        questions:   questions.map(q => ({
          questionNumber: q.questionNumber,
          questionLabel:  q.questionLabel,
          unitId:         q.unitId,
          chapterId:      q.chapterId,
          tempFile:       q.tempFile,
          msTempFile:     q.msTempFile || null,
          topic:          q.topic
        }))
      });

      setUploadResults(res.data);
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const resetAll = () => {
    setStep(0);
    setSelBoard(""); setSelSubject("");
    setExamFile(null); setMsFile(null);
    setYear(""); setExamSession(""); setVariant(""); setPaperNumber("");
    setClassifyResult(null); setQuestions([]);
    setUploadResults(null); setPreviewQ(null);
  };

  const getConfColor = (score) => {
    if (score >= 80) return "var(--success)";
    if (score >= 60) return "var(--warning)";
    return "var(--danger)";
  };

  const selectedSubjectObj = subjects.find(s => s._id === selSubject);

  return (
    <QBLayout title="AI Exam Classifier" subtitle="Upload a full exam and let Claude classify each question">

      {/* ── STEPPER ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: i < step ? "var(--success)" : i === step ? "var(--primary)" : "color-mix(in srgb, var(--text-primary) 10%, transparent)",
                border: `2px solid ${i < step ? "var(--success)" : i === step ? "var(--primary)" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, flexShrink: 0
              }}>
                {i < step ? <FiCheck size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === step ? "var(--primary-contrast)" : "var(--muted)", whiteSpace: "nowrap" }}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 8px", marginBottom: 20,
                background: i < step ? "var(--success)" : "color-mix(in srgb, var(--text-primary) 10%, transparent)"
              }} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP 0: Select Subject ── */}
      {step === 0 && (
        <div className="qb-panel">
          <div className="qb-panel-title">📚 Select Subject</div>
          <div className="qb-form-row">
            <div className="qb-form-group">
              <label className="qb-label">Board</label>
              <select className="qb-select" value={selBoard} onChange={e => setSelBoard(e.target.value)}>
                <option value="">Select board</option>
                {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Subject</label>
              <select className="qb-select" value={selSubject} onChange={e => setSelSubject(e.target.value)} disabled={!selBoard}>
                <option value="">Select subject</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {selSubject && (
            <div style={{ marginTop: 20 }}>
              <button className="qb-btn qb-btn--primary" onClick={() => setStep(1)}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 1: Upload Exam ── */}
      {step === 1 && (
        <>
          {/* Optional metadata */}
          <div className="qb-panel">
            <div className="qb-panel-title">🗓️ Exam Details</div>
            <div className="qb-form-row">
              <div className="qb-form-group">
                <label className="qb-label">Year *</label>
                <select className="qb-select" value={year} onChange={e => setYear(e.target.value)}>
                  <option value="">Select year</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="qb-form-group">
                <label className="qb-label">Session *</label>
                <select className="qb-select" value={examSession} onChange={e => setExamSession(e.target.value)}>
                  <option value="">Select session</option>
                  {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="qb-form-group">
                <label className="qb-label">Variant *</label>
                <select className="qb-select" value={variant} onChange={e => setVariant(e.target.value)}>
                  <option value="">Select variant</option>
                  {VARIANTS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="qb-form-group">
                <label className="qb-label">Paper Number *</label>
                <select
                  className="qb-select"
                  value={paperNumber}
                  onChange={e => setPaperNumber(e.target.value)}
                  disabled={!selectedSubjectObj?.paperNumbers?.length}
                >
                  <option value="">Select paper</option>
                  {(selectedSubjectObj?.paperNumbers || []).map(p => (
                    <option key={p} value={p}>Paper {p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Exam PDF upload */}
          <div className="qb-panel">
            <div className="qb-panel-title">📄 Exam PDF *</div>
            <div
              className={`qb-dropzone ${examFile ? "qb-dropzone--active" : ""}`}
              onClick={() => examRef.current.click()}
            >
              <input
                ref={examRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={e => setExamFile(e.target.files[0] || null)}
              />
              <div className="qb-dropzone-icon">{examFile ? "✅" : "📄"}</div>
              <div className="qb-dropzone-text">
                {examFile ? examFile.name : "Click to upload exam PDF"}
              </div>
              {examFile && (
                <button
                  className="qb-btn qb-btn--danger"
                  style={{ marginTop: 8 }}
                  onClick={e => { e.stopPropagation(); setExamFile(null); }}
                >
                  <FiX size={13} /> Remove
                </button>
              )}
            </div>

            <hr className="qb-divider" />

            <div className="qb-panel-title" style={{ marginBottom: 12 }}>
              📋 Mark Scheme PDF
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>Optional</span>
            </div>
            <div
              className={`qb-dropzone ${msFile ? "qb-dropzone--active" : ""}`}
              style={{ borderColor: msFile ? "color-mix(in srgb, var(--success) 40%, transparent)" : undefined }}
              onClick={() => msRef.current.click()}
            >
              <input
                ref={msRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={e => setMsFile(e.target.files[0] || null)}
              />
              <div className="qb-dropzone-icon">{msFile ? "✅" : "📋"}</div>
              <div className="qb-dropzone-text">
                {msFile ? msFile.name : "Click to upload mark scheme PDF"}
              </div>
              {msFile && (
                <button
                  className="qb-btn qb-btn--danger"
                  style={{ marginTop: 8 }}
                  onClick={e => { e.stopPropagation(); setMsFile(null); }}
                >
                  <FiX size={13} /> Remove
                </button>
              )}
            </div>

            {/* AI PROVIDER TOGGLE */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>AI Provider:</span>
              <div style={{ display: "flex", gap: 6 }}>
                {["claude", "gemini"].map(p => (
                  <button
                    key={p}
                    className={`qb-btn ${aiProvider === p ? "qb-btn--primary" : "qb-btn--ghost"}`}
                    style={{ fontSize: 13, padding: "6px 14px" }}
                    onClick={() => setAiProvider(p)}
                  >
                    {p === "claude" ? "🤖 Claude" : "✨ Sahahly"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <button className="qb-btn qb-btn--ghost" onClick={() => setStep(0)}>← Back</button>
              <button
                className="qb-btn qb-btn--primary"
                onClick={handleClassify}
                disabled={classifying || !examFile}
                style={{ fontSize: 14, padding: "12px 28px" }}
              >
                {classifying
                  ? <><span className="qb-spinner" /> {aiProvider === "claude" ? "Claude" : "Sahahly"} is classifying…</>
                  : `🤖 Classify with ${aiProvider === "claude" ? "Claude" : "Sahahly"}`
                }
              </button>
            </div>

            {classifying && (
              <div style={{ marginTop: 16, padding: "14px 18px", background: "color-mix(in srgb, var(--primary) 8%, transparent)", borderRadius: 10, border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)", fontSize: 13, color: "var(--text-secondary)" }}>
                ⏳ {aiProvider === "claude" ? "Claude" : "Sahahly"} is reading the exam, identifying question boundaries, and classifying each question. This may take 30–90 seconds depending on the exam length.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── STEP 2: Review & Edit ── */}
      {step === 2 && classifyResult && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {questions.length} questions identified in {classifyResult.subject?.name}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                Review and correct the unit/chapter assignments below, then confirm upload
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="qb-btn qb-btn--ghost" onClick={() => setStep(1)}>← Back</button>
              <button
                className="qb-btn qb-btn--primary"
                onClick={handleConfirmUpload}
                disabled={uploading}
                style={{ fontSize: 14, padding: "10px 24px" }}
              >
                {uploading
                  ? <><span className="qb-spinner" /> Uploading…</>
                  : `✅ Confirm & Upload ${questions.length} Questions`
                }
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {questions.map((q, idx) => {
              const confColor   = getConfColor(q.confidence);
              const unitChapters = chaptersForUnit(q.unitId);
              const isComplete  = q.unitId && q.chapterId;

              return (
                <div
                  key={idx}
                  className="qb-panel"
                  style={{
                    borderColor: isComplete ? "var(--border)" : "color-mix(in srgb, var(--danger) 30%, transparent)",
                    padding: 20
                  }}
                >
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>

                    {/* LEFT: preview thumbnails */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
                      <div
                        style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", height: 140, background: "#fff" }}
                        onClick={() => { setPreviewQ(q); setPreviewMode("question"); }}
                      >
                        <iframe
                          src={`${BASE_URL}/qb-drive/temp/${q.tempFile}`}
                          style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none" }}
                          title={`Q${q.questionNumber}`}
                        />
                      </div>
                      <button
                        className="qb-btn qb-btn--ghost"
                        style={{ fontSize: 12, padding: "6px 10px" }}
                        onClick={() => { setPreviewQ(q); setPreviewMode("question"); }}
                      >
                        👁 Preview Question
                      </button>
                      {q.msTempFile && (
                        <button
                          className="qb-btn qb-btn--ghost"
                          style={{ fontSize: 12, padding: "6px 10px", borderColor: "color-mix(in srgb, var(--success) 40%, transparent)", color: "var(--success)" }}
                          onClick={() => { setPreviewQ(q); setPreviewMode("markscheme"); }}
                        >
                          📋 Preview Mark Scheme
                        </button>
                      )}
                      {fullMsTempFile && (
                      <button
                        className="qb-btn qb-btn--ghost"
                        style={{ fontSize: 12, padding: "6px 10px", borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)", color: "var(--warning)" }}
                        onClick={() => {
                          setCropModal({ questionIdx: idx });
                          setCropPage(1);
                          setCropYStart(0.0);
                          setCropYEnd(1.0);
                          setCropPreview(null);
                        }}
                      >
                        ✂️ Fix Mark Scheme
                      </button>
                    )}
                    </div>

                    {/* RIGHT: details + edit */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 700 }}>
                          {q.questionLabel || `Question ${q.questionNumber}`}
                        </span>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20,
                          border: `1px solid ${confColor}`,
                          background: `color-mix(in srgb, ${confColor} 15%, transparent)`,
                          color: confColor, fontSize: 12, fontWeight: 700
                        }}>
                          {q.confidence}% confidence
                        </span>
                        {!isComplete && (
                          <span style={{ padding: "3px 10px", borderRadius: 20, background: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)", fontSize: 12, fontWeight: 700 }}>
                            ⚠️ Needs assignment
                          </span>
                        )}
                      </div>

                      {q.topic && (
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                          Topic: {q.topic}
                        </div>
                      )}

                      <div className="qb-form-row">
                        <div className="qb-form-group">
                          <label className="qb-label">Unit</label>
                          <select
                            className="qb-select"
                            value={q.unitId || ""}
                            onChange={e => updateQuestion(idx, "unitId", e.target.value)}
                          >
                            <option value="">Select unit</option>
                            {classifyResult.units.map(u => (
                              <option key={u._id} value={u._id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="qb-form-group">
                          <label className="qb-label">Chapter</label>
                          <select
                            className="qb-select"
                            value={q.chapterId || ""}
                            onChange={e => updateQuestion(idx, "chapterId", e.target.value)}
                            disabled={!q.unitId}
                          >
                            <option value="">Select chapter</option>
                            {unitChapters.map(c => (
                              <option key={c._id} value={c._id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom confirm button */}
          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="qb-btn qb-btn--primary"
              onClick={handleConfirmUpload}
              disabled={uploading}
              style={{ fontSize: 14, padding: "12px 28px" }}
            >
              {uploading
                ? <><span className="qb-spinner" /> Uploading to Drive…</>
                : `✅ Confirm & Upload ${questions.length} Questions to Drive`
              }
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3: Upload Results ── */}
      {step === 3 && uploadResults && (
        <div className="qb-panel">
          <div className="qb-panel-title">
            {uploadResults.failed === 0 ? "✅ All Questions Uploaded Successfully" : "⚠️ Upload Complete with Errors"}
          </div>

          <div style={{ display: "flex", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ background: "color-mix(in srgb, var(--success) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", borderRadius: 12, padding: "16px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>{uploadResults.succeeded}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Uploaded</div>
            </div>
            {uploadResults.failed > 0 && (
              <div style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", borderRadius: 12, padding: "16px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--danger)" }}>{uploadResults.failed}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Failed</div>
              </div>
            )}
            <div style={{ background: "color-mix(in srgb, var(--text-primary) 5%, transparent)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{uploadResults.total}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Total</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {uploadResults.results.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px", borderRadius: 8,
                  background: r.status === "success" ? "color-mix(in srgb, var(--success) 7%, transparent)" : "color-mix(in srgb, var(--danger) 7%, transparent)",
                  border: `1px solid ${r.status === "success" ? "color-mix(in srgb, var(--success) 20%, transparent)" : "color-mix(in srgb, var(--danger) 20%, transparent)"}`
                }}
              >
                {r.status === "success"
                  ? <FiCheck size={16} color="var(--success)" />
                  : <FiAlertTriangle size={16} color="var(--danger)" />
                }
                <span style={{ fontWeight: 600 }}>Question {r.questionNumber}</span>
                {r.error && <span style={{ fontSize: 13, color: "var(--danger)" }}> — {r.error}</span>}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button className="qb-btn qb-btn--primary" onClick={resetAll}>
              + Classify Another Exam
            </button>
            <button className="qb-btn qb-btn--ghost" onClick={() => window.location.href = "/questionbank/browse"}>
              Browse Question Bank
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW MODAL ── */}
      {previewQ && (
        <div className="qb-modal-overlay" onClick={() => setPreviewQ(null)}>
          <div className="qb-modal" onClick={e => e.stopPropagation()}>
            <div className="qb-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="qb-modal-title">
                  {previewQ.questionLabel || `Question ${previewQ.questionNumber}`}
                </span>
                {previewQ.msTempFile && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className={`qb-preview-tab ${previewMode === "question" ? "qb-preview-tab--active" : ""}`}
                      onClick={() => setPreviewMode("question")}
                    >
                      📄 Question
                    </button>
                    <button
                      className={`qb-preview-tab ${previewMode === "markscheme" ? "qb-preview-tab--active" : ""}`}
                      onClick={() => setPreviewMode("markscheme")}
                      style={previewMode === "markscheme" ? { background: "var(--success)", borderColor: "var(--success)" } : { borderColor: "color-mix(in srgb, var(--success) 40%, transparent)", color: "var(--success)" }}
                    >
                      📋 Mark Scheme
                    </button>
                  </div>
                )}
              </div>
              <button className="qb-modal-close" onClick={() => setPreviewQ(null)}>✕ Close</button>
            </div>
            <div className="qb-modal-body">
              <iframe
                src={`${BASE_URL}/qb-drive/temp/${previewMode === "markscheme" ? previewQ.msTempFile : previewQ.tempFile}`}
                className="qb-preview-frame"
                title="Preview"
              />
            </div>
          </div>
        </div>
      )}
      {/* ── CROP MODAL ── */}
      {cropModal && fullMsTempFile && (
        <div className="qb-modal-overlay" onClick={() => setCropModal(null)}>
          <div className="qb-modal" style={{ maxWidth: 1100 }} onClick={e => e.stopPropagation()}>
            <div className="qb-modal-header">
              <span className="qb-modal-title">
                ✂️ Fix Mark Scheme — {questions[cropModal.questionIdx]?.questionLabel || `Q${questions[cropModal.questionIdx]?.questionNumber}`}
              </span>
              <button className="qb-modal-close" onClick={() => setCropModal(null)}>✕ Close</button>
            </div>

            <div className="qb-modal-body" style={{ display: "flex", gap: 20 }}>

              {/* LEFT: full mark scheme */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                  Full Mark Scheme — find the correct section
                </div>
                <iframe
                  src={`${BASE_URL}/qb-drive/temp/${fullMsTempFile}`}
                  style={{ width: "100%", height: 520, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }}
                  title="Full Mark Scheme"
                />
              </div>

              {/* RIGHT: crop controls + preview */}
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Set crop boundaries
                </div>

                <div className="qb-form-group">
                  <label className="qb-label">Page Number</label>
                  <input
                    className="qb-input"
                    type="number"
                    min={1}
                    value={cropPage}
                    onChange={e => setCropPage(Number(e.target.value))}
                  />
                </div>

                <div className="qb-form-group">
                  <label className="qb-label">Top (0.0 = top of page)</label>
                  <input
                    className="qb-input"
                    type="number"
                    min={0} max={1} step={0.01}
                    value={cropYStart}
                    onChange={e => setCropYStart(Number(e.target.value))}
                  />
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={cropYStart}
                    onChange={e => setCropYStart(Number(e.target.value))}
                    style={{ width: "100%", marginTop: 6, accentColor: "var(--primary)" }}
                  />
                </div>

                <div className="qb-form-group">
                  <label className="qb-label">Bottom (1.0 = bottom of page)</label>
                  <input
                    className="qb-input"
                    type="number"
                    min={0} max={1} step={0.01}
                    value={cropYEnd}
                    onChange={e => setCropYEnd(Number(e.target.value))}
                  />
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={cropYEnd}
                    onChange={e => setCropYEnd(Number(e.target.value))}
                    style={{ width: "100%", marginTop: 6, accentColor: "var(--primary)" }}
                  />
                </div>

                <button
                  className="qb-btn qb-btn--ghost"
                  disabled={cropLoading}
                  onClick={async () => {
                    setCropLoading(true);
                    try {
                      const res = await api.post("/qb-drive/manual-crop", {
                        sourceTempFile: fullMsTempFile,
                        pageStart: cropPage,
                        pageEnd:   cropPage,
                        yStart:    cropYStart,
                        yEnd:      cropYEnd
                      });
                      setCropPreview(res.data.tempFile);
                    } catch {
                      toast.error("Crop preview failed");
                    } finally {
                      setCropLoading(false);
                    }
                  }}
                >
                  {cropLoading ? <><span className="qb-spinner" /> Cropping…</> : "👁 Preview Crop"}
                </button>

                {cropPreview && (
                  <>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Preview:</div>
                    <iframe
                      src={`${BASE_URL}/qb-drive/temp/${cropPreview}`}
                      style={{ width: "100%", height: 200, border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)", borderRadius: 8, background: "#fff" }}
                      title="Crop Preview"
                    />
                    <button
                      className="qb-btn qb-btn--success"
                      onClick={() => {
                        // Apply the crop to this question
                        setQuestions(prev => prev.map((q, i) =>
                          i === cropModal.questionIdx
                            ? { ...q, msTempFile: cropPreview }
                            : q
                        ));
                        toast.success("Mark scheme updated");
                        setCropModal(null);
                        setCropPreview(null);
                      }}
                    >
                      ✅ Apply to Question
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    

    </QBLayout>
  );
}