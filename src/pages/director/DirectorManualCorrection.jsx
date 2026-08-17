import { useEffect, useRef, useState } from "react";
import { FiCheckCircle, FiEdit3, FiFileText, FiTrash2, FiUpload } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import { annotatePdf } from "../../utils/annotatePdf";
import { downloadBlob } from "../../utils/downloadBlob";
import { getOutOfScopeNotes, guidanceForForm } from "../../utils/markingFormData";
import TokenUsageStats from "../../components/TokenUsageStats";
import "./DirectorManualCorrection.css";

const MANUAL_MODELS = [
  { id: "gemini-3-flash-preview", label: "Sahahly 3" },
  { id: "gemini-3.5-flash", label: "Sahahly 3.5" },
];

const JOB_STORAGE_KEY = "sahahly.manualCorrection.jobId";
const TOAST_STORAGE_KEY = "sahahly.manualCorrection.toastedJobId";

let retainedStudentFiles = [];

function retainStudentFiles(files) {
  retainedStudentFiles = Array.isArray(files) ? [...files] : [];
}

function fileForName(name) {
  return retainedStudentFiles.find((f) => f.name === name) || null;
}

function scoreColor(awarded, max) {
  const pct = max > 0 ? awarded / max : 0;
  if (pct >= 0.75) return "var(--success)";
  if (pct >= 0.5) return "var(--warning)";
  return "var(--danger)";
}

function asPdfFiles(fileList) {
  return [...(fileList || [])].filter((f) => /\.pdf$/i.test(f.name || ""));
}

function jobIsRunning(job) {
  return job?.status === "running" || job?.status === "queued";
}

function toastJobOutcome(job) {
  if (!job?.id || jobIsRunning(job)) return;
  if (sessionStorage.getItem(TOAST_STORAGE_KEY) === job.id) return;
  sessionStorage.setItem(TOAST_STORAGE_KEY, job.id);
  const papers = job.papers || [];
  const ok = papers.filter((p) => p.status === "done" && p.result).length;
  const failed = papers.length - ok;
  if (failed && ok) toast.warn(`Marked ${ok} paper(s); ${failed} failed`);
  else if (failed) toast.error(papers[0]?.error || "Marking failed");
  else if (ok) toast.success(ok === 1 ? "Paper marked" : `Marked ${ok} papers`);
}

export default function DirectorManualCorrection() {
  const studentRef = useRef();
  const schemeRef = useRef();

  const [studentFiles, setStudentFiles] = useState([]);
  const [markSchemeFile, setMarkSchemeFile] = useState(null);
  const [geminiModel, setGeminiModel] = useState(MANUAL_MODELS[0].id);
  const [guidance, setGuidance] = useState("");
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [downloadingName, setDownloadingName] = useState(null);

  const loading = starting || jobIsRunning(job);

  const applyJob = (next) => {
    if (!next) return;
    setJob(next);
    if (next.id) sessionStorage.setItem(JOB_STORAGE_KEY, next.id);
    toastJobOutcome(next);
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const { data } = await api.get("/marking/manual-job/active", { timeout: 15000 });
        if (cancelled) return;
        if (data?.job) {
          applyJob(data.job);
          return;
        }
      } catch {
        // Fall through to the stored id.
      }
      const stored = sessionStorage.getItem(JOB_STORAGE_KEY);
      if (!stored || cancelled) return;
      try {
        const { data } = await api.get(`/marking/manual-job/${stored}`, { timeout: 30000 });
        if (!cancelled && data) applyJob(data);
      } catch (err) {
        if (err.response?.status === 404) sessionStorage.removeItem(JOB_STORAGE_KEY);
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job?.id || !jobIsRunning(job)) return undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const { data } = await api.get(`/marking/manual-job/${job.id}`, { timeout: 30000 });
        if (cancelled || !data) return;
        applyJob(data);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) {
          sessionStorage.removeItem(JOB_STORAGE_KEY);
          setJob(null);
        }
      }
    };

    const timer = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);

  const onStudentFiles = (list) => {
    const pdfs = asPdfFiles(list);
    if (list?.length && !pdfs.length) {
      toast.warn("Please upload PDF files only");
      return;
    }
    setStudentFiles(pdfs);
    retainStudentFiles(pdfs);
  };

  const removeStudentFile = (index) => {
    setStudentFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      retainStudentFiles(next);
      return next;
    });
  };

  const handleMark = async () => {
    if (!studentFiles.length) {
      toast.warn("Upload one or more student PDFs");
      return;
    }
    if (!markSchemeFile) {
      toast.warn("Upload a mark scheme PDF");
      return;
    }

    retainStudentFiles(studentFiles);
    setStarting(true);
    try {
      const formData = new FormData();
      studentFiles.forEach((file) => formData.append("studentPdfs", file));
      formData.append("markSchemePdf", markSchemeFile);
      formData.append("markingMode", "normal");
      formData.append("geminiModel", geminiModel);
      const extra = guidanceForForm(guidance);
      if (extra) formData.append("guidance", extra);

      const res = await api.post("/marking/manual-job", formData, {
        timeout: 120000,
      });
      applyJob(res.data);
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.job) {
        applyJob(err.response.data.job);
        toast.warn(err.response.data.message || "A job is already running");
      } else {
        toast.error(err.response?.data?.message || err.message || "Marking failed");
      }
    } finally {
      setStarting(false);
    }
  };

  const downloadGraded = async (row) => {
    const file = row.file;
    if (!row?.result || !file) {
      toast.error("Re-upload this PDF to download the marked copy (the file is only kept in this browser session).");
      return;
    }
    setDownloadingName(file.name);
    try {
      const pdfBytes = await annotatePdf({
        studentFile: file,
        questions: row.result.questions,
        totalMarks: row.result.totalMarks,
        maxTotalMarks: row.result.maxTotalMarks,
        summary: row.result.summary || "",
        outOfScopeNotes: getOutOfScopeNotes(row.result),
      });
      downloadBlob(
        new Blob([pdfBytes], { type: "application/pdf" }),
        file.name.replace(/\.pdf$/i, "") + "_graded.pdf"
      );
    } catch (err) {
      toast.error(err.message || "Failed to generate marked paper");
    } finally {
      setDownloadingName(null);
    }
  };

  const papers = job?.papers || [];
  const progress = job?.progress;

  return (
    <div className="dmc-page">
      <header className="dmc-header">
        <div className="dmc-header-icon">
          <FiEdit3 size={22} />
        </div>
        <div>
          <h1>Manual Correction</h1>
          <p>
            Upload student PDFs and a mark scheme. Papers are marked with the same
            built-in grading prompt used in classroom marking, submitted as a
            Sahahly Batch job (same engine as Mark All). You can leave this tab.
          </p>
        </div>
      </header>

      <section className="dmc-card">
        <h2>Model</h2>
        <div className="dmc-model-row">
          {MANUAL_MODELS.map((model) => {
            const selected = geminiModel === model.id;
            return (
              <button
                key={model.id}
                type="button"
                className={`dmc-model-btn${selected ? " dmc-model-btn--on" : ""}`}
                onClick={() => setGeminiModel(model.id)}
                disabled={loading}
              >
                {model.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="dmc-card">
        <h2>Prompt addition</h2>
        <p className="dmc-hint">
          Optional extra instructions added on top of the built-in grading prompt
          (for example: award method marks, ignore cover pages, use these aliases).
        </p>
        <textarea
          className="dmc-guidance"
          rows={5}
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          disabled={loading}
          placeholder="Add extra marking instructions…"
        />
      </section>

      <section className="dmc-uploads">
        <div
          className={`dmc-drop${markSchemeFile ? " dmc-drop--done" : ""}`}
          onClick={() => !loading && schemeRef.current?.click()}
        >
          <input
            ref={schemeRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setMarkSchemeFile(file);
              e.target.value = "";
            }}
          />
          <FiFileText size={22} />
          <strong>Mark scheme</strong>
          {markSchemeFile ? (
            <span>{markSchemeFile.name}</span>
          ) : (
            <span>Click to upload one PDF</span>
          )}
        </div>

        <div
          className={`dmc-drop${studentFiles.length ? " dmc-drop--done" : ""}`}
          onClick={() => !loading && studentRef.current?.click()}
        >
          <input
            ref={studentRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              onStudentFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <FiUpload size={22} />
          <strong>Student papers</strong>
          {studentFiles.length ? (
            <span>
              {studentFiles.length} PDF{studentFiles.length === 1 ? "" : "s"} selected
            </span>
          ) : (
            <span>Click to upload one or more PDFs</span>
          )}
        </div>
      </section>

      {studentFiles.length > 0 && (
        <ul className="dmc-file-list">
          {studentFiles.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <FiCheckCircle size={14} />
              <span>{file.name}</span>
              <button
                type="button"
                className="dmc-icon-btn"
                onClick={() => removeStudentFile(index)}
                disabled={loading}
                aria-label={`Remove ${file.name}`}
              >
                <FiTrash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="dmc-run"
        onClick={handleMark}
        disabled={loading || !studentFiles.length || !markSchemeFile}
      >
        {loading
          ? progress?.phase === "submitted"
            ? "Waiting on Sahahly Batch…"
            : progress?.phase === "uploading"
              ? `Uploading ${progress?.current || 0} of ${progress?.total || studentFiles.length}…`
              : `Marking ${progress?.current || 0} of ${progress?.total || studentFiles.length}…`
          : studentFiles.length > 1
            ? `Mark ${studentFiles.length} papers`
            : "Mark paper"}
      </button>

      {loading && (
        <p className="dmc-progress">
          {progress?.name || "Starting Sahahly Batch…"} You can leave this tab.
        </p>
      )}

      {papers.map((paper, index) => {
        const result = paper.result;
        const file = fileForName(paper.name);
        const max = result?.maxTotalMarks || 0;
        const awarded = result?.totalMarks || 0;
        const pct = max > 0 ? Math.round((awarded / max) * 100) : 0;
        const color = scoreColor(awarded, max);

        return (
          <article key={`${paper.name}-${index}`} className="dmc-result">
            <div className="dmc-result-top">
              <h3>{paper.name}</h3>
              {result && (
                <button
                  type="button"
                  className="dmc-download"
                  onClick={() => downloadGraded({ file, result })}
                  disabled={downloadingName === paper.name}
                >
                  {downloadingName === paper.name ? "Generating…" : "Download marked PDF"}
                </button>
              )}
            </div>

            {paper.status === "running" && (
              <p className="dmc-progress">In the Sahahly Batch queue…</p>
            )}
            {paper.error && <p className="dmc-error">{paper.error}</p>}

            {result && (
              <>
                <div className="dmc-score">
                  <strong style={{ color }}>
                    {awarded} / {max}
                  </strong>
                  <span>{pct}%</span>
                </div>
                {result.summary && <p className="dmc-summary">{result.summary}</p>}
                <TokenUsageStats result={result} compact title="Tokens" />
                {Array.isArray(result.questions) && result.questions.length > 0 && (
                  <div className="dmc-questions">
                    {result.questions.map((q, qi) => (
                      <div key={qi} className="dmc-q">
                        <span>Q{q.questionNumber}</span>
                        <span>
                          {q.marksAwarded} / {q.maxMarks}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
