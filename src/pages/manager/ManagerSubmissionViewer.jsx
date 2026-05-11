import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { annotatePdf } from "../../utils/annotatePdf";
import {
  FiUsers, FiClipboard, FiDownload, FiEye, FiCpu,
  FiUploadCloud, FiX, FiCalendar, FiSend
} from "react-icons/fi";
import ManagerSidebar from "../../components/ManagerSidebar";
import "./ManagerSubmissionViewer.css";

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",         passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

export default function ManagerSubmissionViewer() {
  const navigate   = useNavigate();
  const msInputRef = useRef();

  const [user,               setUser]               = useState(null);
  const [classrooms,         setClassrooms]         = useState([]);
  const [selectedClassroom,  setSelectedClassroom]  = useState(null);
  const [assignments,        setAssignments]        = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [students,           setStudents]           = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingStudents,    setLoadingStudents]    = useState(false);
  const [classroomSearch,    setClassroomSearch]    = useState("");
  const [assignmentSearch,   setAssignmentSearch]   = useState("");
  const [markingModeModal,   setMarkingModeModal]   = useState("normal");

  // Mark scheme
  const [msInfo,      setMsInfo]      = useState(null);
  const [uploadingMs, setUploadingMs] = useState(false);

  // Guidance modal
  const [guidanceModal,      setGuidanceModal]      = useState(null);
  const [guidance,           setGuidance]           = useState("");
  const [savedPrompts,       setSavedPrompts]       = useState([]);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);

  // AI marking
  const [markingStudentId, setMarkingStudentId] = useState(null);
  const [bulkMarking,      setBulkMarking]      = useState(false);
  const [bulkProgress,     setBulkProgress]     = useState({});

  // Results modal
  const [resultModal,      setResultModal]      = useState(null);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [downloading,      setDownloading]      = useState(false);
  const [returning,        setReturning]        = useState(false);

  // Compute effective max total — for criteria mode use sum of question maxMarks
  const effectiveMaxTotal = resultModal
    ? (resultModal.result.markingMode === "criteria"
        ? editingQuestions.reduce((s, q) => s + (q.maxMarks || 0), 0)
        : resultModal.result.maxTotalMarks)
    : 0;

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return navigate("/login");
    setUser(JSON.parse(stored));
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/students/my-classrooms?personId=${user.id}`)
      .then(r => setClassrooms(r.data || []))
      .catch(() => toast.error("Failed to load classrooms"));
    api.get("/marking/prompts")
      .then(r => setSavedPrompts(r.data || []))
      .catch(() => {});
  }, [user]);

  // Close prompt dropdown on outside click
  useEffect(() => {
    if (!promptDropdownOpen) return;
    const close = () => setPromptDropdownOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [promptDropdownOpen]);

  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setStudents([]);
    setAssignments([]);
    setMsInfo(null);
    setLoadingAssignments(true);
    try {
      const res = await api.get(`/manager-assignments/classroom/${classroom._id}/assignments`);
      setAssignments(res.data || []);
    } catch { toast.error("Failed to load assignments"); }
    finally   { setLoadingAssignments(false); }
  };

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);
    setStudents([]);
    setMsInfo(null);
    setBulkProgress({});
    setLoadingStudents(true);
    try {
      const [studRes, msRes] = await Promise.all([
        api.get(`/manager-assignments/${assignment._id}/full`),
        api.get(`/manager-assignments/${assignment._id}/markscheme`)
      ]);
      setStudents(studRes.data.students || []);
      setMsInfo(msRes.data.fileId ? msRes.data : null);
    } catch { toast.error("Failed to load students"); }
    finally   { setLoadingStudents(false); }
  };

  // ── MARK SCHEME UPLOAD ───────────────────────────────────────
  const handleMsUpload = async (file) => {
    if (!file || !selectedAssignment) return;
    setUploadingMs(true);
    try {
      const fd = new FormData();
      fd.append("markScheme", file);
      const res = await api.post(
        `/manager-assignments/${selectedAssignment._id}/upload-markscheme`,
        fd, { headers: { "Content-Type": "multipart/form-data" } }
      );
      setMsInfo({ fileId: res.data.fileId, webLink: res.data.webLink });
      toast.success("Mark scheme uploaded");
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally { setUploadingMs(false); }
  };

  const openGuidanceModal = (student = null) => {
    setGuidanceModal(student ? { student } : { bulk: true });
    setGuidance("");
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
  };

  // ── RUN MARKING ──────────────────────────────────────────────
  const runMarkStudent = async (student, guidanceText, mode = "normal") => {
    setMarkingStudentId(student.submissionId);
    try {
      const [studentPdfRes, msPdfRes] = await Promise.all([
        api.get("/submission-files/pdf", {
          params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
          responseType: "blob"
        }),
        api.get(`/manager-assignments/${selectedAssignment._id}/markscheme-file`, {
          responseType: "blob"
        })
      ]);

      const studentFile = new File([studentPdfRes.data], `${student.name || "student"}.pdf`, { type: "application/pdf" });
      const msFile      = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });

      const fd = new FormData();
      fd.append("studentPdf",    studentFile);
      fd.append("markSchemePdf", msFile);
      fd.append("markingMode",   mode);
      if (guidanceText?.trim())        fd.append("guidance",   guidanceText.trim());
      if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);

      const res = await api.post("/marking/mark", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      setResultModal({ student, result: res.data, studentFile }); 
      setEditingQuestions(res.data.questions.map(q => ({ ...q })));
    } catch (err) {
      toast.error(err.response?.data?.message || "Marking failed");
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runBulkMark = async (guidanceText, mode = "normal") => {
    const eligible = students.filter(s => s.submissionId);
    if (!eligible.length) return toast.warn("No students with submissions");

    setBulkMarking(true);
    const progress = {};
    eligible.forEach(s => { progress[s.submissionId] = "pending"; });
    setBulkProgress({ ...progress });

    for (const student of eligible) {
      setBulkProgress(p => ({ ...p, [student.submissionId]: "marking" }));
      try {
        const [studentPdfRes, msPdfRes] = await Promise.all([
          api.get("/submission-files/pdf", {
            params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
            responseType: "blob"
          }),
          api.get(`/manager-assignments/${selectedAssignment._id}/markscheme-file`, {
            responseType: "blob"
          })
        ]);

        const studentFile = new File([studentPdfRes.data], `${student.name || "student"}.pdf`, { type: "application/pdf" });
        const msFile      = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });

        const fd = new FormData();
        fd.append("studentPdf",    studentFile);
        fd.append("markSchemePdf", msFile);
        fd.append("markingMode",   mode);
        if (guidanceText?.trim())        fd.append("guidance",   guidanceText.trim());
        if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);

        const res = await api.post("/marking/mark", fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600000
        });

        setBulkProgress(p => ({ ...p, [student.submissionId]: { status: "done", result: res.data, studentFile } }));
      } catch {
        setBulkProgress(p => ({ ...p, [student.submissionId]: "error" }));
      }
    }
    setBulkMarking(false);
    toast.success("Bulk marking complete");
  };

  const handleGuidanceConfirm = () => {
    if (!guidanceModal) return;
    if (markingModeModal === "criteria" && !guidance.trim()) {
      return toast.warn("Criteria marking requires guidance to be provided");
    }
    const g    = guidance;
    const mode = markingModeModal;
    if (guidanceModal.bulk) {
      setGuidanceModal(null);
      runBulkMark(g, mode);
    } else {
      setGuidanceModal(null);
      runMarkStudent(guidanceModal.student, g, mode);
    }
  };

  // ── DOWNLOAD GRADED PDF ──────────────────────────────────────
  const downloadGradedPdf = async () => {
    if (!resultModal) return;
    setDownloading(true);
    try {
      const totalMarks = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      const pdfBytes = await annotatePdf({
        studentFile:   resultModal.studentFile,
        questions:     editingQuestions,
        totalMarks,
        maxTotalMarks: effectiveMaxTotal,
        summary:       resultModal.result.summary || ""
      });
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `${resultModal.student.name || "student"}_graded.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    } catch (err) {
      toast.error(err.message || "Failed");
    } finally { setDownloading(false); }
  };

  // ── RETURN TO STUDENT ────────────────────────────────────────
  const returnToStudent = async () => {
    if (!resultModal) return;
    setReturning(true);
    try {
      const totalMarks    = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      const maxTotalMarks = effectiveMaxTotal;
      const pdfBytes = await annotatePdf({
        studentFile: resultModal.studentFile,
        questions:   editingQuestions,
        totalMarks, maxTotalMarks,
        summary:     resultModal.result.summary || ""
      });
      const fd = new FormData();
      fd.append("annotatedPdf",  new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId",  selectedAssignment._id);
      fd.append("submissionId",  resultModal.student.submissionId);
      fd.append("totalMarks",    totalMarks);
      fd.append("maxTotalMarks", maxTotalMarks);
      fd.append("studentName",   resultModal.student.name || "Student");
      await api.post("/submission-files/return-marked", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });
      toast.success("Marked paper returned to student");
      setResultModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to return paper");
    } finally { setReturning(false); }
  };

  const getScoreColor = (awarded, max) => {
    if (!max) return "#399cf2";
    const pct = awarded / max;
    if (pct >= 0.75) return "#22c55e";
    if (pct >= 0.5)  return "#f59e0b";
    return "#ef4444";
  };

  const openPdf = (student) => {
    api.get("/submission-files/pdf", {
      params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
      responseType: "blob"
    }).then(res => {
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
    }).catch(() => toast.error("Failed to load PDF"));
  };

  const downloadPdf = (student) => {
    api.get("/submission-files/pdf", {
      params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
      responseType: "blob"
    }).then(res => {
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `${student.name || "submission"}.pdf`;
      a.click();
    }).catch(() => toast.error("Failed to download PDF"));
  };

  const filteredClassrooms  = classrooms.filter(c =>
    `${c.name} ${c.section || ""}`.toLowerCase().includes(classroomSearch.toLowerCase())
  );
  const filteredAssignments = assignments.filter(a =>
    a.title.toLowerCase().includes(assignmentSearch.toLowerCase())
  );

  const statusBadge = (student) => {
    if (student.state === "TURNED_IN" || student.state === "RETURNED") {
      if (student.isLate)   return <span className="ma-badge ma-badge--orange">Late</span>;
      if (student.isOnTime) return <span className="ma-badge ma-badge--green">On Time</span>;
      return <span className="ma-badge ma-badge--green">Submitted</span>;
    }
    if (student.state === "NEW" || student.state === "CREATED")
      return <span className="ma-badge ma-badge--red">Not Submitted</span>;
    return <span className="ma-badge ma-badge--gray">{student.state}</span>;
  };

  if (!user) return null;

  return (
    <div className="ma-root">
      <ManagerSidebar />

      <main className="ma-main">
        <header className="ma-topbar">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">Submission Viewer</h1>
            <span className="ma-topbar-sub">
              {selectedClassroom
                ? selectedAssignment
                  ? `${selectedClassroom.name} — ${selectedAssignment.title}`
                  : `Select assignment from ${selectedClassroom.name}`
                : `Welcome back, ${user.name}`}
            </span>
          </div>
        </header>

        <div className="ma-content">
          <div className="ma-layout">

            {/* ── CLASSROOMS ── */}
            <div className="ma-column">
              <p className="ma-section-label">Classrooms</p>
              <input className="ma-search-input" placeholder="Search classrooms..." value={classroomSearch} onChange={e => setClassroomSearch(e.target.value)} />
              <div className="ma-scroll-list">
                {filteredClassrooms.map(c => (
                  <div key={c._id} className={`ma-classroom-card ${selectedClassroom?._id === c._id ? "ma-classroom-card--active" : ""}`} onClick={() => selectClassroom(c)}>
                    <div className="ma-classroom-icon"><FiUsers size={15} /></div>
                    <div className="ma-classroom-info">
                      <span className="ma-classroom-name">{c.name}</span>
                      {c.section && <span className="ma-classroom-section">{c.section}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── ASSIGNMENTS ── */}
            <div className="ma-column">
              <p className="ma-section-label">Assignments</p>
              <input className="ma-search-input" placeholder="Search assignments..." value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)} disabled={!selectedClassroom} />
              <div className="ma-scroll-list">
                {!selectedClassroom ? (
                  <p className="ma-empty-msg">Select classroom first</p>
                ) : loadingAssignments ? (
                  <p className="ma-loading-msg">Loading...</p>
                ) : filteredAssignments.map(a => (
                  <div key={a._id} className={`ma-assignment-card ${selectedAssignment?._id === a._id ? "ma-assignment-card--active" : ""}`} onClick={() => selectAssignment(a)}>
                    <div className="ma-assignment-icon"><FiClipboard size={14} /></div>
                    <div className="ma-assignment-info">
                      <span className="ma-assignment-title">{a.title}</span>
                      {a.dueDate && <span className="ma-assignment-due"><FiCalendar size={10} />{new Date(a.dueDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── STUDENTS ── */}
            <div className="ma-right-panel">
              {!selectedAssignment ? (
                <div className="ma-empty-state">
                  <FiClipboard size={40} />
                  <p>Select assignment to view students</p>
                </div>
              ) : (
                <div className="ma-panel">

                  {/* Mark scheme bar */}
                  <div className="msv-ms-bar">
                    <div className="msv-ms-info">
                      <div className="msv-ms-title">📋 Mark Scheme</div>
                      <div className={`msv-ms-status ${msInfo ? "msv-ms-status--ok" : ""}`}>
                        {msInfo ? "✅ Uploaded — ready for AI marking" : "No mark scheme uploaded yet"}
                      </div>
                    </div>
                    <input ref={msInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => handleMsUpload(e.target.files[0])} />
                    <button className="ma-send-btn" onClick={() => msInputRef.current.click()} disabled={uploadingMs} style={{ fontSize: 12 }}>
                      <FiUploadCloud size={13} />
                      {uploadingMs ? "Uploading…" : msInfo ? "Replace MS" : "Upload MS"}
                    </button>
                    {msInfo && (
                      <button className="msv-btn-ai" onClick={() => openGuidanceModal()} disabled={bulkMarking}>
                        {bulkMarking ? <><span className="pm-spinner" /> Marking all…</> : <><FiCpu size={13} /> Mark All Students</>}
                      </button>
                    )}
                  </div>

                  <div className="ma-panel-header">
                    <div className="ma-panel-title-wrap">
                      <div className="ma-panel-dot" />
                      <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                      <span className="ma-panel-count">{students.length} students</span>
                    </div>
                  </div>

                  {loadingStudents && <p className="ma-loading-msg">Loading students…</p>}
                  {!loadingStudents && students.length === 0 && <p className="ma-empty-msg">No students found.</p>}

                  {!loadingStudents && students.length > 0 && (
                    <div className="ma-table-wrap">
                      <div className="ma-table-scroll">
                        <table className="ma-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Status</th>
                              <th>Submitted At</th>
                              <th>Grade</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {students.map((s, i) => {
                              const bulk     = bulkProgress[s.submissionId];
                              const bulkDone = bulk?.status === "done";
                              return (
                                <tr key={s._id || s.submissionId} className="ma-row" style={{ animationDelay: `${i * 0.025}s` }}>
                                  <td>
                                    <div className="ma-avatar-cell">
                                      <div className="ma-avatar">{(s.name || "?").charAt(0).toUpperCase()}</div>
                                      <span className="ma-cell-name">{s.name || "—"}</span>
                                    </div>
                                  </td>
                                  <td>{statusBadge(s)}</td>
                                  <td><span className="ma-cell-muted">{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}</span></td>
                                  <td>
                                    {s.assignedGrade != null
                                      ? <span className="ma-grade-pill">{s.assignedGrade}</span>
                                      : <span className="ma-cell-empty">—</span>}
                                  </td>
                                  <td>
                                    {s.submissionId ? (
                                      <div className="msv-actions">
                                        <button className="msv-action-btn" title="View PDF" onClick={() => openPdf(s)}><FiEye size={13} /></button>
                                        <button className="msv-action-btn" title="Download PDF" onClick={() => downloadPdf(s)}><FiDownload size={13} /></button>
                                        {msInfo && (
                                          <button
                                            className={`msv-action-btn msv-action-btn--ai ${bulkDone ? "msv-action-btn--done" : bulk === "error" ? "msv-action-btn--error" : ""}`}
                                            title="Mark with AI"
                                            onClick={() => {
                                              if (bulkDone) {
                                                setResultModal({ student: s, result: bulk.result, studentFile: bulk.studentFile });
                                                setEditingQuestions(bulk.result.questions.map(q => ({ ...q })));
                                              } else {
                                                openGuidanceModal(s);
                                              }
                                            }}
                                            disabled={markingStudentId === s.submissionId || bulk === "marking"}
                                          >
                                            {markingStudentId === s.submissionId || bulk === "marking"
                                              ? <span className="pm-spinner" />
                                              : bulkDone        ? "✅ Results"
                                              : bulk === "error" ? "❌ Retry"
                                              : <><FiCpu size={12} /> Mark</>
                                            }
                                          </button>
                                        )}
                                      </div>
                                    ) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── GUIDANCE MODAL ── */}
      {guidanceModal && (
        <div className="msv-overlay" onClick={() => setGuidanceModal(null)}>
          <div className="msv-guidance-modal" onClick={e => e.stopPropagation()}>
            <div className="msv-guidance-header">
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {guidanceModal.bulk ? "🤖 Mark All Students" : `🤖 Mark — ${guidanceModal.student?.name}`}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                  {guidanceModal.bulk
                    ? `Marking ${students.filter(s => s.submissionId).length} students with AI`
                    : "AI will mark against the uploaded mark scheme"}
                </div>
              </div>
              <button className="msv-icon-btn" onClick={() => setGuidanceModal(null)}><FiX size={16} /></button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Mode selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 8 }}>Marking Mode</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { value: "normal",   label: "📋 Normal Marking",  desc: "Marks against the mark scheme" },
                    { value: "criteria", label: "🎯 Criteria Marking", desc: "Marks against custom criteria" }
                  ].map(m => (
                    <div
                      key={m.value}
                      onClick={() => setMarkingModeModal(m.value)}
                      style={{
                        flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                        border: `2px solid ${markingModeModal === m.value ? "#399cf2" : "rgba(255,255,255,0.1)"}`,
                        background: markingModeModal === m.value ? "rgba(57,156,242,0.1)" : "rgba(255,255,255,0.03)",
                        transition: "all 0.18s ease"
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saved prompt dropdown */}
              {savedPrompts.length > 0 && (
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>Load saved prompt</label>
                  <div
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: `1px solid ${promptDropdownOpen ? "rgba(57,156,242,0.5)" : "rgba(255,255,255,0.1)"}`,
                      background: "rgba(255,255,255,0.04)", color: guidance ? "white" : "rgba(255,255,255,0.35)",
                      fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "space-between", userSelect: "none",
                      boxShadow: promptDropdownOpen ? "0 0 0 3px rgba(57,156,242,0.12)" : "none",
                      transition: "all 0.18s ease"
                    }}
                    onClick={e => { e.stopPropagation(); setPromptDropdownOpen(v => !v); }}
                  >
                    <span>{guidance ? (savedPrompts.find(p => p.content === guidance)?.name || "📋 Custom guidance entered") : "📋 Select a saved prompt…"}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", transform: promptDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>▼</span>
                  </div>
                  {promptDropdownOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#060f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, zIndex: 200, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                      {savedPrompts.map((p, i) => (
                        <div
                          key={p._id}
                          onClick={e => { e.stopPropagation(); setGuidance(p.content); setPromptDropdownOpen(false); }}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: i < savedPrompts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", background: guidance === p.content ? "rgba(57,156,242,0.12)" : "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                          onMouseLeave={e => e.currentTarget.style.background = guidance === p.content ? "rgba(57,156,242,0.12)" : "transparent"}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: guidance === p.content ? "#399cf2" : "#e2e8f0", marginBottom: 3 }}>{guidance === p.content && "✓ "}{p.name}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content.slice(0, 80)}{p.content.length > 80 ? "…" : ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Guidance textarea */}
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
                {markingModeModal === "criteria"
                  ? <><span style={{ color: "#e2e8f0" }}>Criteria</span> <span style={{ color: "#ef4444" }}>*</span> — describe how to mark and total marks</>
                  : <>Additional Guidance <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span></>
                }
              </label>
              <textarea
                value={guidance}
                onChange={e => setGuidance(e.target.value)}
                rows={5}
                placeholder={markingModeModal === "criteria"
                  ? "e.g. Mark out of 20. Q1 (5 marks): award for correct identification. Q2 (10 marks): award for explanation..."
                  : "e.g. Be strict with units. Award method marks if working is shown..."
                }
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  className="ma-send-btn"
                  onClick={handleGuidanceConfirm}
                  disabled={markingModeModal === "criteria" && !guidance.trim()}
                  style={{ flex: 1, justifyContent: "center", opacity: markingModeModal === "criteria" && !guidance.trim() ? 0.4 : 1 }}
                >
                  <FiCpu size={14} />
                  {guidanceModal.bulk ? "Start Marking All" : "Start Marking"}
                </button>
                <button className="msv-cancel-btn" onClick={() => setGuidanceModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS MODAL ── */}
      {resultModal && (
        <div className="msv-overlay" onClick={() => setResultModal(null)}>
          <div className="msv-results-modal" onClick={e => e.stopPropagation()}>
            <div className="msv-modal-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  AI Marking Results — {resultModal.student.name}
                  {resultModal.result.markingMode && (
                    <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                      background: resultModal.result.markingMode === "criteria" ? "rgba(139,92,246,0.15)" : "rgba(57,156,242,0.15)",
                      color: resultModal.result.markingMode === "criteria" ? "#a78bfa" : "#399cf2",
                      border: `1px solid ${resultModal.result.markingMode === "criteria" ? "rgba(139,92,246,0.3)" : "rgba(57,156,242,0.3)"}`
                    }}>
                      {resultModal.result.markingMode === "criteria" ? "🎯 Criteria" : "📋 Normal"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                  {editingQuestions.reduce((s, q) => s + q.marksAwarded, 0)} / {effectiveMaxTotal} marks
                  &nbsp;·&nbsp;
                  {effectiveMaxTotal > 0 ? Math.round((editingQuestions.reduce((s, q) => s + q.marksAwarded, 0) / effectiveMaxTotal) * 100) : 0}%
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="ma-send-btn" onClick={downloadGradedPdf} disabled={downloading} style={{ fontSize: 12 }}>
                  <FiDownload size={13} />{downloading ? "Generating…" : "Download PDF"}
                </button>
                <button className="msv-btn-ai" onClick={returnToStudent} disabled={returning}>
                  <FiSend size={13} />{returning ? "Returning…" : "Return to Student"}
                </button>
                <button className="msv-icon-btn" onClick={() => setResultModal(null)}><FiX size={16} /></button>
              </div>
            </div>

            <div className="msv-modal-body">

              {/* Summary */}
              {resultModal.result.summary && (
                <div className="msv-summary-box">
                  <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Summary</div>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>{resultModal.result.summary}</p>
                </div>
              )}

                {/* AI TOKEN USAGE*/}
              {resultModal.result.tokenUsage && (
                <div className="msv-summary-box" style={{ marginTop: 12 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em"
                  }}>
                    AI Token Usage
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#399cf2", fontWeight: 700 }}>Input:</span>{" "}
                      {resultModal.result.tokenUsage.inputTokens}
                    </div>

                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#22c55e", fontWeight: 700 }}>Output:</span>{" "}
                      {resultModal.result.tokenUsage.outputTokens}
                    </div>

                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>Total:</span>{" "}
                      {resultModal.result.tokenUsage.totalTokens}
                    </div>
                  </div>
                </div>
              )}

              {/* Score bar */}
              <div className="msv-score-bar">
                {(() => {
                  const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
                  const max   = effectiveMaxTotal;
                  const pct   = max > 0 ? Math.round((total / max) * 100) : 0;
                  const color = getScoreColor(total, max);
                  return (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Total Score</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{total} / {max} ({pct}%)</span>
                      </div>
                      <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Confirm edits notice */}
              {editingQuestions.some((q, idx) => q.marksAwarded !== resultModal.result.questions[idx]?.marksAwarded) && (
                <div style={{ padding: "10px 16px", marginBottom: 16, borderRadius: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#f59e0b" }}>⚠️ You have edited grades — download or return to apply them</span>
                  <button
                    className="ma-send-btn"
                    style={{ fontSize: 12, padding: "6px 14px", background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}
                    onClick={() => {
                      const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
                      setResultModal(prev => ({ ...prev, result: { ...prev.result, totalMarks: total } }));
                      toast.success(`Grades confirmed — total: ${total}/${effectiveMaxTotal}`);
                    }}
                  >
                    ✅ Confirm Edits
                  </button>
                </div>
              )}

              {/* Questions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {editingQuestions.map((q, idx) => {
                  const color = getScoreColor(q.marksAwarded, q.maxMarks);
                  const pct   = q.maxMarks > 0 ? Math.round((q.marksAwarded / q.maxMarks) * 100) : 0;
                  return (
                    <div key={idx} className="msv-q-card">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>Q{q.questionNumber}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="number" min={0} max={q.maxMarks}
                            value={q.marksAwarded}
                            onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, marksAwarded: Math.min(q.maxMarks, Math.max(0, Number(e.target.value))) } : x))}
                            style={{ width: 52, padding: "4px 8px", borderRadius: 6, border: `1px solid ${color}`, background: `${color}15`, color, fontWeight: 700, fontSize: 14, textAlign: "center", outline: "none" }}
                          />
                          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>/ {q.maxMarks}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 60, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{pct}%</span>
                      </div>

                      {q.checklist && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                          {CHECKLIST_CONFIG.map(({ key, label, passIsGood }) => {
                            const val    = q.checklist[key];
                            const isGood = passIsGood ? val === true : val === false;
                            return (
                              <span key={key} style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, background: isGood ? "rgba(34,197,94,0.1)" : "rgba(255,77,79,0.1)", color: isGood ? "#22c55e" : "#ff4d4f", border: `1px solid ${isGood ? "rgba(34,197,94,0.2)" : "rgba(255,77,79,0.2)"}` }}>
                                {isGood ? "✅" : "❌"} {label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {q.studentAnswer && q.studentAnswer !== "Not attempted" && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>Student: </span>{q.studentAnswer}
                        </div>
                      )}
                      {q.studentAnswer === "Not attempted" && (
                        <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>📭 Not attempted</div>
                      )}

                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Examiner Note</div>
                      <textarea
                        value={q.reason}
                        onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, reason: e.target.value } : x))}
                        rows={3}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.75)", fontSize: 12, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}