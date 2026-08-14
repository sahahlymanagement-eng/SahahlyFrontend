import { useRef, useState } from "react";
import { FiCheckCircle, FiEdit3, FiFileText, FiTrash2, FiUpload } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import { annotatePdf } from "../../utils/annotatePdf";
import { downloadBlob } from "../../utils/downloadBlob";
import { appendMarkingContext, getOutOfScopeNotes } from "../../utils/markingFormData";
import TokenUsageStats from "../../components/TokenUsageStats";
import "./DirectorManualCorrection.css";

const MANUAL_MODELS = [
  { id: "gemini-3-flash-preview", label: "Sahahly 3" },
  { id: "gemini-3.5-flash", label: "Sahahly 3.5" },
];

function scoreColor(awarded, max) {
  const pct = max > 0 ? awarded / max : 0;
  if (pct >= 0.75) return "var(--success)";
  if (pct >= 0.5) return "var(--warning)";
  return "var(--danger)";
}

function asPdfFiles(fileList) {
  return [...(fileList || [])].filter((f) => /\.pdf$/i.test(f.name || ""));
}

export default function DirectorManualCorrection() {
  const studentRef = useRef();
  const schemeRef = useRef();

  const [studentFiles, setStudentFiles] = useState([]);
  const [markSchemeFile, setMarkSchemeFile] = useState(null);
  const [geminiModel, setGeminiModel] = useState(MANUAL_MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [rows, setRows] = useState([]);
  const [downloadingName, setDownloadingName] = useState(null);

  const onStudentFiles = (list) => {
    const pdfs = asPdfFiles(list);
    if (list?.length && !pdfs.length) {
      toast.warn("Please upload PDF files only");
      return;
    }
    setStudentFiles(pdfs);
    setRows([]);
  };

  const removeStudentFile = (index) => {
    setStudentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const markOne = async (studentFile, markSchemeCacheName) => {
    const formData = new FormData();
    formData.append("studentPdf", studentFile);
    if (markSchemeCacheName) {
      formData.append("markSchemeCacheName", markSchemeCacheName);
    } else {
      formData.append("markSchemePdf", markSchemeFile);
    }
    formData.append("markingMode", "normal");
    formData.append("geminiModel", geminiModel);
    appendMarkingContext(formData);

    const res = await api.post("/marking/mark", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000,
    });
    return res.data;
  };

  const cacheMarkScheme = async () => {
    const formData = new FormData();
    formData.append("markSchemePdf", markSchemeFile);
    formData.append("markingMode", "normal");
    formData.append("geminiModel", geminiModel);
    appendMarkingContext(formData);
    const res = await api.post("/marking/mark-scheme-cache", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    return res.data?.cacheName || null;
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

    setLoading(true);
    setRows([]);
    setProgress({ current: 0, total: studentFiles.length });

    let cacheName = null;
    if (studentFiles.length > 1) {
      try {
        cacheName = await cacheMarkScheme();
      } catch (err) {
        console.warn("Mark scheme cache skipped:", err.message);
      }
    }

    const nextRows = [];
    try {
      for (let i = 0; i < studentFiles.length; i += 1) {
        const file = studentFiles[i];
        setProgress({ current: i + 1, total: studentFiles.length, name: file.name });
        try {
          const result = await markOne(file, cacheName);
          nextRows.push({ file, result, error: null });
        } catch (err) {
          nextRows.push({
            file,
            result: null,
            error: err.response?.data?.message || err.message || "Marking failed",
          });
        }
        setRows([...nextRows]);
      }

      const ok = nextRows.filter((r) => r.result).length;
      const failed = nextRows.length - ok;
      if (failed && ok) toast.warn(`Marked ${ok} paper(s); ${failed} failed`);
      else if (failed) toast.error("Marking failed");
      else toast.success(ok === 1 ? "Paper marked" : `Marked ${ok} papers`);
    } finally {
      if (cacheName) {
        api.delete("/marking/mark-scheme-cache", { data: { cacheName } }).catch(() => {});
      }
      setLoading(false);
      setProgress(null);
    }
  };

  const downloadGraded = async (row) => {
    if (!row?.result || !row?.file) return;
    setDownloadingName(row.file.name);
    try {
      const pdfBytes = await annotatePdf({
        studentFile: row.file,
        questions: row.result.questions,
        totalMarks: row.result.totalMarks,
        maxTotalMarks: row.result.maxTotalMarks,
        summary: row.result.summary || "",
        outOfScopeNotes: getOutOfScopeNotes(row.result),
      });
      downloadBlob(
        new Blob([pdfBytes], { type: "application/pdf" }),
        row.file.name.replace(/\.pdf$/i, "") + "_graded.pdf"
      );
    } catch (err) {
      toast.error(err.message || "Failed to generate marked paper");
    } finally {
      setDownloadingName(null);
    }
  };

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
            built-in grading prompt used in classroom marking.
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

      <section className="dmc-uploads">
        <div
          className={`dmc-drop${markSchemeFile ? " dmc-drop--done" : ""}`}
          onClick={() => schemeRef.current?.click()}
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
          onClick={() => studentRef.current?.click()}
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
          ? `Marking ${progress?.current || 0} of ${progress?.total || studentFiles.length}…`
          : studentFiles.length > 1
            ? `Mark ${studentFiles.length} papers`
            : "Mark paper"}
      </button>

      {loading && progress?.name && (
        <p className="dmc-progress">{progress.name}</p>
      )}

      {rows.map((row, index) => {
        const result = row.result;
        const max = result?.maxTotalMarks || 0;
        const awarded = result?.totalMarks || 0;
        const pct = max > 0 ? Math.round((awarded / max) * 100) : 0;
        const color = scoreColor(awarded, max);

        return (
          <article key={`${row.file.name}-${index}`} className="dmc-result">
            <div className="dmc-result-top">
              <h3>{row.file.name}</h3>
              {result && (
                <button
                  type="button"
                  className="dmc-download"
                  onClick={() => downloadGraded(row)}
                  disabled={downloadingName === row.file.name}
                >
                  {downloadingName === row.file.name ? "Generating…" : "Download marked PDF"}
                </button>
              )}
            </div>

            {row.error && <p className="dmc-error">{row.error}</p>}

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
