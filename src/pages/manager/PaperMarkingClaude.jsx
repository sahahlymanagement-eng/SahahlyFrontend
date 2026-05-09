import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { annotatePdf } from "../../utils/annotatePdf";
import "./PaperMarking.css";

export default function PaperMarkingClaude() {
  const navigate = useNavigate();
  const studentRef    = useRef();
  const markSchemeRef = useRef();

  const [studentFile,    setStudentFile]    = useState(null);
  const [markSchemeFile, setMarkSchemeFile] = useState(null);
  const [totalGrade,     setTotalGrade]     = useState("");
  const [guidance,       setGuidance]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);
  const [downloading, setDownloading] = useState(false);

  const handleMark = async () => {
    if (!studentFile)    { toast.warn("Please upload the student answer PDF"); return; }
    if (!markSchemeFile) { toast.warn("Please upload the mark scheme PDF");    return; }

    const maxSize = 10 * 1024 * 1024;
    if (studentFile.size > maxSize) {
      toast.error("Student PDF is too large. Please compress it to under 10MB.");
      return;
    }
    if (markSchemeFile.size > maxSize) {
      toast.error("Mark scheme PDF is too large. Please compress it to under 10MB.");
      return;
    }

    const formData = new FormData();
    formData.append("studentPdf",    studentFile);
    formData.append("markSchemePdf", markSchemeFile);
    formData.append("totalGrade",    totalGrade);
    formData.append("guidance",      guidance);

    setLoading(true);
    setResult(null);

    try {
      const res = await api.post("/markingClaude/mark", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });
      setResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Marking failed");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (awarded, max) => {
    const pct = awarded / max;
    if (pct >= 0.75) return "#22c55e";
    if (pct >= 0.5)  return "#f59e0b";
    return "#ef4444";
  };

  const totalPct = result
    ? Math.round((result.totalMarks / result.maxTotalMarks) * 100)
    : 0;

  // Checklist config: key -> { label, passIsGood }
  // passIsGood = true means "true" is a positive outcome (green tick)
  // passIsGood = false means "true" is a negative outcome (red flag)
  const CHECKLIST_CONFIG = [
    { key: "scanningClarity",            label: "Scanning Clarity",          passIsGood: true  },
    { key: "handwritingClarity",         label: "Handwriting Clarity",        passIsGood: true  },
    { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding",  passIsGood: true  },
    { key: "studentAnswerUnderstanding", label: "Student Answer Understood",  passIsGood: true  },
    { key: "answerIsBlank",              label: "Answer is Blank",            passIsGood: false },
  ];

  const hasChecklistIssues = (checklist) => {
    if (!checklist) return false;
    return CHECKLIST_CONFIG.some(({ key, passIsGood }) => {
      const val = checklist[key];
      return passIsGood ? val === false : val === true;
    });
  };

  const downloadGradedPDF = async () => {
    if (!result || !studentFile) return;
    setDownloading(true);
    try {
      const pdfBytes = await annotatePdf({
        studentFile,
        questions:     result.questions,
        totalMarks:    result.totalMarks,
        maxTotalMarks: result.maxTotalMarks,
        summary:       result.summary || ""
      });
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      const a   = document.createElement("a");
      a.href     = url;
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

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h2>AI Paper Marking</h2>
          <div className="pm-header-right">
            <span className="pm-powered-by">Powered by Claude</span>
            <button className="pm-back" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </header>

        {/* UPLOAD ROW */}
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
            <p>Claude AI</p>
            <button
              className="pm-mark-btn"
              onClick={handleMark}
              disabled={loading || !studentFile || !markSchemeFile}
            >
              {loading ? <><span className="pm-spinner" /> Marking…</> : "Mark Paper"}
            </button>
          </div>
        </div>

        {/* INPUTS */}
        <div className="pm-inputs-row">
          <div className="pm-input-group">
            <label className="pm-input-label">Maximum Exam Grade</label>
            <input
              className="pm-input"
              type="number"
              placeholder="e.g. 80"
              value={totalGrade}
              onChange={e => setTotalGrade(e.target.value)}
            />
          </div>
          <div className="pm-input-group pm-input-group--wide">
            <label className="pm-input-label">Guidance for AI (optional)</label>
            <textarea
              className="pm-input pm-textarea"
              placeholder="e.g. Be strict. Award full marks only if units are included. Accept alternative spellings."
              value={guidance}
              onChange={e => setGuidance(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        {/* LOADING */}
        {loading && (
          <div className="pm-loading-panel">
            <div className="pm-loading-spinner" />
            <p>Claude is analysing the paper against the mark scheme…</p>
            <span>This may take up to 60 seconds for long papers</span>
          </div>
        )}

        {/* RESULTS */}
        {result && !loading && (
          <div className="pm-results">

            {/* DOWNLOAD BUTTON */}
            <div className="pm-download-row">
              <button className="pm-download-btn" onClick={downloadGradedPDF} disabled={downloading}>
                {downloading ? <><span className="pm-spinner" /> Generating…</> : "⬇ Download Marked Paper"}
              </button>
            </div>

            {/* SCORE HEADER */}
            <div className="pm-score-header">
              <div
                className="pm-score-circle"
                style={{
                  "--pct": totalPct,
                  "--color": getScoreColor(result.totalMarks, result.maxTotalMarks)
                }}
              >
                <span className="pm-score-num">{result.totalMarks}</span>
                <span className="pm-score-max">/ {result.maxTotalMarks}</span>
              </div>

              <div className="pm-score-info">
                <h3>{totalPct}% — {
                  totalPct >= 75 ? "Strong Performance" :
                  totalPct >= 50 ? "Satisfactory Performance" :
                  "Needs Improvement"
                }</h3>
                <p className="pm-summary">{result.summary}</p>
              </div>
            </div>

            {/* QUESTION BREAKDOWN */}
            <h3 className="pm-breakdown-title">Question Breakdown</h3>
            <div className="pm-questions">
              {result.questions.map((q, i) => {
                const color        = getScoreColor(q.marksAwarded, q.maxMarks);
                const pct          = Math.round((q.marksAwarded / q.maxMarks) * 100);
                const notAttempted = q.studentAnswer === "Not attempted";
                const hasIssues    = hasChecklistIssues(q.checklist);

                return (
                  <div
                    key={i}
                    className={`pm-question-card ${notAttempted ? "pm-question-card--missing" : ""}`}
                  >
                    <div className="pm-q-header">
                      <span className="pm-q-number">Q{q.questionNumber}</span>
                      <div className="pm-q-right">
                        <div
                          className="pm-q-score"
                          style={{ color, borderColor: color, background: `${color}15` }}
                        >
                          {q.marksAwarded} / {q.maxMarks}
                        </div>
                        {hasIssues && (
                          <div className="pm-q-issue-badge" title="Some checklist items flagged">
                            ⚠️ Review
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pm-q-bar-wrap">
                      <div className="pm-q-bar">
                        <div
                          className="pm-q-bar-fill"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <span className="pm-q-pct">{pct}%</span>
                    </div>

                    {/* CHECKLIST */}
                    {q.checklist && (
                      <div className="pm-checklist">
                        {CHECKLIST_CONFIG.map(({ key, label, passIsGood }) => {
                          const val    = q.checklist[key];
                          const isGood = passIsGood ? val === true : val === false;
                          return (
                            <div
                              key={key}
                              className={`pm-checklist-item ${isGood ? "pm-checklist-item--pass" : "pm-checklist-item--fail"}`}
                            >
                              <span className="pm-checklist-icon">{isGood ? "✅" : "❌"}</span>
                              <span className="pm-checklist-label">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {notAttempted ? (
                      <div className="pm-q-missing">📭 Question not attempted / page missing</div>
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
        onChange={e => onChange(e.target.files[0] || null)}
      />
      <div className="pm-upload-icon">{file ? "✅" : icon}</div>
      <p className="pm-upload-label">{label}</p>
      {file
        ? <span className="pm-upload-filename">{file.name}</span>
        : <span className="pm-upload-hint">Click to upload PDF</span>
      }
    </div>
  );
}