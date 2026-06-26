import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { confirmToast, promptToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import "./PaperMarking.css";
import { appendMarkingContext, currentUserId } from "../../utils/markingFormData";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import TokenUsageStats from "../../components/TokenUsageStats";
import { parseGeminiModelsResponse } from "../../utils/markingCost";

export default function PaperMarking() {
  const navigate = useNavigate();
  const studentRef = useRef();
  const markSchemeRef = useRef();

  const [studentFile, setStudentFile] = useState(null);
  const [markSchemeFile, setMarkSchemeFile] = useState(null);
  const [totalGrade, setTotalGrade] = useState("");
  const [guidance, setGuidance] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Subject selection
  const [boards,     setBoards]     = useState([]);
  const [subjects,   setSubjects]   = useState([]);
  const [selBoard,   setSelBoard]   = useState("");
  const [selSubject, setSelSubject] = useState("");
  const [subjectRules,    setSubjectRules]    = useState("");
  const [editingRules,    setEditingRules]    = useState(false);
  const [savingRules,     setSavingRules]     = useState(false);
  const [markingMode, setMarkingMode] = useState("normal");
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-3-flash-preview");

  // Saved prompts
  const [savedPrompts,    setSavedPrompts]    = useState([]);
  const [showPromptPanel, setShowPromptPanel] = useState(false);
  const [newPromptName,   setNewPromptName]   = useState("");
  const [newPromptContent,setNewPromptContent]= useState("");
  const [editingPrompt,   setEditingPrompt]   = useState(null);
  const [savingPrompt,    setSavingPrompt]    = useState(false);

  // Load boards + prompts on mount
  useEffect(() => {
    api.get("/qb/boards").then(r => setBoards(r.data)).catch(() => {});
    loadPrompts();
    api.get("/marking/gemini-models")
      .then(r => setGeminiModels(parseGeminiModelsResponse(r.data).models))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selBoard) { setSubjects([]); setSelSubject(""); setSubjectRules(""); return; }
    api.get(`/qb/subjects?boardId=${selBoard}`).then(r => setSubjects(r.data)).catch(() => {});
    setSelSubject(""); setSubjectRules("");
  }, [selBoard]);

  useEffect(() => {
    if (!selSubject) { setSubjectRules(""); return; }
    api.get(`/marking/subject-rules/${selSubject}`)
      .then(r => setSubjectRules(r.data.markingRules || ""))
      .catch(() => {});
  }, [selSubject]);

  const loadPrompts = () => {
    api.get("/marking/prompts").then(r => setSavedPrompts(r.data)).catch(() => {});
  };

  // ── SUBJECT RULES ──────────────────────────────────────────
  const saveSubjectRules = async () => {
    if (!selSubject) return;
    setSavingRules(true);
    try {
      await api.put(`/marking/subject-rules/${selSubject}`, { markingRules: subjectRules });
      toast.success("Subject rules saved");
      setEditingRules(false);
    } catch {
      toast.error("Failed to save rules");
    } finally {
      setSavingRules(false);
    }
  };

  // ── SAVED PROMPTS ──────────────────────────────────────────
  const saveNewPrompt = async () => {
    if (!newPromptName.trim() || !newPromptContent.trim()) {
      return toast.warn("Name and content are required");
    }
    setSavingPrompt(true);
    try {
      await api.post("/marking/prompts", { name: newPromptName.trim(), content: newPromptContent.trim() });
      toast.success("Prompt saved");
      setNewPromptName(""); setNewPromptContent("");
      loadPrompts();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSavingPrompt(false);
    }
  };

  const updatePrompt = async (id) => {
    try {
      await api.put(`/marking/prompts/${id}`, {
        name:    editingPrompt.name,
        content: editingPrompt.content
      });
      toast.success("Prompt updated");
      setEditingPrompt(null);
      loadPrompts();
    } catch {
      toast.error("Failed to update");
    }
  };

  const deletePrompt = async (id) => {
    const confirmed = await confirmToast("Delete this prompt?", {
      title: "Delete prompt",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.delete(`/marking/prompts/${id}`);
      toast.success("Deleted");
      loadPrompts();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── MARK ──────────────────────────────────────────────────
  const handleMark = async () => {
    if (!studentFile) {
      toast.warn("Please upload the student answer PDF");
      return;
    }

    if (!markSchemeFile) {
      toast.warn("Please upload the mark scheme PDF");
      return;
    }

    
    

    const formData = new FormData();
    formData.append("studentPdf", studentFile);
    formData.append("markSchemePdf", markSchemeFile);
    formData.append("totalGrade",    totalGrade);
    formData.append("guidance",      guidance);
    formData.append("markingMode", markingMode);
    formData.append("geminiModel", geminiModel);
    if (selSubject) formData.append("subjectId", selSubject);
    appendMarkingContext(formData);

    setLoading(true);
    setResult(null);

    try {
      const res = await api.post("/marking/mark", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      setResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Marking failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadGradedPDF = async () => {
    if (!result || !studentFile) return;

    setDownloading(true);

    try {
      const pdfBytes = await annotatePdf({
        studentFile,
        questions: result.questions,
        totalMarks: result.totalMarks,
        maxTotalMarks: result.maxTotalMarks,
        summary: result.summary || ""
      });

      const url = URL.createObjectURL(
        new Blob([pdfBytes], { type: "application/pdf" })
      );

      const a = document.createElement("a");
      a.href = url;
      a.download = studentFile.name.replace(/\.pdf$/i, "") + "_graded.pdf";
      a.click();

      URL.revokeObjectURL(url);
      toast.success("Marked paper downloaded!");
    } catch (err) {
      toast.error(err.message || "Failed to generate marked paper");
    } finally {
      setDownloading(false);
    }
  };

  const getScoreColor = (awarded, max) => {
    const pct = awarded / max;

    if (pct >= 0.75) return "#22c55e";
    if (pct >= 0.5) return "#f59e0b";
    return "#ef4444";
  };

  const totalPct = result
    ? Math.round((result.totalMarks / result.maxTotalMarks) * 100)
    : 0;

  const CHECKLIST_CONFIG = [
    { key: "scanningClarity", label: "Scanning Clarity", passIsGood: true },
    { key: "handwritingClarity", label: "Handwriting Clarity", passIsGood: true },
    { key: "markSchemeUnderstanding", label: "Mark Scheme Understanding", passIsGood: true },
    { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true },
    { key: "answerIsBlank", label: "Answer is Blank", passIsGood: false }
  ];

  const hasChecklistIssues = (checklist) => {
    if (!checklist) return false;

    return CHECKLIST_CONFIG.some(({ key, passIsGood }) => {
      const val = checklist[key];
      return passIsGood ? val === false : val === true;
    });
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">
        <header className="pm-header">
          <h2>AI Paper Marking</h2>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="pm-back"
              style={{ background: "rgba(57,156,242,0.15)", borderColor: "rgba(57,156,242,0.3)", color: "#399cf2" }}
              onClick={() => setShowPromptPanel(v => !v)}
            >
              📋 Saved Prompts
            </button>
            <button className="pm-back" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </header>

        {/* ── SAVED PROMPTS PANEL ── */}
        {showPromptPanel && (
          <div className="pm-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>📋 Saved Prompts</h3>
              <button className="pm-back" onClick={() => setShowPromptPanel(false)}>✕</button>
            </div>

            {/* Create new */}
            <div style={{ marginBottom: 20, padding: 16, background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "rgba(255,255,255,0.6)" }}>New Prompt</div>
              <input
                className="pm-input"
                placeholder="Prompt name (e.g. Cambridge Physics Strict)"
                value={newPromptName}
                onChange={e => setNewPromptName(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <textarea
                className="pm-input pm-textarea"
                placeholder="Prompt content..."
                value={newPromptContent}
                onChange={e => setNewPromptContent(e.target.value)}
                rows={3}
                style={{ marginBottom: 8 }}
              />
              <button
                className="pm-mark-btn"
                onClick={saveNewPrompt}
                disabled={savingPrompt}
                style={{ fontSize: 13, padding: "8px 18px" }}
              >
                {savingPrompt ? "Saving…" : "💾 Save Prompt"}
              </button>
            </div>

            {/* Saved list */}
            {savedPrompts.length === 0 && (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No saved prompts yet.</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {savedPrompts.map(p => (
                <div key={p._id} style={{ padding: 14, background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
                  {editingPrompt?._id === p._id ? (
                    <>
                      <input
                        className="pm-input"
                        value={editingPrompt.name}
                        onChange={e => setEditingPrompt(prev => ({ ...prev, name: e.target.value }))}
                        style={{ marginBottom: 8 }}
                      />
                      <textarea
                        className="pm-input pm-textarea"
                        value={editingPrompt.content}
                        onChange={e => setEditingPrompt(prev => ({ ...prev, content: e.target.value }))}
                        rows={3}
                        style={{ marginBottom: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="pm-mark-btn" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => updatePrompt(p._id)}>✅ Save</button>
                        <button className="pm-back" onClick={() => setEditingPrompt(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10, whiteSpace: "pre-wrap" }}>{p.content}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="pm-mark-btn"
                          style={{ fontSize: 12, padding: "6px 14px", background: "#22c55e" }}
                          onClick={() => { setGuidance(p.content); setShowPromptPanel(false); toast.success(`"${p.name}" applied`); }}
                        >
                          ✅ Use This
                        </button>
                        <button className="pm-back" style={{ fontSize: 12 }} onClick={() => setEditingPrompt({ _id: p._id, name: p.name, content: p.content })}>✏️ Edit</button>
                        <button className="pm-back" style={{ fontSize: 12, color: "#ff4d4f", borderColor: "rgba(255,77,79,0.3)" }} onClick={() => deletePrompt(p._id)}>🗑 Delete</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MODE SELECTOR ── */}
        <div className="pm-mode-selector">
          {[
            { value: "normal",   label: "📋 Normal Marking",   desc: "Marks against the mark scheme using subject rules" },
            { value: "criteria", label: "🎯 Criteria Marking",  desc: "Marks against custom criteria set in the guidance" }
          ].map(m => (
            <div
              key={m.value}
              className={`pm-mode-card ${markingMode === m.value ? "pm-mode-card--active" : ""}`}
              onClick={() => setMarkingMode(m.value)}
            >
              <div className="pm-mode-label">{m.label}</div>
              <div className="pm-mode-desc">{m.desc}</div>
            </div>
          ))}
        </div>

        {/* ── GEMINI MODEL ── */}
        <div className="pm-panel">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🤖 Gemini Model</div>
          <select
            className="pm-input"
            value={geminiModel}
            onChange={e => setGeminiModel(e.target.value)}
          >
            {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <p style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            Flash-Lite models are cheaper and faster — use this dropdown to compare marking quality.
          </p>
        </div>

        {/* ── SUBJECT SELECTION ── */}
        <div className="pm-panel">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📚 Subject (Optional)</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180, flex: 1 }}>
              <label className="pm-input-label">Board</label>
              <select className="pm-input" value={selBoard} onChange={e => setSelBoard(e.target.value)}>
                <option value="">Select board</option>
                {boards.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180, flex: 1 }}>
              <label className="pm-input-label">Subject</label>
              <select className="pm-input" value={selSubject} onChange={e => setSelSubject(e.target.value)} disabled={!selBoard}>
                <option value="">Select subject</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Subject rules */}
          {selSubject && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label className="pm-input-label">Subject Rules (auto-injected into AI prompt)</label>
                {!editingRules ? (
                  <button className="pm-back" style={{ fontSize: 12 }} onClick={() => setEditingRules(true)}>✏️ Edit Rules</button>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="pm-mark-btn" style={{ fontSize: 12, padding: "5px 12px" }} onClick={saveSubjectRules} disabled={savingRules}>
                      {savingRules ? "Saving…" : "💾 Save"}
                    </button>
                    <button className="pm-back" style={{ fontSize: 12 }} onClick={() => setEditingRules(false)}>Cancel</button>
                  </div>
                )}
              </div>
              {editingRules ? (
                <textarea
                  className="pm-input pm-textarea"
                  value={subjectRules}
                  onChange={e => setSubjectRules(e.target.value)}
                  rows={4}
                  placeholder="e.g. This is Cambridge IGCSE Physics. Always require units in answers. Accept both SI and CGS units..."
                />
              ) : (
                <div style={{
                  padding: "10px 14px",
                  background: "rgba(57,156,242,0.06)",
                  border: "1px solid rgba(57,156,242,0.2)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: subjectRules ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
                  whiteSpace: "pre-wrap",
                  minHeight: 48
                }}>
                  {subjectRules || "No rules set for this subject yet. Click Edit Rules to add."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── UPLOAD ROW ── */}
        <div className="pm-upload-row">
          <UploadCard
            label="Student Answer Sheet"
            icon="📄"
            file={studentFile}
            inputRef={studentRef}
            onChange={setStudentFile}
          />

          <div className="pm-arrow">→</div>

          <UploadCard
            label="Mark Scheme"
            icon="📋"
            file={markSchemeFile}
            inputRef={markSchemeRef}
            onChange={setMarkSchemeFile}
          />

          <div className="pm-arrow">→</div>

          <div className="pm-action-card">
            <div className="pm-action-icon">🤖</div>
            <p>AI Marking</p>

            <button
              className="pm-mark-btn"
              onClick={handleMark}
              disabled={loading || !studentFile || !markSchemeFile}
            >
              {loading ? (
                <>
                  <span className="pm-spinner" /> Marking…
                </>
              ) : (
                "Mark Paper"
              )}
            </button>
          </div>
        </div>

        {/* ── INPUTS ── */}
        <div className="pm-inputs-row">
          <div className="pm-input-group">
            <label className="pm-input-label">Maximum Exam Grade</label>
            <input
              className="pm-input"
              type="number"
              placeholder="e.g. 80"
              value={totalGrade}
              onChange={(e) => setTotalGrade(e.target.value)}
            />
          </div>

          <div className="pm-input-group pm-input-group--wide">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="pm-input-label">
                {markingMode === "criteria"
                  ? "Criteria * (required — describe how to mark and total marks)"
                  : "Additional Guidance (optional)"}
              </label>
              {savedPrompts.length > 0 && (
                <select
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 10px", color: "white", fontSize: 12, cursor: "pointer" }}
                  value=""
                  onChange={e => { if (e.target.value) setGuidance(e.target.value); }}
                >
                  <option value="">📋 Load saved prompt…</option>
                  {savedPrompts.map(p => (
                    <option key={p._id} value={p.content}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              className="pm-input pm-textarea"
              placeholder={markingMode === "criteria"
                ? "e.g. Mark this essay out of 20. Award marks for: clarity (5), structure (5), argument (5), evidence (5). Be strict."
                : "e.g. Be strict. Award full marks only if units are included."
              }
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              rows={3}
            />
            {guidance && (
              <button
                style={{ marginTop: 6, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", textAlign: "left" }}
                onClick={async () => {
                  const name = await promptToast("Save this prompt as:", {
                    title: "Save prompt",
                    placeholder: "Prompt name",
                    confirmLabel: "Save",
                  });
                  if (name) {
                    api.post("/marking/prompts", { name, content: guidance })
                      .then(() => { toast.success("Prompt saved"); loadPrompts(); })
                      .catch(err => toast.error(err.response?.data?.message || "Failed to save"));
                  }
                }}
              >
                💾 Save current as prompt
              </button>
            )}
          </div>
        </div>

        {/* ── LOADING ── */}
        {loading && (
          <div className="pm-loading-panel">
            <div className="pm-loading-spinner" />
            <p>Analysing student answers against mark scheme…</p>
            <span>This may take up to 60 seconds for long papers</span>
          </div>
        )}

        {/* ── RESULTS ── */}
        {result && !loading && (
          <div className="pm-results">
            {/* DOWNLOAD BUTTON */}
            <div className="pm-download-row">
              <button
                className="pm-download-btn"
                onClick={downloadGradedPDF}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <span className="pm-spinner" /> Generating…
                  </>
                ) : (
                  "⬇ Download Marked Paper"
                )}
              </button>
            </div>

            {/* SCORE HEADER */}
            <div className="pm-score-header">
              <div className="pm-score-circle" style={{ "--pct": totalPct, "--color": getScoreColor(result.totalMarks, result.maxTotalMarks) }}>
                <span className="pm-score-num">{result.totalMarks}</span>
                <span className="pm-score-max">/ {result.maxTotalMarks}</span>
              </div>
              <div className="pm-score-info">
                <h3>
                  {totalPct}% —{" "}
                  {totalPct >= 75
                    ? "Strong Performance"
                    : totalPct >= 50
                    ? "Satisfactory Performance"
                    : "Needs Improvement"}
                </h3>
                <p className="pm-summary">{result.summary}</p>
              </div>
            </div>

            <PdfCompressionStats pdfCompression={result.pdfCompression} />

            <TokenUsageStats result={result} title="Gemini Token Usage" />

            {/* QUESTION BREAKDOWN */}
            <h3 className="pm-breakdown-title">Question Breakdown</h3>

            <div className="pm-questions">
              {result.questions.map((q, i) => {
                const color = getScoreColor(q.marksAwarded, q.maxMarks);
                const pct = Math.round((q.marksAwarded / q.maxMarks) * 100);
                const notAttempted = q.studentAnswer === "Not attempted";
                const hasIssues = hasChecklistIssues(q.checklist);

                return (
                  <div
                    key={i}
                    className={`pm-question-card ${
                      notAttempted ? "pm-question-card--missing" : ""
                    }`}
                  >
                    <div className="pm-q-header">
                      <span className="pm-q-number">Q{q.questionNumber}</span>

                      <div className="pm-q-right">
                        <div
                          className="pm-q-score"
                          style={{
                            color,
                            borderColor: color,
                            background: `${color}15`
                          }}
                        >
                          {q.marksAwarded} / {q.maxMarks}
                        </div>

                        {hasIssues && (
                          <div
                            className="pm-q-issue-badge"
                            title="Some checklist items flagged"
                          >
                            ⚠️ Review
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pm-q-bar-wrap">
                      <div className="pm-q-bar">
                        <div
                          className="pm-q-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: color
                          }}
                        />
                      </div>

                      <span className="pm-q-pct">{pct}%</span>
                    </div>

                    {q.checklist && (
                      <div className="pm-checklist">
                        {CHECKLIST_CONFIG.map(({ key, label, passIsGood }) => {
                          const val = q.checklist[key];
                          const isGood = passIsGood ? val === true : val === false;

                          return (
                            <div
                              key={key}
                              className={`pm-checklist-item ${
                                isGood
                                  ? "pm-checklist-item--pass"
                                  : "pm-checklist-item--fail"
                              }`}
                            >
                              <span className="pm-checklist-icon">
                                {isGood ? "✅" : "❌"}
                              </span>
                              <span className="pm-checklist-label">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {notAttempted ? (
                      <div className="pm-q-missing">
                        📭 Question not attempted / page missing
                      </div>
                    ) : (
                      q.studentAnswer && (
                        <div className="pm-q-section">
                          <span className="pm-q-label">Student Answer</span>
                          <p>{q.studentAnswer}</p>
                        </div>
                      )
                    )}

                    <div className="pm-q-section">
                      <span className="pm-q-label">Examiner Note</span>
                      <p>{q.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadCard({ label, icon, file, inputRef, onChange }) {
  return (
    <div
      className={`pm-upload-card ${file ? "pm-upload-card--done" : ""}`}
      onClick={() => inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files[0] || null)}
      />

      <div className="pm-upload-icon">{file ? "✅" : icon}</div>
      <p className="pm-upload-label">{label}</p>

      {file ? (
        <span className="pm-upload-filename">{file.name}</span>
      ) : (
        <span className="pm-upload-hint">Click to upload PDF</span>
      )}
    </div>
  );
} 
