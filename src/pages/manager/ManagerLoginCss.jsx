import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { confirmToast, promptToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import {
  FiDownload, FiEye, FiCpu, FiX, FiSend, FiCheck, FiRefreshCw,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";
import {
  assertPdfBlob,
  sumQuestionMarks,
  gradeScorePercent,
  getApiErrorMessage,
  getMarkingResultSummary,
  guidanceForForm,
  normalizeGuidance,
  getOutOfScopeNotes,
  resolveTotalMarksFromResult,
  resolveDisplayMaxTotal,
  buildPriorityMarkingResult,
} from "../../utils/markingFormData";
import { parseGeminiModelsResponse, pickValidGeminiModel } from "../../utils/markingCost";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import TokenUsageStats from "../../components/TokenUsageStats";
import { base64ToFile } from "../../utils/base64ToFile";
import { useExternalAnnotatedPreview } from "../../hooks/useExternalAnnotatedPreview";
import "./ManagerSubmissionViewer.css";

const PER_PAGE = 10;

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",          passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

const getScoreColor = (awarded, max) => {
  const pct = max > 0 ? awarded / max : 0;
  if (pct >= 0.75) return "#22c55e";
  if (pct >= 0.5) return "#f59e0b";
  return "#ef4444";
};

export default function ManagerLoginCss() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  // ── LoginCSS submissions list ──
  const [submissions, setSubmissions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");

  // ── Guidance modal / marking config ──
  const [guidanceModal, setGuidanceModal] = useState(null);
  const [guidance, setGuidance] = useState("");
  const [markingModeModal, setMarkingModeModal] = useState("normal");
  const [savedPrompts, setSavedPrompts] = useState([]);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-3.1-flash-lite");

  // ── Marking progress / results ──
  const [markingStudentId, setMarkingStudentId] = useState(null);
  const [singleProgress, setSingleProgress] = useState({});
  const [studentErrors, setStudentErrors] = useState({});
  const [results, setResults] = useState({}); // submissionId -> { result, originalAiResult, studentFile }

  // Bulk ("Mark All") + priority bulk
  const [bulkMarking, setBulkMarking] = useState(false);
  const [priorityBulkRunning, setPriorityBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({});
  const bulkStopRef = useRef(false);
  const priorityStopRef = useRef(false);

  const [resultModal, setResultModal] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);
  const [editingTotal, setEditingTotal] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [returning, setReturning] = useState(false);

  const [errorViewer, setErrorViewer] = useState({ open: false, title: "", message: null });

  // Cache of fetched PDFs per submission (avoids re-downloading base64 from LoginCSS).
  const pdfCacheRef = useRef({});

  const resolvePdfSummary = (submissionId, result) => getMarkingResultSummary(result, {});

  const effectiveMaxTotal = resolveDisplayMaxTotal({
    result: resultModal?.result,
    editingMaxTotal,
  });

  // Download a pre-signed URL directly in the browser into a File.
  const urlToFile = async (url, name) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to download ${name} (HTTP ${resp.status})`);
    const blob = await resp.blob();
    return new File([blob], name, { type: "application/pdf" });
  };

  // Recursively scan a JSON object for the submission + mark-scheme URLs.
  const scanForPdfUrls = (root) => {
    let submissionUrl = null;
    let markSchemeUrl = null;
    const isUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);
    const spare = [];
    const walk = (node, keyHint = "") => {
      if (node == null) return;
      if (typeof node === "string") {
        if (!isUrl(node)) return;
        const k = keyHint.toLowerCase();
        if (/(mark.?scheme|scheme|markscheme|\bms\b)/.test(k)) {
          if (!markSchemeUrl) markSchemeUrl = node;
        } else if (/(submission|answer|student|paper|script|file)/.test(k)) {
          if (!submissionUrl) submissionUrl = node;
        } else {
          spare.push(node);
        }
        return;
      }
      if (Array.isArray(node)) return node.forEach((v) => walk(v, keyHint));
      if (typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, k);
      }
    };
    walk(root);
    if (!submissionUrl && spare.length) submissionUrl = spare.shift();
    if (!markSchemeUrl && spare.length) markSchemeUrl = spare.shift();
    return { submissionUrl, markSchemeUrl };
  };

  // Fallback when /pdfs is blocked (e.g. "already marked"): use fresh pre-signed
  // URLs from GET /submissions/:id and download the PDFs directly in the browser.
  const fetchPdfsViaSubmission = async (submissionId) => {
    const res = await api.get(`/external-grading/submissions/${submissionId}`);
    const body = res.data?.data || res.data || {};
    let submissionUrl =
      body.submission?.url || body.submission?.presignedUrl || body.submissionUrl ||
      body.submission_url || body.answerUrl || body.fileUrl || body.pdfUrl || null;
    let markSchemeUrl =
      body.markScheme?.url || body.markScheme?.presignedUrl || body.markSchemeUrl ||
      body.mark_scheme_url || body.markschemeUrl || null;
    if (!submissionUrl || !markSchemeUrl) {
      const scanned = scanForPdfUrls(body);
      submissionUrl = submissionUrl || scanned.submissionUrl;
      markSchemeUrl = markSchemeUrl || scanned.markSchemeUrl;
    }
    if (!submissionUrl) {
      throw new Error("Could not find a submission PDF URL in GET /submissions/:id");
    }
    const studentFile = await urlToFile(submissionUrl, `submission_${submissionId}.pdf`);
    const msFile = markSchemeUrl
      ? await urlToFile(markSchemeUrl, `markscheme_${submissionId}.pdf`)
      : null;
    return { studentFile, msFile };
  };

  const fetchPdfs = useCallback(async (submissionId) => {
    if (pdfCacheRef.current[submissionId]) return pdfCacheRef.current[submissionId];

    let entry = null;
    try {
      const res = await api.get(`/external-grading/submissions/${submissionId}/pdfs`, { timeout: 120000 });
      const data = res.data || {};
      if (!data.submission?.available || !data.submission?.base64) {
        throw new Error("Student submission PDF is not available for this entry");
      }
      if (!data.markScheme?.available || !data.markScheme?.base64) {
        throw new Error("Mark scheme PDF is not available for this entry");
      }
      const studentFile = base64ToFile(data.submission.base64, `submission_${submissionId}.pdf`);
      const msFile = base64ToFile(data.markScheme.base64, `markscheme_${submissionId}.pdf`);
      entry = { studentFile, msFile };
    } catch (primaryErr) {
      // /pdfs blocked (e.g. already marked) — try fresh pre-signed URLs instead.
      try {
        entry = await fetchPdfsViaSubmission(submissionId);
      } catch (fallbackErr) {
        console.error("Both /pdfs and /submissions/:id URL fallback failed", primaryErr, fallbackErr);
        throw primaryErr;
      }
    }

    await assertPdfBlob(entry.studentFile, "Student submission");
    if (entry.msFile) await assertPdfBlob(entry.msFile, "Mark scheme");
    pdfCacheRef.current[submissionId] = entry;
    return entry;
  }, []);

  const getStudentFile = useCallback(
    async (submissionId) => (await fetchPdfs(submissionId)).studentFile,
    [fetchPdfs]
  );

  const {
    annotatedPreviewUrl,
    previewLoading,
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmEdits,
    resetToConfirmed,
  } = useExternalAnnotatedPreview({
    resultModal,
    editingQuestions,
    effectiveMaxTotal,
    editingMaxTotal,
    resolvePdfSummary,
    getStudentFile,
  });

  // ── Defensive normalisation of the LoginCSS list envelope ──
  const normalizeItem = (raw) => {
    const id = raw.id ?? raw.submissionId ?? raw._id;
    return {
      ...raw,
      submissionId: id,
      name:
        raw.studentName ||
        raw.student?.name ||
        raw.name ||
        raw.title ||
        (id != null ? `Submission #${id}` : "Submission"),
      submittedAt: raw.created_at || raw.createdAt || raw.submittedAt || null,
      localStatus: raw.localStatus ?? null,
      localGrade: raw.localGrade ?? null,
      hasFeedbackPdf: !!raw.hasFeedbackPdf,
    };
  };

  const fetchSubmissions = useCallback(async (p = 1) => {
    setLoadingList(true);
    try {
      const res = await api.get("/external-grading/submissions", {
        params: { page: p, per_page: PER_PAGE },
      });
      const body = res.data || {};
      const items =
        body.data ||
        body.submissions ||
        body.items ||
        body.results ||
        body.rows ||
        (Array.isArray(body) ? body : []);
      const meta = body.meta || body.pagination || body;
      const totalCount = meta.total ?? meta.totalItems ?? meta.count ?? items.length;
      const tp =
        meta.totalPages ??
        meta.total_pages ??
        meta.last_page ??
        (meta.per_page
          ? Math.ceil(totalCount / meta.per_page)
          : Math.max(1, Math.ceil(totalCount / PER_PAGE)));
      setSubmissions(items.map(normalizeItem));
      setListTotal(totalCount || 0);
      setTotalPages(tp || 1);
      setPage(meta.page ?? meta.current_page ?? p);
    } catch (err) {
      console.error("Failed to load submissions", err);
      toast.error((await getApiErrorMessage(err)) || "Failed to load submissions");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return navigate("/login");
    setUser(JSON.parse(stored));
  }, [navigate]);

  useEffect(() => {
    fetchSubmissions(1);
  }, [fetchSubmissions]);

  useEffect(() => {
    api.get("/marking/prompts").then((r) => setSavedPrompts(r.data || [])).catch(() => {});
    api.get("/marking/gemini-models")
      .then((r) => {
        const { models } = parseGeminiModelsResponse(r.data);
        setGeminiModels(models);
        setGeminiModel((prev) => pickValidGeminiModel(models, prev));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!promptDropdownOpen) return;
    const close = () => setPromptDropdownOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [promptDropdownOpen]);

  // ── Error helpers ──
  const openErrorViewer = (title, message) => {
    setErrorViewer({ open: true, title, message: message || "An unknown error occurred." });
  };

  const formatError = (err) => {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    return (
      err?.error?.message ||
      err?.data?.error?.message ||
      err?.message ||
      err?.data?.message ||
      JSON.stringify(err, null, 2)
    );
  };

  // ── Modal open ──
  const openResultModal = (student, result, originalAiResult, studentFile) => {
    setResultModal({
      student,
      result,
      originalAiResult: JSON.parse(JSON.stringify(originalAiResult || result)),
      studentFile,
      submissionId: student.submissionId,
    });
    setEditingQuestions((result.questions || []).map((q) => ({ ...q })));
    setEditingMaxTotal(null);
    setEditingTotal(null);
  };

  const openGuidanceModal = (student, opts = {}) => {
    setGuidance("");
    setGuidanceModal({ student, ...opts });
  };

  const handleGuidanceConfirm = (provider = "gemini") => {
    const gm = guidanceModal;
    setGuidanceModal(null);
    if (!gm) return;
    if (gm.priorityBulk) runBulkMark(guidance, markingModeModal, "priority");
    else if (gm.bulk) runBulkMark(guidance, markingModeModal, provider);
    else if (gm.priority) runMarkSubmission(gm.student, guidance, markingModeModal, "priority");
    else runMarkSubmission(gm.student, guidance, markingModeModal, provider);
  };

  // ── Marking core (shared by single + bulk) ──
  const performMark = async (student, { guidanceText, mode, provider }) => {
    const submissionId = student.submissionId;
    const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
    if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

    const { studentFile, msFile } = await fetchPdfs(submissionId);
    if (!msFile) throw new Error("Mark scheme PDF is unavailable for this submission");

    const fd = new FormData();
    fd.append("studentPdf", studentFile);
    fd.append("markSchemePdf", msFile);
    fd.append("markingMode", mode);
    const guidanceValue = guidanceForForm(guidanceText);
    if (guidanceValue) fd.append("guidance", guidanceValue);
    if (provider !== "claude") fd.append("geminiModel", selectedModel);

    let endpoint = "/marking/mark";
    if (provider === "claude") endpoint = "/markingClaude/mark-claude";
    else if (provider === "priority") endpoint = "/marking/mark-priority";

    const res = await api.post(endpoint, fd, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600000,
    });

    let result = res.data;
    if (provider === "priority") {
      result = buildPriorityMarkingResult(
        res.data,
        res.data.tokenUsage,
        selectedModel,
        res.data.servedServiceTier
      );
    }
    return { result, studentFile };
  };

  const recordMarkResult = (submissionId, result, studentFile) => {
    setResults((prev) => ({
      ...prev,
      [submissionId]: {
        result,
        originalAiResult: JSON.parse(JSON.stringify(result)),
        studentFile,
      },
    }));
    setStudentErrors((prev) => {
      const n = { ...prev };
      delete n[submissionId];
      return n;
    });
    setSubmissions((prev) =>
      prev.map((s) =>
        s.submissionId === submissionId
          ? {
              ...s,
              localGrade: resolveTotalMarksFromResult(result),
              localStatus: s.localStatus === "done" ? s.localStatus : "grading",
            }
          : s
      )
    );
  };

  // ── Single mark (normal / claude / priority) ──
  const runMarkSubmission = async (student, guidanceText, mode = "normal", provider = "gemini") => {
    const submissionId = student.submissionId;
    setMarkingStudentId(submissionId);
    setSingleProgress((prev) => ({ ...prev, [submissionId]: { status: "marking" } }));
    try {
      const { result, studentFile } = await performMark(student, { guidanceText, mode, provider });
      recordMarkResult(submissionId, result, studentFile);
      setSingleProgress((prev) => ({ ...prev, [submissionId]: { status: "done", result, studentFile } }));
      openResultModal(student, result, result, studentFile);
    } catch (err) {
      const message = (await getApiErrorMessage(err)) || "Marking failed";
      setStudentErrors((prev) => ({ ...prev, [submissionId]: { message } }));
      setSingleProgress((prev) => ({ ...prev, [submissionId]: { status: "error" } }));
      openErrorViewer(`Marking Failed - ${student.name}`, message);
      toast.error(message);
    } finally {
      setMarkingStudentId(null);
    }
  };

  // ── Bulk mark: page through all submissions, mark sequentially ──
  const fetchAllSubmissions = async () => {
    const collected = [];
    let p = 1;
    let tp = 1;
    do {
      const res = await api.get("/external-grading/submissions", { params: { page: p, per_page: 50 } });
      const body = res.data || {};
      const items =
        body.data || body.submissions || body.items || body.results || body.rows || (Array.isArray(body) ? body : []);
      const meta = body.meta || body.pagination || body;
      const totalCount = meta.total ?? meta.totalItems ?? meta.count ?? items.length;
      tp =
        meta.totalPages ??
        meta.total_pages ??
        meta.last_page ??
        (meta.per_page ? Math.ceil(totalCount / meta.per_page) : 1);
      collected.push(...items.map(normalizeItem));
      p += 1;
    } while (p <= tp && p <= 100);
    return collected;
  };

  const runBulkMark = async (guidanceText, mode = "normal", provider = "gemini") => {
    const isPriority = provider === "priority";
    const stopRef = isPriority ? priorityStopRef : bulkStopRef;
    stopRef.current = false;
    if (isPriority) setPriorityBulkRunning(true);
    else setBulkMarking(true);
    try {
      toast.info("Loading all submissions…");
      const all = await fetchAllSubmissions();
      const eligible = all.filter(
        (s) => s.submissionId && s.localStatus !== "done" && !results[s.submissionId]?.result
      );
      if (!eligible.length) {
        toast.warn("No submissions left to mark");
        return;
      }

      const pending = {};
      eligible.forEach((s) => {
        pending[s.submissionId] = { status: "pending" };
      });
      setBulkProgress((p) => ({ ...p, ...pending }));

      let done = 0;
      let failed = 0;
      for (const student of eligible) {
        if (stopRef.current) break;
        setBulkProgress((p) => ({ ...p, [student.submissionId]: { status: "marking" } }));
        try {
          const { result, studentFile } = await performMark(student, { guidanceText, mode, provider });
          recordMarkResult(student.submissionId, result, studentFile);
          setBulkProgress((p) => ({ ...p, [student.submissionId]: { status: "done", result } }));
          done += 1;
        } catch (err) {
          const message = (await getApiErrorMessage(err)) || "Marking failed";
          setStudentErrors((prev) => ({ ...prev, [student.submissionId]: { message } }));
          setBulkProgress((p) => ({ ...p, [student.submissionId]: { status: "error" } }));
          failed += 1;
        }
      }
      toast.success(`Marking finished — ${done} done${failed ? `, ${failed} failed` : ""}`);
    } finally {
      if (isPriority) setPriorityBulkRunning(false);
      else setBulkMarking(false);
    }
  };

  const stopBulkMark = () => {
    bulkStopRef.current = true;
    toast.info("Stopping after the current submission…");
  };
  const stopPriorityBulk = () => {
    priorityStopRef.current = true;
    toast.info("Stopping after the current submission…");
  };

  const openSavedResult = (student) => {
    const saved = results[student.submissionId];
    if (!saved?.result) return;
    openResultModal(student, saved.result, saved.originalAiResult || saved.result, saved.studentFile);
  };

  const deleteResult = (student) => {
    const id = student.submissionId;
    setResults((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setSingleProgress((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setBulkProgress((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setStudentErrors((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setSubmissions((prev) =>
      prev.map((s) =>
        s.submissionId === id
          ? { ...s, localGrade: s.localStatus === "done" ? s.localGrade : null }
          : s
      )
    );
    toast.success("Result cleared — you can mark again");
  };

  // ── Edit / annotate / upload ──
  const handleConfirmEdits = async () => {
    if (!resultModal) return;
    try {
      const finalResult = await confirmEdits(async ({ finalResult, submissionId }) => {
        setResults((prev) => ({
          ...prev,
          [submissionId]: { ...(prev[submissionId] || {}), result: finalResult },
        }));
        setResultModal((prev) => ({ ...prev, result: finalResult }));
        setEditingMaxTotal(null);
        setEditingTotal(null);
        setSubmissions((prev) =>
          prev.map((s) =>
            s.submissionId === submissionId
              ? { ...s, localGrade: resolveTotalMarksFromResult(finalResult) }
              : s
          )
        );
      });
      if (finalResult) toast.success("Edits confirmed — preview and grade updated");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to confirm edits");
    }
  };

  const downloadGradedPdf = async () => {
    if (!resultModal) return;
    if (hasPendingEdits) {
      toast.warn("Confirm your edits first");
      return;
    }
    setDownloading(true);
    try {
      const submissionId = resultModal.submissionId;
      const studentFile = resultModal.studentFile || (await getStudentFile(submissionId));
      const totalMarks = editingQuestions.reduce((s, q) => s + (Number(q.marksAwarded) || 0), 0);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        totalMarks,
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
      });
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resultModal.student.name || "submission"}_graded.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const uploadToLoginCss = async () => {
    if (!resultModal) return;
    if (hasPendingEdits) {
      toast.warn("Confirm your edits first so the uploaded PDF matches the preview");
      return;
    }
    const submissionId = resultModal.submissionId;

    if (resultModal.student?.localStatus === "done") {
      const ok = await confirmToast("This submission was already graded. Re-upload and overwrite?", {
        title: "Re-upload to LoginCSS",
        confirmLabel: "Re-upload",
      });
      if (!ok) return;
    }

    setReturning(true);
    try {
      const studentFile = resultModal.studentFile || (await getStudentFile(submissionId));
      const totalMarks = editingQuestions.reduce((s, q) => s + (Number(q.marksAwarded) || 0), 0);
      const summary = resolvePdfSummary(submissionId, resultModal.result);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        totalMarks,
        maxTotalMarks: effectiveMaxTotal,
        summary,
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
      });

      const fd = new FormData();
      fd.append("annotatedPdf", new Blob([pdfBytes], { type: "application/pdf" }), `feedback_${submissionId}.pdf`);
      fd.append("submissionId", submissionId);
      fd.append("grade", totalMarks);
      if (summary) fd.append("comments", summary);
      if (resultModal.student?.submittedAt) fd.append("submissionDate", resultModal.student.submittedAt);

      await api.post("/external-grading/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });

      toast.success("Grade & feedback uploaded to LoginCSS");
      setSubmissions((prev) =>
        prev.map((s) =>
          s.submissionId === submissionId
            ? { ...s, localStatus: "done", localGrade: totalMarks, hasFeedbackPdf: true }
            : s
        )
      );
      setResultModal(null);
      fetchSubmissions(page);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to upload to LoginCSS");
    } finally {
      setReturning(false);
    }
  };

  // ── PDF row actions (student submission + mark scheme) ──
  const pickFile = (entry, which) => (which === "ms" ? entry.msFile : entry.studentFile);

  const viewFile = async (student, which) => {
    const label = which === "ms" ? "mark scheme" : "submission";
    try {
      const entry = await fetchPdfs(student.submissionId);
      const file = pickFile(entry, which);
      if (!file) return toast.error(`No ${label} available for this submission`);
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || `Failed to open ${label}`);
    }
  };

  const downloadFile = async (student, which) => {
    const label = which === "ms" ? "mark scheme" : "submission";
    try {
      const entry = await fetchPdfs(student.submissionId);
      const file = pickFile(entry, which);
      if (!file) return toast.error(`No ${label} available for this submission`);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${student.name || "submission"}${which === "ms" ? "_markscheme" : ""}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || `Failed to download ${label}`);
    }
  };

  const statusBadge = (s) => {
    switch (s.localStatus) {
      case "done":
        return <span className="ma-badge ma-badge--green">Graded</span>;
      case "grading":
        return <span className="ma-badge ma-badge--orange">Grading</span>;
      case "failed":
        return <span className="ma-badge ma-badge--red">Failed</span>;
      case "pending":
        return <span className="ma-badge ma-badge--gray">Pending</span>;
      default:
        return <span className="ma-badge ma-badge--gray">New</span>;
    }
  };

  const savePrompt = async () => {
    if (!guidance.trim()) return toast.warn("Cannot save empty prompt");
    const name = await promptToast("Name this prompt:", {
      title: "Save prompt",
      placeholder: "Prompt name",
      confirmLabel: "Save",
    });
    if (!name) return;
    try {
      const res = await api.post("/marking/prompts", { name, content: guidance });
      setSavedPrompts((prev) => [...prev, res.data]);
      toast.success("Prompt saved");
    } catch {
      toast.error("Failed to save prompt");
    }
  };

  if (!user) return null;

  const visibleSubmissions = search.trim()
    ? submissions.filter((s) => (s.name || "").toLowerCase().includes(search.trim().toLowerCase()))
    : submissions;

  const isCriteria = resultModal?.result?.markingMode === "criteria";
  const total = sumQuestionMarks(editingQuestions);
  const pct = gradeScorePercent(total, effectiveMaxTotal);
  const color = getScoreColor(total, effectiveMaxTotal);

  return (
    <div className="ma-root">

      <main className="ma-main">
        <header className="ma-topbar">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">LoginCSS Submissions</h1>
            <span className="ma-topbar-sub">Welcome back, {user.name}</span>
          </div>
          <div className="ma-topbar-right">
            <button
              type="button"
              className="msv-refresh-btn"
              onClick={() => fetchSubmissions(page)}
              disabled={loadingList}
            >
              <FiRefreshCw size={13} className={loadingList ? "msv-spin" : ""} />
              {loadingList ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="ma-content">
          <div className="ma-layout msv-collapsible-layout">
            <div className="ma-right-panel msv-right-panel-full">
              <div className="ma-panel">
                <div className="ma-panel-header">
                  <div className="ma-panel-title-wrap">
                    <div className="ma-panel-dot" />
                    <h2 className="ma-panel-title">Submissions</h2>
                    <span className="ma-panel-count">{listTotal} total</span>
                  </div>
                  <div className="msv-panel-controls" style={{ flexWrap: "wrap", gap: 8 }}>
                    <input
                      className="msv-student-search"
                      type="text"
                      placeholder="Search by name…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                      className="msv-gemini-select"
                      value={pickValidGeminiModel(geminiModels, geminiModel)}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      disabled={bulkMarking || priorityBulkRunning}
                      title="Gemini model for marking"
                      style={{ minWidth: 180, maxWidth: 260 }}
                    >
                      {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="msv-btn-ai"
                      onClick={() => openGuidanceModal(null, { bulk: true })}
                      disabled={bulkMarking || priorityBulkRunning}
                    >
                      {bulkMarking ? (
                        <>
                          <span className="pm-spinner" /> Marking all…
                        </>
                      ) : (
                        <>
                          <FiCpu size={13} /> Mark All
                        </>
                      )}
                    </button>
                    {bulkMarking && (
                      <button
                        className="msv-btn-ai"
                        onClick={stopBulkMark}
                        style={{ background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.4)", color: "#f87171" }}
                      >
                        <FiX size={13} /> Stop
                      </button>
                    )}
                    <button
                      className="msv-btn-ai"
                      onClick={() => openGuidanceModal(null, { bulk: true, priorityBulk: true })}
                      disabled={bulkMarking || priorityBulkRunning}
                      style={{ background: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.4)" }}
                    >
                      {priorityBulkRunning ? (
                        <>
                          <span className="pm-spinner" /> Priority marking…
                        </>
                      ) : (
                        <>
                          <FiSend size={13} /> Mark All (Priority)
                        </>
                      )}
                    </button>
                    {priorityBulkRunning && (
                      <button
                        className="msv-btn-ai"
                        onClick={stopPriorityBulk}
                        style={{ background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.4)", color: "#f87171" }}
                      >
                        <FiX size={13} /> Stop
                      </button>
                    )}
                  </div>
                </div>

                {loadingList && <p className="ma-loading-msg">Loading submissions…</p>}
                {!loadingList && visibleSubmissions.length === 0 && (
                  <p className="ma-empty-msg">
                    {search ? `No submissions match "${search}".` : "No submissions found."}
                  </p>
                )}

                {!loadingList && visibleSubmissions.length > 0 && (
                  <div className="ma-table-wrap">
                    <div className="ma-table-scroll">
                      <table className="ma-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Submitted At</th>
                            <th>Grade</th>
                            <th>Feedback</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleSubmissions.map((s, i) => {
                            const single = singleProgress[s.submissionId];
                            const bulk = bulkProgress[s.submissionId];
                            const isMarking =
                              single?.status === "marking" ||
                              bulk?.status === "marking" ||
                              bulk?.status === "pending" ||
                              markingStudentId === s.submissionId;
                            const hasResult = !!results[s.submissionId]?.result;
                            const hasError = single?.status === "error" || bulk?.status === "error" || studentErrors[s.submissionId];
                            return (
                              <tr
                                key={s.submissionId ?? i}
                                className="ma-row"
                                style={{ animationDelay: `${i * 0.025}s` }}
                              >
                                <td>
                                  <div className="ma-avatar-cell">
                                    <div className="ma-avatar">
                                      {(s.name || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <span className="ma-cell-name">{s.name || "—"}</span>
                                  </div>
                                </td>
                                <td>{statusBadge(s)}</td>
                                <td>
                                  <span className="ma-cell-muted">
                                    {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                                  </span>
                                </td>
                                <td>
                                  {s.localGrade != null ? (
                                    <span className="ma-grade-pill">{s.localGrade}</span>
                                  ) : (
                                    <span className="ma-cell-empty">—</span>
                                  )}
                                </td>
                                <td>
                                  {s.hasFeedbackPdf ? (
                                    <span className="ma-badge ma-badge--green">PDF</span>
                                  ) : (
                                    <span className="ma-cell-empty">—</span>
                                  )}
                                </td>
                                <td>
                                  <div className="msv-actions">
                                    <button
                                      className="msv-action-btn"
                                      title="View submission"
                                      onClick={() => viewFile(s, "student")}
                                    >
                                      <FiEye size={13} />
                                    </button>
                                    <button
                                      className="msv-action-btn"
                                      title="Download submission"
                                      onClick={() => downloadFile(s, "student")}
                                    >
                                      <FiDownload size={13} />
                                    </button>
                                    <button
                                      className="msv-action-btn"
                                      title="View mark scheme"
                                      onClick={() => viewFile(s, "ms")}
                                    >
                                      <FiEye size={13} /> MS
                                    </button>
                                    <button
                                      className="msv-action-btn"
                                      title="Download mark scheme"
                                      onClick={() => downloadFile(s, "ms")}
                                    >
                                      <FiDownload size={13} /> MS
                                    </button>

                                    {studentErrors[s.submissionId] && (
                                      <button
                                        className="msv-action-btn msv-action-btn--view"
                                        title="View Error"
                                        onClick={() =>
                                          openErrorViewer(
                                            `Marking Failed - ${s.name}`,
                                            studentErrors[s.submissionId].message
                                          )
                                        }
                                      >
                                        View Error
                                      </button>
                                    )}

                                    {hasResult && (
                                      <button
                                        className="msv-action-btn msv-action-btn--ai msv-action-btn--done"
                                        title="View Results"
                                        onClick={() => openSavedResult(s)}
                                      >
                                        ✅ Results
                                      </button>
                                    )}

                                    <button
                                      className={`msv-action-btn msv-action-btn--ai ${
                                        hasError ? "msv-action-btn--error" : ""
                                      }`}
                                      title="Mark with AI"
                                      onClick={() => openGuidanceModal(s)}
                                      disabled={isMarking}
                                    >
                                      {isMarking ? (
                                        <span className="pm-spinner" />
                                      ) : hasError ? (
                                        <>❌ Retry</>
                                      ) : (
                                        <>
                                          <FiCpu size={12} /> Mark
                                        </>
                                      )}
                                    </button>

                                    <button
                                      className="msv-action-btn msv-action-btn--ai"
                                      title="Mark on Gemini priority tier (fastest)"
                                      onClick={() => openGuidanceModal(s, { priority: true })}
                                      disabled={isMarking}
                                      style={{ borderColor: "rgba(251,191,36,0.4)" }}
                                    >
                                      <FiSend size={12} /> Priority
                                    </button>

                                    {hasResult && (
                                      <button
                                        className="msv-action-btn msv-action-btn--delete"
                                        title="Delete result and mark again"
                                        onClick={() => deleteResult(s)}
                                      >
                                        🗑 Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!loadingList && submissions.length > 0 && (
                  <Pagination page={page} totalPages={totalPages} onPageChange={fetchSubmissions} />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── ERROR VIEWER ── */}
      {errorViewer.open && (
        <div
          className="msv-overlay"
          onClick={() => setErrorViewer({ open: false, title: "", message: null })}
        >
          <div
            className="msv-results-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            <div className="msv-modal-header">
              <div style={{ fontSize: 15, fontWeight: 700 }}>❌ {errorViewer.title}</div>
              <button
                className="msv-icon-btn"
                onClick={() => setErrorViewer({ open: false, title: "", message: null })}
              >
                <FiX />
              </button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                Error Details
              </div>
              <div
                style={{
                  background: "rgba(255,0,0,0.08)",
                  border: "1px solid rgba(255,0,0,0.2)",
                  padding: 12,
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#fca5a5",
                  whiteSpace: "pre-wrap",
                  maxHeight: 300,
                  overflowY: "auto",
                }}
              >
                {formatError(errorViewer.message)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GUIDANCE MODAL ── */}
      {guidanceModal && (
        <div className="msv-overlay" onClick={() => setGuidanceModal(null)}>
          <div className="msv-guidance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msv-guidance-header">
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {guidanceModal.priorityBulk
                  ? "🚀 Mark All (Priority)"
                  : guidanceModal.bulk
                  ? "🤖 Mark All Submissions"
                  : guidanceModal.priority
                  ? `🚀 Mark (Priority) — ${guidanceModal.student?.name}`
                  : `🤖 Mark — ${guidanceModal.student?.name}`}
              </div>
              <button className="msv-icon-btn" onClick={() => setGuidanceModal(null)}>
                <FiX size={16} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Mode selector */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 8 }}
                >
                  Marking Mode
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { value: "normal", label: "📋 Normal Marking", desc: "Marks against the mark scheme" },
                    { value: "criteria", label: "🎯 Criteria Marking", desc: "Two-layer: corrections + criteria grade" },
                  ].map((m) => (
                    <div
                      key={m.value}
                      onClick={() => setMarkingModeModal(m.value)}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: 10,
                        cursor: "pointer",
                        border: `2px solid ${markingModeModal === m.value ? "#399cf2" : "rgba(255,255,255,0.1)"}`,
                        background: markingModeModal === m.value ? "rgba(57,156,242,0.1)" : "rgba(255,255,255,0.03)",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gemini model */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}
                >
                  Gemini Model
                </label>
                <select
                  className="msv-gemini-select"
                  value={pickValidGeminiModel(geminiModels, geminiModel)}
                  onChange={(e) => setGeminiModel(e.target.value)}
                >
                  {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Saved prompt dropdown */}
              {savedPrompts.length > 0 && (
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <label
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}
                  >
                    Load saved prompt
                  </label>
                  <div
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: `1px solid ${promptDropdownOpen ? "rgba(57,156,242,0.5)" : "rgba(255,255,255,0.1)"}`,
                      background: "rgba(255,255,255,0.04)",
                      color: guidance ? "white" : "rgba(255,255,255,0.35)",
                      fontSize: 13,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      userSelect: "none",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptDropdownOpen((v) => !v);
                    }}
                  >
                    <span>
                      {guidance
                        ? savedPrompts.find((p) => p.content === guidance)?.name || "📋 Custom guidance entered"
                        : "📋 Select a saved prompt…"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.3)",
                        transform: promptDropdownOpen ? "rotate(180deg)" : "none",
                      }}
                    >
                      ▼
                    </span>
                  </div>
                  {promptDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        background: "#060f2e",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        zIndex: 200,
                        maxHeight: 220,
                        overflowY: "auto",
                        overflowX: "hidden",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                      }}
                    >
                      {savedPrompts.map((p, i) => (
                        <div
                          key={p._id}
                          style={{
                            padding: "10px 14px",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "flex-start",
                            borderBottom:
                              i < savedPrompts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                          }}
                        >
                          <div
                            style={{ flex: 1 }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setGuidance(p.content);
                              setPromptDropdownOpen(false);
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                              {p.content.slice(0, 80)}...
                            </div>
                          </div>
                          <button
                            onMouseDown={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              try {
                                await api.delete(`/marking/prompts/${p._id}`);
                                setSavedPrompts((prev) => prev.filter((x) => x._id !== p._id));
                                toast.success("Prompt deleted");
                              } catch {
                                toast.error("Failed to delete prompt");
                              }
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: 12,
                              padding: "4px 6px",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label
                style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}
              >
                {markingModeModal === "criteria" ? (
                  <>
                    <span style={{ color: "#e2e8f0" }}>Criteria</span>{" "}
                    <span style={{ color: "#ef4444" }}>*</span> — define the grading criteria and weights
                  </>
                ) : (
                  <>
                    Additional Guidance{" "}
                    <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span>
                  </>
                )}
              </label>
              <textarea
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                rows={6}
                placeholder={
                  markingModeModal === "criteria"
                    ? "Define criteria e.g:\nOn-Time Submission: 2 marks\nCompleteness: 2 marks\nShowing Steps: 2 marks"
                    : "e.g. Be strict with units. Award method marks if working is shown..."
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 13,
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              <button className="ma-send-btn" onClick={savePrompt}>
                Save Prompt
              </button>

              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                {guidanceModal.priority || guidanceModal.priorityBulk ? (
                  <button
                    className="ma-send-btn"
                    onClick={() => handleGuidanceConfirm("gemini")}
                    disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1,
                      background: "rgba(251,191,36,0.15)",
                      borderColor: "rgba(251,191,36,0.4)",
                    }}
                  >
                    <FiSend size={14} />
                    {guidanceModal.priorityBulk ? "Start Priority Marking (All)" : "Start Priority Marking"}
                  </button>
                ) : (
                  <>
                    <button
                      className="ma-send-btn"
                      onClick={() => handleGuidanceConfirm("gemini")}
                      disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1,
                      }}
                    >
                      <FiCpu size={14} />
                      {guidanceModal.bulk ? "Start Marking All with Gemini" : "Start Marking with Gemini"}
                    </button>
                    <button className="ma-send-btn" onClick={() => handleGuidanceConfirm("claude")}>
                      <FiCpu size={14} />
                      {guidanceModal.bulk ? "Start Marking All with Claude" : "Start Marking with Claude"}
                    </button>
                  </>
                )}
                <button className="msv-cancel-btn" onClick={() => setGuidanceModal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS MODAL ── */}
      {resultModal && (
        <div className="msv-overlay" onClick={() => setResultModal(null)}>
          <div className="msv-results-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msv-modal-header">
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  AI Marking Results — {resultModal.student.name}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: isCriteria ? "rgba(139,92,246,0.15)" : "rgba(57,156,242,0.15)",
                      color: isCriteria ? "#a78bfa" : "#399cf2",
                      border: `1px solid ${isCriteria ? "rgba(139,92,246,0.3)" : "rgba(57,156,242,0.3)"}`,
                    }}
                  >
                    {isCriteria ? "🎯 Criteria Marking" : "📋 Normal Marking"}
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Final Grade:</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <input
                      readOnly
                      type="number"
                      min={0}
                      max={effectiveMaxTotal}
                      value={total}
                      style={{
                        width: 56,
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: `1px solid ${color}`,
                        background: `${color}15`,
                        color: color,
                        fontWeight: 700,
                        fontSize: 15,
                        textAlign: "center",
                        outline: "none",
                        cursor: "not-allowed",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>/</span>
                    <input
                      type="number"
                      min={1}
                      value={editingMaxTotal !== null ? editingMaxTotal : effectiveMaxTotal}
                      onChange={(e) => setEditingMaxTotal(Math.max(1, Number(e.target.value)))}
                      style={{
                        width: 56,
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 700,
                        fontSize: 15,
                        textAlign: "center",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>({pct}%)</span>
                    {hasPendingEdits && (
                      <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>Unsaved edits</span>
                    )}
                    {(hasPendingEdits || editingMaxTotal !== null) && (
                      <button
                        onClick={() => {
                          const reset = resetToConfirmed();
                          if (reset) {
                            setEditingQuestions(reset.questions);
                            setEditingMaxTotal(null);
                            setEditingTotal(null);
                          } else {
                            setEditingTotal(null);
                            setEditingMaxTotal(null);
                          }
                        }}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "rgba(255,255,255,0.05)",
                          color: "rgba(255,255,255,0.5)",
                          cursor: "pointer",
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div style={{ flex: "1 1 180px", minWidth: 140, maxWidth: 280 }}>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: color,
                          borderRadius: 4,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {hasPendingEdits && (
                  <button
                    className="msv-btn-ai"
                    onClick={handleConfirmEdits}
                    disabled={confirmingEdits || previewLoading}
                    style={{ background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)" }}
                  >
                    <FiCheck size={13} />
                    {confirmingEdits ? "Confirming…" : "Confirm Edits"}
                  </button>
                )}
                <button
                  className="ma-send-btn"
                  onClick={downloadGradedPdf}
                  disabled={downloading || hasPendingEdits}
                  style={{ fontSize: 12 }}
                  title={hasPendingEdits ? "Confirm edits first" : undefined}
                >
                  <FiDownload size={13} />
                  {downloading ? "Generating…" : "Download PDF"}
                </button>
                <button
                  className="msv-btn-ai"
                  onClick={uploadToLoginCss}
                  disabled={returning || hasPendingEdits}
                  title={hasPendingEdits ? "Confirm edits first" : undefined}
                >
                  <FiSend size={13} />
                  {returning ? "Uploading…" : "Upload to LoginCSS"}
                </button>
                <button className="msv-icon-btn" onClick={() => setResultModal(null)}>
                  <FiX size={16} />
                </button>
              </div>
            </div>

            <div
              className="msv-modal-body"
              style={{ display: "flex", gap: 20, height: "80vh", overflow: "hidden" }}
            >
              {/* LEFT: results / editor */}
              <div style={{ flex: "0 0 60%", overflowY: "auto", height: "100%", paddingRight: 8 }}>
                {resultModal.result.fileWarning && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: "10px 14px",
                      background: "rgba(245,158,11,0.1)",
                      border: "1px solid rgba(245,158,11,0.35)",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "#fbbf24",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    ⚠️{" "}
                    <span>
                      {typeof resultModal.result.fileWarning === "string"
                        ? resultModal.result.fileWarning
                        : resultModal.result.fileWarning.message ||
                          "Submitted file may be wrong — page count differs from expected"}
                    </span>
                  </div>
                )}
                <PdfCompressionStats pdfCompression={resultModal.result.pdfCompression} />
                <TokenUsageStats result={resultModal.result} />

                {/* CRITERIA MODE */}
                {isCriteria && resultModal.result.criteriaGrade && (
                  <div style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        padding: "16px 20px",
                        background: "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.25)",
                        borderRadius: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "rgba(139,92,246,0.8)",
                          marginBottom: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        🎯 Criteria Grade (Final)
                      </div>
                      {(() => {
                        const cg = resultModal.result.criteriaGrade;
                        const cgTotal = cg.totalMarks || 0;
                        const cgMax = cg.maxTotalMarks || 10;
                        const cgPct = cgMax > 0 ? Math.round((cgTotal / cgMax) * 100) : 0;
                        const cgColor = getScoreColor(cgTotal, cgMax);
                        return (
                          <>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                                marginBottom: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ fontSize: 36, fontWeight: 800, color: cgColor, lineHeight: 1 }}>
                                {cgTotal}
                              </div>
                              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>/ {cgMax}</div>
                              <div style={{ flex: 1, minWidth: 100 }}>
                                <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                                  <div
                                    style={{
                                      width: `${cgPct}%`,
                                      height: "100%",
                                      background: cgColor,
                                      borderRadius: 4,
                                    }}
                                  />
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                                  {cgPct}%
                                </div>
                              </div>
                            </div>
                            {cg.breakdown?.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {cg.breakdown.map((row, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      padding: "8px 12px",
                                      background: "rgba(255,255,255,0.03)",
                                      borderRadius: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: 13, minWidth: 160 }}>
                                      {row.criterion}
                                    </div>
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        fontSize: 13,
                                        color: getScoreColor(row.marksAwarded, row.maxMarks),
                                        minWidth: 60,
                                      }}
                                    >
                                      {row.marksAwarded} / {row.maxMarks}
                                    </div>
                                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", flex: 1 }}>
                                      {row.reason}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {cg.summary && (
                              <p
                                style={{
                                  fontSize: 13,
                                  color: "rgba(255,255,255,0.6)",
                                  marginTop: 12,
                                  lineHeight: 1.6,
                                }}
                              >
                                {cg.summary}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                      <span
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.3)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        📝 Question Corrections (Feedback Only)
                      </span>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                    </div>
                  </div>
                )}

                {/* NORMAL MODE summary */}
                {!isCriteria && resultModal.result.summary && (
                  <div className="msv-summary-box">
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.5)",
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Summary
                    </div>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
                      {resultModal.result.summary}
                    </p>
                  </div>
                )}

                {/* QUESTIONS */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {editingQuestions.map((q, idx) => {
                    const awarded = Number(q.marksAwarded) || 0;
                    const qMax = Number(q.maxMarks) || 0;
                    const qColor = getScoreColor(awarded, qMax);
                    const qPct = qMax > 0 ? Math.round((awarded / qMax) * 100) : 0;
                    return (
                      <div key={idx} className="msv-q-card">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 700 }}>Q{q.questionNumber}</span>
                          {isCriteria ? (
                            <span
                              style={{
                                padding: "3px 10px",
                                borderRadius: 6,
                                border: `1px solid ${qColor}`,
                                background: `${qColor}15`,
                                color: qColor,
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {q.marksAwarded} / {q.maxMarks}
                            </span>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="number"
                                min={0}
                                max={q.maxMarks}
                                value={awarded}
                                onChange={(e) =>
                                  setEditingQuestions((prev) =>
                                    prev.map((x, i) =>
                                      i === idx
                                        ? {
                                            ...x,
                                            marksAwarded: Math.min(
                                              qMax,
                                              Math.max(0, Number(e.target.value) || 0)
                                            ),
                                          }
                                        : x
                                    )
                                  )
                                }
                                style={{
                                  width: 52,
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: `1px solid ${qColor}`,
                                  background: `${qColor}15`,
                                  color: qColor,
                                  fontWeight: 700,
                                  fontSize: 14,
                                  textAlign: "center",
                                  outline: "none",
                                }}
                              />
                              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
                                / {q.maxMarks}
                              </span>
                            </div>
                          )}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 60,
                              height: 5,
                              background: "rgba(255,255,255,0.08)",
                              borderRadius: 3,
                            }}
                          >
                            <div
                              style={{ width: `${qPct}%`, height: "100%", background: qColor, borderRadius: 3 }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{qPct}%</span>
                        </div>

                        {q.checklist && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                            {CHECKLIST_CONFIG.map(({ key, label, passIsGood }) => {
                              const val = q.checklist[key];
                              const isGood = passIsGood ? val === true : val === false;
                              return (
                                <span
                                  key={key}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: 12,
                                    fontSize: 11,
                                    background: isGood ? "rgba(34,197,94,0.1)" : "rgba(255,77,79,0.1)",
                                    color: isGood ? "#22c55e" : "#ff4d4f",
                                    border: `1px solid ${isGood ? "rgba(34,197,94,0.2)" : "rgba(255,77,79,0.2)"}`,
                                  }}
                                >
                                  {isGood ? "✅" : "❌"} {label}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {q.studentAnswer && q.studentAnswer !== "Not attempted" && (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>Student: </span>
                            {q.studentAnswer}
                          </div>
                        )}
                        {q.studentAnswer === "Not attempted" && (
                          <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 6 }}>📭 Not attempted</div>
                        )}

                        {q.correctAnswer && (isCriteria || Number(q.maxMarks) === 1) && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(34,197,94,0.8)",
                              marginBottom: 6,
                              padding: "6px 10px",
                              background: "rgba(34,197,94,0.07)",
                              borderRadius: 6,
                              border: "1px solid rgba(34,197,94,0.15)",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>✅ Correct Answer: </span>
                            {q.correctAnswer}
                          </div>
                        )}

                        <div
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.4)",
                            marginBottom: 4,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {isCriteria ? "Comment" : "Examiner Note"}
                        </div>
                        {isCriteria ? (
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>
                            {q.reason}
                          </p>
                        ) : (
                          <textarea
                            value={q.reason}
                            onChange={(e) =>
                              setEditingQuestions((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x))
                              )
                            }
                            rows={3}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.03)",
                              color: "rgba(255,255,255,0.75)",
                              fontSize: 12,
                              resize: "vertical",
                              boxSizing: "border-box",
                              fontFamily: "inherit",
                              outline: "none",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: annotated preview */}
              <div
                style={{
                  flex: "0 0 40%",
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 10,
                    color: "rgba(255,255,255,0.6)",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>📄 Annotated PDF Preview</span>
                  {hasPendingEdits && (
                    <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600, textTransform: "none" }}>
                      Confirm edits to update preview
                    </span>
                  )}
                </div>

                {previewLoading ? (
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Generating preview…</div>
                ) : previewError ? (
                  <div style={{ color: "#f87171", fontSize: 13 }}>{previewError}</div>
                ) : annotatedPreviewUrl ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <iframe
                      key={annotatedPreviewUrl}
                      src={annotatedPreviewUrl}
                      title="Annotated PDF"
                      style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
                    />
                  </div>
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No preview available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
