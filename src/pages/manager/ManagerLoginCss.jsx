import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { confirmToast, promptToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import { downloadBlob } from "../../utils/downloadBlob";
import {
  FiDownload, FiEye, FiCpu, FiX, FiSend, FiCheck, FiRefreshCw, FiLayers, FiCalendar, FiArrowLeft,
  FiEdit3, FiShield, FiDownloadCloud, FiRotateCcw, FiRotateCw,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";
import usePersistedState from "../../hooks/usePersistedState";
import useMarkingEditHistory from "../../hooks/useMarkingEditHistory";
import {
  assertPdfBlob,
  sumQuestionMarks,
  filterQuestionsPendingRemoval,
  buildPlacementQuestions,
  applyPlacementChange,
  questionsForConfirmEdits,
  gradeScorePercent,
  getApiErrorMessage,
  getMarkingResultSummary,
  guidanceForForm,
  resolveMarkingGuidanceText,
  normalizeGuidance,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  rebuildMarkingSummary,
  resolveTotalMarksFromResult,
  resolveAnnotatePdfTotalMarks,
  resolveDisplayMaxTotal,
  buildPriorityMarkingResult,
  appendMarkingContext,
} from "../../utils/markingFormData";
import { parseGeminiModelsResponse, pickValidGeminiModel, sahahlyModelLabel } from "../../utils/markingCost";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import TokenUsageStats from "../../components/TokenUsageStats";
import TeacherAnnotationsEditor from "../../components/TeacherAnnotationsEditor";
import QuestionKeywordFields from "../../components/QuestionKeywordFields";
import {
  applyQuestionRowEdit,
  patchQuestionRowEdit,
} from "../../utils/markingQuestionEdits";
import AnnotatedPdfPreview from "../../components/AnnotatedPdfPreview";
import MarkingCorrectionChat from "../../components/MarkingCorrectionChat";
import AddMarkingQuestionBar, {
  MarkingCompletenessNotice,
} from "../../components/AddMarkingQuestionBar";
import MarkingPageShiftNotice from "../../components/MarkingPageShiftNotice";
import QuestionNumberBadge from "../../components/QuestionNumberBadge";
import AssignmentPromptGeneration from "../../components/AssignmentPromptGeneration";
import MarkSchemeVerificationModal, {
  runMarkSchemeVerification,
} from "../../components/MarkSchemeVerificationModal";
import { isBlankQuestion } from "../../utils/blankQuestionFeedback";
import { base64ToFile } from "../../utils/base64ToFile";
import { useExternalAnnotatedPreview } from "../../hooks/useExternalAnnotatedPreview";
import {
  patchBatchJob,
  subscribeBatchJob,
  registerBatchPoll,
  clearBatchPoll,
  setBatchStopped,
  isBatchStopped,
  getBatchJob,
} from "../../utils/assignmentBatchJobStore";
import "./ManagerSubmissionViewer.css";
import { useAssignmentMarkingPrompt } from "../../hooks/useAssignmentMarkingPrompt";
import usePendingEditsAutosave from "../../hooks/usePendingEditsAutosave";
import PendingEditsBanner, {
  PendingEditsSavingHint,
} from "../../components/PendingEditsBanner";
import { canGradeProvider, canRunGradingMarking } from "../../utils/gradingAccess";
import { getDashboardPathForUser } from "../../utils/authRoutes";
import { useGradingDelegations } from "../../context/GradingNotificationContext";
import GradingDeadlineBadge from "../../components/GradingDeadlineBadge";
import GradingTeamAlert from "../../components/GradingTeamAlert";
import {
  useMarkingStudentSelection,
  markingActionLabel,
} from "../../utils/markingStudentSelection";
import {
  fetchPublishQueue,
  runGradingPublishAll,
  formatPublishAllMessage,
} from "../../utils/gradingPublishAll";
import MarkingSelectionBar from "../../components/MarkingSelectionBar";
import { formatSubmittedAt } from "../../utils/formatSubmittedAt";
import { useGradingAssignmentSettings } from "../../hooks/useGradingAssignmentSettings";
import GradingAssignmentSettingsBar from "../../components/GradingAssignmentSettingsBar";
import PageCountCheckModal from "../../components/PageCountCheckModal";
import OrientationCheckModal from "../../components/OrientationCheckModal";
import {
  usePageCountCheck,
  buildPageCountFlagMap,
  pageCountWarningText,
} from "../../hooks/usePageCountCheck";
import {
  useOrientationCheck,
  buildOrientationFlagMap,
  orientationWarningText,
} from "../../hooks/useOrientationCheck";

// LoginCSS keeps its own /external-grading routes rather than the shared
// /grading/:provider registry — a null slug selects them.
const PROVIDER = null;

const PER_PAGE = 10;
const ASSIGNMENTS_PER_PAGE = 15;

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",          passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

// Stable per-assignment key (submissions with no assignment fall under "__none__").
const getScoreColor = (awarded, max) => {
  const pct = max > 0 ? awarded / max : 0;
  if (pct >= 0.75) return "var(--success)";
  if (pct >= 0.5) return "var(--warning)";
  return "var(--danger)";
};

export default function ManagerLoginCss() {
  const navigate = useNavigate();

  // Access to this tab comes either from the static allow-list or from a
  // director delegation, and the latter is fetched — see gradingAccess.
  const { delegations, delegationsLoaded } = useGradingDelegations();

  // Marking is manager01's job, or that of someone the director delegated
  // LoginCSS to AS A MANAGER. A delegated assistant only reviews what was
  // produced: open the results modal, edit it, publish it. Every control that
  // would start or undo a marking run hangs off this flag.
  const canMark = canRunGradingMarking("logincss", delegations);

  const [user, setUser] = useState(null);

  // ── LoginCSS submissions list ──
  const [submissions, setSubmissions] = useState([]);
  const [page, setPage] = useState(1);
  // Lets loadAll refresh the page currently on screen without depending on it.
  const pageRef = useRef(page);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [sendingAlertId, setSendingAlertId] = useState(null);
  const [assignmentIndex, setAssignmentIndex] = useState([]);
  // Server-side pagination for the open assignment's submissions.
  const [listMeta, setListMeta] = useState({ total: 0, lastPage: 1 });
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  // Search spans the whole assignment, not the page on screen: the first
  // keystroke pulls the full roster once and later keystrokes filter it in
  // memory. LoginCSS offers no name/id search endpoint to delegate to.
  const [searchRoster, setSearchRoster] = useState(null);
  const [loadingSearchRoster, setLoadingSearchRoster] = useState(false);
  const searchRosterRef = useRef(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [selectedAssignment, setSelectedAssignment] = usePersistedState("logincss:assignment", null);
  // Read by loadAll and the mount effect so neither has to re-create itself
  // every time the selection changes. Seeded with the persisted value, then
  // kept in sync from an effect — assigning during render is not allowed.
  const selectedAssignmentRef = useRef(selectedAssignment);
  // `grading: true` is required: these ids are LoginCSS's own numbers, and the
  // classroom /marking/assignment-prompt routes only accept Mongo ObjectIds —
  // they answer "Assignment not found" for every LoginCSS assignment.
  const assignmentPrompt = useAssignmentMarkingPrompt(
    selectedAssignment?.id != null ? String(selectedAssignment.id) : null,
    { grading: true, provider: PROVIDER }
  );
  const [listTotal, setListTotal] = useState(0);
  const [sessionError, setSessionError] = useState(null);
  const [promptGenOpen, setPromptGenOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [msVerifyOpen, setMsVerifyOpen] = useState(false);
  const [msVerifying, setMsVerifying] = useState(false);
  const [msVerifyResult, setMsVerifyResult] = useState(null);

  // ── Guidance modal / marking config ──
  const [guidanceModal, setGuidanceModal] = useState(null);
  const [guidance, setGuidance] = useState("");
  const [markingModeModal, setMarkingModeModal] = useState("normal");
  const [savedPrompts, setSavedPrompts] = useState([]);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");

  // ── Marking progress / results ──
  const [markingStudentId, setMarkingStudentId] = useState(null);
  const [singleProgress, setSingleProgress] = useState({});
  const [studentErrors, setStudentErrors] = useState({});
  const [results, setResults] = useState({}); // submissionId -> { result, originalAiResult, studentFile }
  const correctedCount = useMemo(
    () => Object.values(results).filter((entry) => entry?.result).length,
    [results]
  );

  // Bulk ("Mark All") + priority bulk
  const [bulkMarking, setBulkMarking] = useState(false);
  const [priorityBulkRunning, setPriorityBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({});
  const bulkStopRef = useRef(false);
  const priorityStopRef = useRef(false);

  // ── Server-side batch marking (Gemini batch API via external-grading) ──
  const [batchJob, setBatchJob] = useState(null);

  // ── Row selection for marking (same behaviour as the submission viewer) ──
  // An empty selection means "the whole assignment", so every marking action
  // keeps working exactly as before until the manager ticks something.
  const markingSelection = useMarkingStudentSelection();
  const [selectingMarkingAll, setSelectingMarkingAll] = useState(false);

  const [resultModal, setResultModal] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const [editingAnnotations, setEditingAnnotations] = useState([]);
  const [editingSummary, setEditingSummary] = useState("");
  const [summaryTouched, setSummaryTouched] = useState(false);
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);
  const [editingTotal, setEditingTotal] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [returning, setReturning] = useState(false);

  // ── Publish All (bulk publish of already-marked submissions) ──
  // Publishing is the one action everybody with this tab can take, marker or
  // reviewer, so this is deliberately outside the canMark gate.
  const [publishAll, setPublishAll] = useState(null); // { done, total, current, loading }
  const publishStopRef = useRef(false);
  const [pendingRemovedIndices, setPendingRemovedIndices] = useState(() => new Set());
  // Which submission the editing state above belongs to — set by openResultModal
  // so the auto-save below can tell "editor loaded" from "not this paper yet".
  const [editorSubmissionId, setEditorSubmissionId] = useState(null);
  // Set while the auto-save on open is confirming the displayed result, so the
  // unconfirmed-edits autosave does not store a copy of what is being confirmed.
  const [autoSavingOpenFor, setAutoSavingOpenFor] = useState(null);

  const editHistory = useMarkingEditHistory({
    questions: editingQuestions,
    summary: editingSummary,
    setQuestions: setEditingQuestions,
    setSummary: setEditingSummary,
    resetKey: resultModal
      ? resultModal.student?.submissionId || resultModal.submissionId || "open"
      : null,
  });

  const [errorViewer, setErrorViewer] = useState({ open: false, title: "", message: null });

  // Per-assignment settings (expectedPages + maxGrade). Seeded from the
  // assignment index row, which already carries both.
  const assignmentSettings = useGradingAssignmentSettings(
    PROVIDER,
    selectedAssignment?.id ?? null,
    selectedAssignment
  );

  // Advisory pre-grading page-count review.
  const { pageCheckModal, confirmGradingPageCounts, resolvePageCheck } = usePageCountCheck();
  const [pageCountFlags, setPageCountFlags] = useState({});
  const applyPageCountReport = useCallback(
    (report) => setPageCountFlags((prev) => ({ ...prev, ...buildPageCountFlagMap(report) })),
    []
  );

  // Advisory pre-grading orientation review.
  const { orientationCheckModal, confirmGradingOrientations, resolveOrientationCheck } = useOrientationCheck();
  const [orientationFlags, setOrientationFlags] = useState({});
  const applyOrientationReport = useCallback(
    (report) => setOrientationFlags((prev) => ({ ...prev, ...buildOrientationFlagMap(report) })),
    []
  );

  const confirmPreGradingChecks = async (eligible) => {
    const proceedPageCount = await confirmGradingPageCounts({
      provider: PROVIDER,
      assignmentId: selectedAssignment.id,
      submissionIds: eligible.map((s) => s.submissionId),
      onReport: applyPageCountReport,
    });
    if (!proceedPageCount) return false;
    return confirmGradingOrientations({
      provider: PROVIDER,
      assignmentId: selectedAssignment.id,
      submissionIds: eligible.map((s) => s.submissionId),
      onReport: applyOrientationReport,
    });
  };

  // Cache of fetched PDFs per submission (avoids re-downloading base64 from LoginCSS).
  const pdfCacheRef = useRef({});

  const resolvePdfSummary = (submissionId, result) => getMarkingResultSummary(result, {});

  // A configured maxGrade outranks the partner's own assignment total — it is
  // what the backend clamps to, so the UI must agree.
  const effectiveMaxTotal = resolveDisplayMaxTotal({
    assignmentMaxPoints:
      assignmentSettings.settings.maxGrade ?? (Number(selectedAssignment?.grade) || null),
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

  // Read-only mark scheme preview (right column of the results modal).
  // Mark scheme is per-submission here; source it from the cached msFile.
  const msPreviewRef = useRef({ submissionId: null, url: null });
  const [markSchemePreviewUrl, setMarkSchemePreviewUrl] = useState(null);
  const [markSchemeLoading, setMarkSchemeLoading] = useState(false);
  const [markSchemeError, setMarkSchemeError] = useState(null);

  useEffect(() => {
    const sid = resultModal?.submissionId;
    if (!sid) {
      setMarkSchemePreviewUrl(null);
      setMarkSchemeError(null);
      return;
    }
    if (msPreviewRef.current.submissionId === sid && msPreviewRef.current.url) {
      setMarkSchemePreviewUrl(msPreviewRef.current.url);
      return;
    }
    let cancelled = false;
    setMarkSchemeLoading(true);
    setMarkSchemeError(null);
    fetchPdfs(sid)
      .then((entry) => {
        if (cancelled) return;
        if (!entry?.msFile) {
          setMarkSchemePreviewUrl(null);
          return;
        }
        const url = URL.createObjectURL(entry.msFile);
        if (msPreviewRef.current.url && msPreviewRef.current.submissionId !== sid) {
          URL.revokeObjectURL(msPreviewRef.current.url);
        }
        msPreviewRef.current = { submissionId: sid, url };
        setMarkSchemePreviewUrl(url);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[markscheme preview]", err);
        setMarkSchemeError("Failed to load mark scheme");
        setMarkSchemePreviewUrl(null);
      })
      .finally(() => { if (!cancelled) setMarkSchemeLoading(false); });
    return () => { cancelled = true; };
  }, [resultModal?.submissionId, fetchPdfs]);

  // Revoke the cached mark scheme object URL on unmount.
  useEffect(() => () => {
    if (msPreviewRef.current.url) URL.revokeObjectURL(msPreviewRef.current.url);
  }, []);

  const {
    annotatedPreviewUrl,
    previewLoading,
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmedSnapshot,
    confirmEdits,
    buildEditedResult,
    resetToConfirmed,
    revertPreviewToConfirmed,
    reportPageCount,
  } = useExternalAnnotatedPreview({
    resultModal,
    editingQuestions,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    editingMaxTotal,
    resolvePdfSummary,
    getStudentFile,
    pendingRemovedIndices,
  });

  const handleAnnotationPlacementChange = useCallback((change) => {
    setEditingQuestions((prev) => applyPlacementChange(prev, change));
  }, []);

  const handleQuestionRemove = useCallback((questionIndex) => {
    setPendingRemovedIndices((prev) => {
      const next = new Set(prev);
      next.add(questionIndex);
      return next;
    });
    const removed = editingQuestions[questionIndex];
    if (removed != null) {
      toast.info(`Q${removed.questionNumber} will be removed when you confirm edits`);
    }
  }, [editingQuestions]);

  const resultModalSubmissionId =
    resultModal?.submissionId || resultModal?.student?.submissionId || null;

  useEffect(() => {
    setPendingRemovedIndices(new Set());
  }, [resultModalSubmissionId]);

  // ── Unconfirmed edits: autosave + restore ─────────────────────────────────
  // Everything typed in this modal is kept server-side while it is unconfirmed,
  // so closing the tab no longer loses it, and dropped automatically after 24h if
  // nobody ever confirms. See hooks/usePendingEditsAutosave.js.
  const applyRestoredEdits = useCallback((restored) => {
    setEditingQuestions((restored.questions || []).map((q) => ({ ...q })));
    setEditingAnnotations(getTeacherAnnotations(restored).map((a) => ({ ...a })));
    // Marked as touched so the auto-rebuild does not immediately overwrite the
    // summary the grader had actually written.
    setEditingSummary(restored.summary || "");
    setSummaryTouched(true);
    setPendingRemovedIndices(new Set());
    // A hand-set paper total is part of the edits, so it comes back too.
    const restoredMax = Number(restored.maxTotalMarks);
    setEditingMaxTotal(Number.isFinite(restoredMax) && restoredMax > 0 ? restoredMax : null);
  }, []);

  const pendingEdits = usePendingEditsAutosave({
    submissionId: resultModalSubmissionId,
    ready: editorSubmissionId === resultModalSubmissionId,
    dirty: hasPendingEdits,
    buildResult: buildEditedResult,
    pauseSaves: autoSavingOpenFor === resultModalSubmissionId,
    load: async (submissionId) => {
      const { data } = await api.get(
        `/external-grading/submissions/${submissionId}/pending-edits`
      );
      return data?.pendingEdits || null;
    },
    save: (submissionId, result) =>
      api.put(`/external-grading/submissions/${submissionId}/pending-edits`, { result }),
    discard: (submissionId) =>
      api.delete(`/external-grading/submissions/${submissionId}/pending-edits`),
    onRestore: applyRestoredEdits,
    onDiscard: () => {
      const confirmed = resetToConfirmed();
      if (!confirmed) return;
      setEditingQuestions(confirmed.questions);
      setEditingAnnotations(confirmed.teacherAnnotations);
      setEditingSummary(confirmed.summary);
      setSummaryTouched(false);
      setEditingMaxTotal(null);
      setPendingRemovedIndices(new Set());
      toast.info("Unconfirmed edits discarded");
    },
  });

  const questionsForDisplay = useMemo(
    () => filterQuestionsPendingRemoval(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

  const placementQuestions = useMemo(
    () => buildPlacementQuestions(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

  // Auto-rebuild the editable summary from current marks/feedback until the
  // teacher manually edits it (summaryTouched).
  useEffect(() => {
    if (!resultModal || summaryTouched) return;
    setEditingSummary(
      rebuildMarkingSummary({
        questions: questionsForDisplay,
        maxTotalMarks: effectiveMaxTotal,
        previousSummary:
          resultModal.result?.summary ||
          getMarkingResultSummary(resultModal.result, {}),
      })
    );
  }, [resultModal, questionsForDisplay, effectiveMaxTotal, summaryTouched]);

  // ── Defensive normalisation of the LoginCSS list envelope ──
  const normalizeItem = (raw) => {
    const id = raw.id ?? raw.submissionId ?? raw._id;
    const draftResult = raw.draftResult ?? null;
    return {
      ...raw,
      submissionId: id,
      name:
        raw.studentName ||
        raw.student?.name ||
        raw.name ||
        raw.title ||
        (id != null ? `Submission #${id}` : "Submission"),
      // True when LoginCSS sent no student name, so the row title is the
      // "Submission #id" placeholder — the id sub-line is redundant there.
      nameIsFallback: !(
        raw.studentName ||
        raw.student?.name ||
        raw.name ||
        raw.title
      ),
      // LoginCSS names this `submission_date` — the other three are never
      // present in its payload, which is why this column read empty.
      submittedAt:
        raw.submission_date ||
        raw.created_at ||
        raw.createdAt ||
        raw.submittedAt ||
        null,
      localStatus: raw.localStatus ?? (draftResult ? "grading" : null),
      localGrade:
        raw.localGrade ?? (draftResult ? resolveTotalMarksFromResult(draftResult) : null),
      hasFeedbackPdf: !!raw.hasFeedbackPdf,
      assignment: raw.assignment ?? null,
    };
  };

  // The assignment index — one row per assignment, grouped by the server.
  //
  // This used to download every submission and group them client-side. With the
  // marking drafts included that was ~2.9 MB over four requests just to render a
  // list of three assignment names; the grouped form is under a kilobyte.
  const loadAssignments = useCallback(async () => {
    setLoadingAssignments(true);
    try {
      const { data } = await api.get("/external-grading/submissions/assignments");
      setSessionError(null);
      setAssignmentIndex(
        (data?.assignments || []).map((a) => ({
          key: a.id != null ? String(a.id) : "__none__",
          id: a.id ?? null,
          name: a.name || "Unassigned",
          grade: a.grade ?? null,
          dueDate: a.due_date || null,
          count: a.count ?? 0,
          graded: a.graded ?? 0,
          // Present only when the director delegated this assignment to the
          // signed-in account: { role, deadline, status }.
          myDelegation: a.myDelegation || null,
        }))
      );
      setListTotal(data?.total ?? 0);
    } catch (err) {
      console.error("Failed to load assignments", err);
      if (err.response?.status === 401 || err.isSessionExpired) {
        setSessionError(err.sessionMessage || "Your session has expired. Please sign in again.");
        setAssignmentIndex([]);
        setListTotal(0);
      } else {
        toast.error((await getApiErrorMessage(err)) || "Failed to load assignments");
      }
    } finally {
      setLoadingAssignments(false);
    }
  }, []);

  // ONE page of ONE assignment's submissions.
  //
  // Paged on the server rather than downloading the assignment and slicing in
  // the browser: with the marking drafts attached, a 100-submission assignment
  // was ~2.9 MB, against ~30 KB for the ten rows actually on screen.
  //
  // `includeDrafts` is affordable at this size and keeps "✅ Results" and grades
  // populated for the visible rows without a second request each.
  const loadAssignmentSubmissions = useCallback(async (assignment, pageNum = 1) => {
    if (!assignment) return;
    setLoadingList(true);
    try {
      const { data } = await api.get("/external-grading/submissions", {
        params: {
          ...(assignment.id != null ? { assignmentId: assignment.id } : {}),
          page: pageNum,
          per_page: PER_PAGE,
          includeDrafts: 1,
        },
      });
      const items = data?.data || [];

      const collected = [];
      const hydrated = {};
      for (const raw of items) {
        collected.push(normalizeItem(raw));
        const sid = raw.id ?? raw.submissionId ?? raw._id;
        if (sid != null && raw.draftResult) {
          hydrated[sid] = {
            result: raw.draftResult,
            originalAiResult: raw.draftOriginalAiResult || raw.draftResult,
            studentFile: undefined,
          };
        }
      }

      setSubmissions(collected);
      setListMeta({
        total: data?.total ?? collected.length,
        lastPage: data?.last_page ?? 1,
      });
      // In-memory results (prev) win over server drafts — keep fresher local edits.
      setResults((prev) => ({ ...hydrated, ...prev }));
    } catch (err) {
      console.error("Failed to load submissions", err);
      toast.error((await getApiErrorMessage(err)) || "Failed to load submissions");
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Every submission in the open assignment, without the draft payloads.
  //
  // Bulk and batch marking act on the whole assignment, not the page on screen,
  // so they cannot read the paged `submissions` state. This is the cheap full
  // roster — `hasDraft` stands in for "already has a result", which is in fact
  // more accurate than the old check, since that only saw loaded pages.
  const fetchAssignmentRoster = useCallback(async (assignment) => {
    const { data } = await api.get("/external-grading/submissions", {
      params: {
        ...(assignment.id != null ? { assignmentId: assignment.id } : {}),
        per_page: 1000,
      },
      timeout: 120000,
    });
    return (data?.data || []).map(normalizeItem);
  }, []);

  // Keep the ref and the rendered copy of the search roster in step.
  const applySearchRoster = useCallback((rows) => {
    searchRosterRef.current = rows;
    setSearchRoster(rows);
  }, []);

  // Reload whatever the manager is currently looking at.
  const loadAll = useCallback(async () => {
    await loadAssignments();
    if (selectedAssignmentRef.current) {
      await loadAssignmentSubmissions(selectedAssignmentRef.current, pageRef.current);
      // A cached search roster would otherwise keep serving pre-refresh rows.
      if (searchRosterRef.current) {
        try {
          applySearchRoster(await fetchAssignmentRoster(selectedAssignmentRef.current));
        } catch {
          applySearchRoster(null);
        }
      }
    }
  }, [loadAssignments, loadAssignmentSubmissions, fetchAssignmentRoster, applySearchRoster]);

  // ── Reconcile our copy against LoginCSS ──
  // The list above is served from our own database, which the webhook keeps in
  // step. This pulls LoginCSS's full list to recover anything a delivery missed
  // (e.g. dropped while the server was restarting). Grading work is never
  // overwritten — only LoginCSS-owned fields are refreshed — so it is always
  // safe to run. Reloads the list afterwards only when something actually moved.
  const syncFromProvider = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/external-grading/sync", null, { timeout: 120000 });
      const inserted = data?.inserted ?? 0;
      const updated = data?.updated ?? 0;

      if (inserted || updated) {
        toast.success(
          `Synced — ${inserted} new, ${updated} updated of ${data?.fetched ?? 0}`
        );
        await loadAll();
      } else {
        toast.info(`Already up to date — ${data?.fetched ?? 0} submissions in sync`);
      }
    } catch (err) {
      console.error("Failed to sync from LoginCSS", err);
      toast.error((await getApiErrorMessage(err)) || "Failed to sync from LoginCSS");
    } finally {
      setSyncing(false);
    }
  }, [loadAll]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return navigate("/login");
    const parsed = JSON.parse(stored);
    if (canGradeProvider("logincss", delegations)) {
      setUser(parsed);
      return;
    }
    // A director delegation can still grant this tab, and it arrives with a
    // fetch — bouncing before it lands would eject the very people this page
    // was just handed to. Until then the page renders nothing (user is null).
    if (!delegationsLoaded) return;
    // This tab is served by both the manager and assistant portals, so bounce a
    // denied user to their own dashboard rather than the manager one, which
    // RoleProtectedRoute would reject for them anyway.
    navigate(getDashboardPathForUser(parsed) || "/login", { replace: true });
  }, [navigate, delegations, delegationsLoaded]);

  useEffect(() => {
    selectedAssignmentRef.current = selectedAssignment;
  }, [selectedAssignment]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // A selection belongs to one assignment — never carry it across a switch.
  useEffect(() => {
    markingSelection.clear();
  }, [selectedAssignment?.id]);

  // "Select all" spans the whole assignment, not the page on screen, so it needs
  // the full roster rather than the ten rows currently loaded.
  const selectAllSubmissionsForMarking = async () => {
    if (!selectedAssignment) return;
    setSelectingMarkingAll(true);
    try {
      const roster = await fetchAssignmentRoster(selectedAssignment);
      const ids = roster.map((s) => s.submissionId).filter((id) => id != null);
      markingSelection.selectIds(ids);
      toast.success(`Selected ${ids.length} submission(s)`);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to load all submissions");
    } finally {
      setSelectingMarkingAll(false);
    }
  };

  // Pull the whole assignment once so search can reach rows the current page
  // never loaded. Fetched from the search box rather than an effect so the
  // request only happens when someone actually types.
  const ensureSearchRoster = async () => {
    if (!selectedAssignment || searchRosterRef.current || loadingSearchRoster) return;
    setLoadingSearchRoster(true);
    try {
      applySearchRoster(await fetchAssignmentRoster(selectedAssignment));
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to search all submissions");
    } finally {
      setLoadingSearchRoster(false);
    }
  };

  const onSearchChange = (value) => {
    const wasSearching = !!search.trim();
    setSearch(value);
    setPage(1);
    if (value.trim()) {
      ensureSearchRoster();
    } else if (wasSearching && selectedAssignment) {
      // Searching pages through memory; clearing it hands paging back to the
      // server, which needs page 1 loaded to match the reset page number.
      loadAssignmentSubmissions(selectedAssignment, 1);
    }
  };

  // Narrow a roster to the ticked rows (an empty selection means the whole
  // assignment) and drop anything already marked or published. Returns null —
  // after explaining why — when nothing is left to mark.
  const resolveEligibleForMarking = (roster) => {
    const selectedIds = markingSelection.selectedIds;
    const pool = selectedIds.size
      ? roster.filter((s) => s.submissionId != null && selectedIds.has(s.submissionId))
      : roster;

    if (selectedIds.size && !pool.length) {
      toast.warn("Selected submissions were not found in this assignment");
      return null;
    }

    const eligible = pool.filter(
      (s) =>
        s.submissionId &&
        s.localStatus !== "done" &&
        !s.hasDraft &&
        !results[s.submissionId]?.result
    );

    if (!eligible.length) {
      toast.warn(
        selectedIds.size
          ? "Selected submissions are already marked"
          : "No submissions left to mark in this assignment"
      );
      return null;
    }

    if (selectedIds.size && eligible.length < pool.length) {
      toast.info(
        `${eligible.length} of ${pool.length} selected will be marked (others already marked)`
      );
    }

    return eligible;
  };

  useEffect(() => {
    loadAssignments();
    // An assignment persisted from a previous visit is still open on mount, so
    // its submissions need fetching too.
    if (selectedAssignmentRef.current) {
      loadAssignmentSubmissions(selectedAssignmentRef.current, pageRef.current);
    }
  }, [loadAssignments, loadAssignmentSubmissions]);

  // Saved prompts and the model list only feed the marking controls.
  useEffect(() => {
    if (!canMark) return;
    api.get("/marking/prompts").then((r) => setSavedPrompts(r.data || [])).catch(() => {});
    api.get("/marking/gemini-models")
      .then((r) => {
        const { models } = parseGeminiModelsResponse(r.data);
        setGeminiModels(models);
        setGeminiModel((prev) => pickValidGeminiModel(models, prev));
      })
      .catch(() => {});
  }, [canMark]);

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
    setEditingAnnotations(getTeacherAnnotations(result).map((a) => ({ ...a })));
    setEditingSummary(getMarkingResultSummary(result, {}) || "");
    setSummaryTouched(false);
    setAnnotationsPanelOpen(false);
    setEditingMaxTotal(null);
    setEditingTotal(null);
    setEditorSubmissionId(student.submissionId);
  };

  const handleCorrectionPatch = useCallback(({ questions, summary }) => {
    setEditingQuestions(questions.map((q) => ({ ...q })));
    if (summary) {
      setEditingSummary(summary);
      setSummaryTouched(true);
    }
  }, []);

  const openGuidanceModal = (student, opts = {}) => {
    setGuidance(resolveMarkingGuidanceText("", assignmentPrompt.content));
    setGuidanceModal({ student, ...opts });
  };

  const handleRunMsVerification = async (extraInstructions = "") => {
    if (selectedAssignment?.id == null) return;
    setMsVerifying(true);
    setMsVerifyResult(null);
    try {
      // `grading: true` is required — see the note on assignmentPrompt above.
      const result = await runMarkSchemeVerification(
        String(selectedAssignment.id),
        extraInstructions,
        { grading: true, provider: PROVIDER }
      );
      setMsVerifyResult(result);
      if (result.status === "pass") toast.success("Mark scheme verification passed");
      else if (result.status === "fail") toast.error("Mark scheme verification failed — review before marking");
      else toast.warn("Mark scheme verification completed with warnings");
    } catch (err) {
      toast.error(err.response?.data?.message || "Mark scheme verification failed");
    } finally {
      setMsVerifying(false);
    }
  };

  const handleGuidanceConfirm = (provider = "gemini") => {
    const gm = guidanceModal;
    const resolvedGuidance = resolveMarkingGuidanceText(guidance, assignmentPrompt.content);
    setGuidanceModal(null);
    if (!gm) return;
    if (gm.batch) runBatchMark(resolvedGuidance, markingModeModal);
    else if (gm.priorityBulk) runBulkMark(resolvedGuidance, markingModeModal, "priority");
    else if (gm.bulk) runBulkMark(resolvedGuidance, markingModeModal, provider);
    else if (gm.priority) runMarkSubmission(gm.student, resolvedGuidance, markingModeModal, "priority");
    else runMarkSubmission(gm.student, resolvedGuidance, markingModeModal, provider);
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
    if (selectedAssignment?.id != null) {
      appendMarkingContext(fd, { assignmentId: String(selectedAssignment.id) });
    }
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

  // ── Server-side draft persistence (survives refresh / other devices) ──
  // Only the result JSON is stored; studentFile is always re-fetchable from LoginCSS.
  const saveDraft = async (submissionId, result, originalAiResult) => {
    try {
      const { data } = await api.put(`/external-grading/submissions/${submissionId}/draft`, {
        result,
        originalAiResult: originalAiResult || result,
      });
      return data?.finalResult || result;
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to save grading draft");
      throw err;
    }
  };

  const deleteDraft = (submissionId) =>
    api.delete(`/external-grading/submissions/${submissionId}/draft`).catch(() => {});

  const recordMarkResult = (submissionId, result, studentFile, { persist = true } = {}) => {
    const originalAiResult = JSON.parse(JSON.stringify(result));
    setResults((prev) => ({
      ...prev,
      [submissionId]: {
        result,
        originalAiResult,
        studentFile,
      },
    }));
    // Batch marking already persists drafts server-side — skip the redundant PUT.
    if (persist) saveDraft(submissionId, result, originalAiResult);
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

  // ── Bulk mark: mark every unmarked submission in the selected assignment ──
  const runBulkMark = async (guidanceText, mode = "normal", provider = "gemini") => {
    if (!selectedAssignment) {
      toast.warn("Select an assignment first");
      return;
    }
    const isPriority = provider === "priority";
    const stopRef = isPriority ? priorityStopRef : bulkStopRef;
    stopRef.current = false;
    if (isPriority) setPriorityBulkRunning(true);
    else setBulkMarking(true);
    try {
      // The whole assignment, not the page on screen — `submissions` only holds
      // the current page now. Ticked rows narrow it further.
      const roster = await fetchAssignmentRoster(selectedAssignment);
      const eligible = resolveEligibleForMarking(roster);
      if (!eligible) return;

      // Advisory page-count / orientation review before any tokens are spent.
      // Returning here still runs the finally block, which clears the running flags.
      const proceed = await confirmPreGradingChecks(eligible);
      if (!proceed) return;

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

  // ── Server-side batch marking (upload → submit → poll) ──
  // Results are written to each submission's LoginCSS draft server-side, so on
  // success we hydrate straight from the returned results (falling back to a full
  // re-fetch of the drafts). The per-assignment job lives in assignmentBatchJobStore
  // so it survives navigation between assignments and page reloads.

  const pollBatchJob = useCallback(
    (jobId, jobMeta = {}) => {
      const assignId = jobMeta.assignmentId || (selectedAssignment?.id != null ? String(selectedAssignment.id) : null);
      if (!assignId || !jobId) return;
      if (isBatchStopped(assignId)) return;

      clearBatchPoll(jobId);

      const doPoll = async () => {
        if (isBatchStopped(assignId)) return;
        try {
          const { data } = await api.get(`/external-grading/mark-batch/status/${jobId}`);

          if (data.state === "JOB_STATE_PENDING" || data.state === "JOB_STATE_RUNNING") {
            patchBatchJob(assignId, (prev) => ({ ...prev, phase: "processing", jobId }));
            return;
          }

          clearBatchPoll(jobId);

          if (data.state === "JOB_STATE_FAILED") {
            patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
            toast.error("Batch marking job failed.");
            return;
          }

          // JOB_STATE_SUCCEEDED (or any terminal success) — hydrate results.
          const results = Array.isArray(data.results) ? data.results : null;
          if (results) {
            let ok = 0;
            let failed = 0;
            for (const r of results) {
              const submissionId = r.submissionId ?? r.submission_id;
              if (submissionId == null) continue;
              if (r.success && r.result) {
                // Backend already persisted the draft — skip the redundant PUT.
                recordMarkResult(submissionId, r.result, undefined, { persist: false });
                ok += 1;
              } else {
                const message =
                  typeof r.error === "string"
                    ? r.error
                    : r.error?.message || "Batch marking failed";
                setStudentErrors((prev) => ({ ...prev, [submissionId]: { message } }));
                failed += 1;
              }
            }
            if (ok === 0) {
              toast.error(
                results.length === 0
                  ? "Batch finished with 0 results — Gemini returned nothing. Retry or check API/quota."
                  : `Batch finished — 0 marked${failed ? ` (${failed} failed)` : ""}`
              );
            } else {
              toast.success(
                `Batch complete — ${ok} submission${ok === 1 ? "" : "s"} marked${failed ? `, ${failed} failed` : ""}.`
              );
            }
          } else {
            // No inline results — re-hydrate drafts from the server.
            loadAll();
            toast.success("Batch complete — results loaded.");
          }

          // Keep the job around (instead of clearing it) when this batch was
          // capped by the first-ever-grading safety gate — otherwise the
          // "awaiting confirmation" banner would vanish the moment this poll
          // completes, even though nothing has been confirmed yet.
          patchBatchJob(assignId, (prev) =>
            prev?.firstBatch?.status === "pending_confirmation" ? { ...prev, phase: "done" } : null
          );
        } catch (err) {
          clearBatchPoll(jobId);
          patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
          toast.error((await getApiErrorMessage(err)) || "Failed to check batch status");
        }
      };

      doPoll();
      registerBatchPoll(jobId, setInterval(doPoll, 15000));
    },
    [selectedAssignment?.id, loadAll]
  );

  const runBatchMark = async (guidanceText, mode = "normal") => {
    if (!selectedAssignment || selectedAssignment.id == null) {
      toast.warn("Batch marking needs a real assignment — pick an assignment with a LoginCSS id.");
      return;
    }
    const assignId = String(selectedAssignment.id);

    // The whole assignment, not the page on screen — `submissions` only holds
    // the current page now. Ticked rows narrow it further.
    const roster = await fetchAssignmentRoster(selectedAssignment);
    const eligible = resolveEligibleForMarking(roster);
    if (!eligible) return;

    // Advisory page-count / orientation review before any tokens are spent.
    // Passes silently when nothing is flagged.
    const proceed = await confirmPreGradingChecks(eligible);
    if (!proceed) return;

    const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
    if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

    setBatchStopped(assignId, false);
    patchBatchJob(assignId, {
      phase: "uploading",
      total: eligible.length,
      mode,
      geminiModel: selectedModel,
      batchSubmissions: eligible.map((s) => ({ submissionId: s.submissionId, name: s.name })),
    });

    // Step 1 — upload student PDFs + shared mark scheme.
    let msUri;
    let succeeded;
    let failed;
    try {
      const res = await api.post("/external-grading/mark-batch/upload", {
        assignmentId: selectedAssignment.id,
        submissions: eligible.map((s) => ({ submissionId: s.submissionId })),
        markingMode: mode,
      }, { timeout: 900_000 });
      ({ msUri, succeeded, failed } = res.data || {});
    } catch (err) {
      patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
      toast.error((await getApiErrorMessage(err)) || "Batch upload failed");
      return;
    }

    if (isBatchStopped(assignId)) {
      patchBatchJob(assignId, null);
      return;
    }

    if (failed?.length) {
      toast.warning(`${failed.length} submission(s) could not be uploaded`);
      failed.forEach((f) => {
        const submissionId = f.submissionId ?? f.submission_id ?? f.student?.submissionId;
        if (submissionId == null) return;
        const message =
          typeof f.error === "string" ? f.error : f.error?.message || "Upload failed";
        setStudentErrors((prev) => ({ ...prev, [submissionId]: { message } }));
      });
    }

    if (!succeeded?.length) {
      patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
      toast.error("No valid submissions to mark.");
      return;
    }

    // Step 2 — submit the batch job.
    patchBatchJob(assignId, (prev) => ({ ...prev, phase: "submitting" }));

    let jobId;
    let firstBatch;
    try {
      const res = await api.post("/external-grading/mark-batch/submit", {
        assignmentId: selectedAssignment.id,
        msUri,
        succeeded,
        markingMode: mode,
        guidance: guidanceForForm(guidanceText),
        // A configured maxGrade wins over the partner's own assignment total.
        ...((assignmentSettings.settings.maxGrade ?? selectedAssignment.grade) != null
          ? { totalGrade: assignmentSettings.settings.maxGrade ?? selectedAssignment.grade }
          : {}),
        geminiModel: selectedModel,
      }, { timeout: 300_000 });
      jobId = res.data?.jobId;
      firstBatch = res.data?.firstBatch;
    } catch (err) {
      if (err.response?.data?.reason === "first_batch_pending") {
        toast.info("This assignment's first batch is awaiting confirmation.");
        patchBatchJob(assignId, (prev) => ({
          ...prev,
          phase: "done",
          firstBatch: err.response.data.firstBatch,
        }));
        return;
      }
      // A job is already running for this assignment — resume it.
      if (err.response?.status === 409 && err.response.data?.jobId) {
        jobId = err.response.data.jobId;
        toast.info("Resuming existing batch job…");
      } else {
        patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
        toast.error((await getApiErrorMessage(err)) || "Batch submission failed");
        return;
      }
    }

    if (!jobId) {
      patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
      toast.error("Batch submission did not return a job id");
      return;
    }

    patchBatchJob(assignId, (prev) => ({ ...prev, phase: "processing", jobId, firstBatch }));
    pollBatchJob(jobId, { assignmentId: assignId, mode, geminiModel: selectedModel });
  };

  // Confirms a capped first batch (see backend firstBatchGate.js) and waits
  // for the server's auto-triggered "mark the rest" run to create its batch
  // job, then hands off to the normal poll — reuses the same active-job
  // discovery this page already runs on mount.
  const confirmFirstBatch = async () => {
    if (!selectedAssignment || selectedAssignment.id == null || !batchJob?.firstBatch) return;
    const assignId = String(selectedAssignment.id);
    const ok = await confirmToast(
      "This will mark the remaining submissions for this assignment now. Continue?",
      { title: "Confirm & Mark Rest", confirmLabel: "Confirm & Mark Rest" }
    );
    if (!ok) return;

    try {
      await api.post(`/external-grading/first-batch/confirm/${selectedAssignment.id}`);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to confirm first batch");
      return;
    }

    toast.info("Confirmed — marking the remaining submissions…");
    patchBatchJob(assignId, (prev) => ({
      ...prev,
      firstBatch: { ...(prev?.firstBatch || {}), status: "confirming" },
    }));

    let attempts = 0;
    const maxAttempts = 60; // ~5 minutes — roster sync + PDF upload/fetch can be slow
    const tryDiscover = async () => {
      attempts += 1;
      await checkForActiveJob();
      const current = getBatchJob(assignId);
      if (current?.jobId && current.phase === "processing") return;
      if (attempts < maxAttempts) {
        setTimeout(tryDiscover, 5000);
        return;
      }
      // Gave up looking for the job — the server-side run is fire-and-forget
      // and may still be working (roster sync + uploads can outlast this
      // window). Stop polling rather than leaving a spinner stuck forever.
      patchBatchJob(assignId, (prev) =>
        prev?.firstBatch?.status === "confirming"
          ? { ...prev, firstBatch: { ...prev.firstBatch, status: "confirmed_pending" } }
          : prev
      );
    };
    setTimeout(tryDiscover, 5000);
  };

  const stopBatchMark = async () => {
    if (!selectedAssignment || selectedAssignment.id == null) return;
    const assignId = String(selectedAssignment.id);
    setBatchStopped(assignId, true);

    const jobId = batchJob?.jobId;
    if (jobId) clearBatchPoll(jobId);
    patchBatchJob(assignId, null);

    if (jobId) {
      try {
        await api.delete(`/external-grading/mark-batch/cancel/${jobId}`);
        toast.info("Batch marking cancelled");
      } catch (err) {
        toast.warning(
          (await getApiErrorMessage(err)) || "Batch stop requested — server cancel failed"
        );
      }
    } else {
      toast.info("Batch marking stopped");
    }
  };

  const checkForActiveJob = useCallback(async () => {
    if (!canMark) return;
    if (!selectedAssignment || selectedAssignment.id == null) return;
    const assignId = String(selectedAssignment.id);
    try {
      const { data } = await api.get(`/external-grading/mark-batch/active/${selectedAssignment.id}`);
      const active = data?.active;
      const jobId = active?.jobId || (data?.jobId && data?.active !== false ? data.jobId : null);
      if (active && jobId) {
        setBatchStopped(assignId, false);
        patchBatchJob(assignId, {
          phase: "processing",
          jobId,
          mode: active.markingMode || active.mode || "normal",
          geminiModel: pickValidGeminiModel(geminiModels, active.geminiModel || geminiModel),
        });
        pollBatchJob(jobId, { assignmentId: assignId });
      }
    } catch (err) {
      console.error("checkForActiveJob:", err?.message);
    }
  }, [canMark, selectedAssignment?.id, geminiModels, geminiModel, pollBatchJob]);

  // Subscribe the panel to this assignment's batch job (survives navigation).
  useEffect(() => {
    if (selectedAssignment?.id == null) {
      setBatchJob(null);
      return;
    }
    return subscribeBatchJob(String(selectedAssignment.id), setBatchJob);
  }, [selectedAssignment?.id]);

  // Resume polling a running job whenever an assignment is selected.
  useEffect(() => {
    if (selectedAssignment?.id == null) return;
    checkForActiveJob();
  }, [selectedAssignment?.id, checkForActiveJob]);

  // The list no longer carries the marking JSON (it dominated the payload), so a
  // result that isn't already in memory is fetched on demand here. `hasDraft` on
  // the row is what makes the button appear, so the button survives a reload
  // even though its content hasn't been downloaded yet.
  const openSavedResult = async (student) => {
    const saved = results[student.submissionId];
    if (saved?.result) {
      openResultModal(student, saved.result, saved.originalAiResult || saved.result, saved.studentFile);
      return;
    }
    if (!student.hasDraft) return;

    try {
      const { data } = await api.get(
        `/external-grading/submissions/${student.submissionId}/draft`
      );
      if (!data?.draftResult) return;

      const entry = {
        result: data.draftResult,
        originalAiResult: data.draftOriginalAiResult || data.draftResult,
        studentFile: undefined,
      };
      // Cache so reopening is instant and edits have somewhere to land.
      setResults((prev) => ({ ...prev, [student.submissionId]: entry }));
      openResultModal(student, entry.result, entry.originalAiResult, undefined);
    } catch (err) {
      console.error("Failed to load saved result", err);
      toast.error((await getApiErrorMessage(err)) || "Failed to load saved result");
    }
  };

  const deleteResult = (student) => {
    const id = student.submissionId;
    deleteDraft(id);
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
    const appliedQuestions = questionsForConfirmEdits(
      editingQuestions,
      pendingRemovedIndices
    ).map((q) => ({ ...q }));
    try {
      const finalResult = await confirmEdits(async ({ finalResult, submissionId }) => {
        const canonical = await saveDraft(
          submissionId,
          finalResult,
          results[submissionId]?.originalAiResult || resultModal?.originalAiResult
        );
        setResults((prev) => ({
          ...prev,
          [submissionId]: { ...(prev[submissionId] || {}), result: canonical },
        }));
        setResultModal((prev) => ({ ...prev, result: canonical }));
        setEditingSummary(canonical.summary || "");
        setSummaryTouched(false);
        setEditingMaxTotal(null);
        setEditingTotal(null);
        setSubmissions((prev) =>
          prev.map((s) =>
            s.submissionId === submissionId
              ? { ...s, localGrade: resolveTotalMarksFromResult(canonical) }
              : s
          )
        );
        return canonical;
      });
      if (finalResult) {
        setEditingQuestions(
          (finalResult.finalQuestions || finalResult.questions || appliedQuestions).map(
            (q) => ({ ...q })
          )
        );
        setPendingRemovedIndices(new Set());
        toast.success("Edits confirmed — preview and grade updated");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to confirm edits");
    }
  };

  // ── Auto-save on open ─────────────────────────────────────────────────────
  // The modal shows a rebuilt summary and normalised totals rather than the raw
  // marking JSON, so an untouched paper used to read as "pending edits" and had
  // to be confirmed by hand before it could be published. Save the displayed
  // version to the draft once per paper instead, so Confirm Edits is only ever
  // needed for real edits. Questions are shown verbatim here, so this save
  // never registers as a correction (see services/gradingEditStats.js).
  const autoSavedResultsRef = useRef(new Set());
  const autoSaveOpenedResultRef = useRef(null);

  autoSaveOpenedResultRef.current = async () => {
    await confirmEdits(async ({ finalResult, submissionId }) => {
      setResults((prev) => ({
        ...prev,
        [submissionId]: { ...(prev[submissionId] || {}), result: finalResult },
      }));
      saveDraft(
        submissionId,
        finalResult,
        results[submissionId]?.originalAiResult || resultModal?.originalAiResult
      );
      setResultModal((prev) => ({ ...prev, result: finalResult }));
      setEditingSummary(finalResult.summary || "");
      setSummaryTouched(false);
      setSubmissions((prev) =>
        prev.map((s) =>
          s.submissionId === submissionId
            ? { ...s, localGrade: resolveTotalMarksFromResult(finalResult) }
            : s
        )
      );
    });
  };

  useEffect(() => {
    const sid = resultModalSubmissionId;
    if (!sid) return;
    if (editorSubmissionId !== sid) return;
    if (!confirmedSnapshot || confirmedSnapshot.submissionId !== sid) return;
    // Never auto-confirm on top of edits somebody made and did not confirm —
    // wait for that check, and stand down entirely if any were restored.
    if (pendingEdits.status !== "none") return;
    // Keyed by marking run so a re-mark of the same paper is saved again.
    const key = `${sid}:${resultModal?.result?.markingRunId || ""}`;
    if (autoSavedResultsRef.current.has(key)) return;
    autoSavedResultsRef.current.add(key);
    setAutoSavingOpenFor(sid);
    autoSaveOpenedResultRef.current?.()
      .catch((err) => {
        autoSavedResultsRef.current.delete(key);
        console.error("Auto-save of opened results failed", err);
      })
      .finally(() => setAutoSavingOpenFor((prev) => (prev === sid ? null : prev)));
  }, [
    resultModalSubmissionId,
    editorSubmissionId,
    confirmedSnapshot,
    resultModal?.result?.markingRunId,
    pendingEdits.status,
  ]);

  const downloadGradedPdf = async () => {
    if (!resultModal) return;
    if (hasPendingEdits) {
      toast.warn("Save & regenerate PDF first");
      return;
    }
    setDownloading(true);
    try {
      const submissionId = resultModal.submissionId;
      const studentFile = await getStudentFile(submissionId);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
        criteriaGrade: resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
      });
      downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `${resultModal.student.name || "submission"}_graded.pdf`);
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
      toast.warn("Save & regenerate PDF first so the uploaded PDF matches the preview");
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
      const studentFile = await getStudentFile(submissionId);
      const totalMarks = resolveAnnotatePdfTotalMarks({
        questions: editingQuestions,
        criteriaGrade: resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
      });
      const summary = resolvePdfSummary(submissionId, resultModal.result);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        maxTotalMarks: effectiveMaxTotal,
        summary,
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
        criteriaGrade: resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
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
      // Published — free the draft (the annotated PDF now lives in LoginCSS).
      deleteDraft(submissionId);
      setSubmissions((prev) =>
        prev.map((s) =>
          s.submissionId === submissionId
            ? { ...s, localStatus: "done", localGrade: totalMarks, hasFeedbackPdf: true }
            : s
        )
      );
      setResultModal(null);
      loadAll();
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to upload to LoginCSS");
    } finally {
      setReturning(false);
    }
  };

  // ── Publish All ──
  // Publishing one submission means rendering its annotated PDF in the browser
  // and posting it, so publishing a whole assignment is that same call in a
  // loop (src/utils/gradingPublishAll.js). The queue comes from the server, so
  // it covers every marked-but-unpublished submission in the assignment rather
  // than only the page of rows on screen — narrowed to the ticked rows when the
  // user has selected any.
  const stopPublishAll = () => {
    publishStopRef.current = true;
    setPublishAll((prev) => (prev ? { ...prev, stopping: true } : prev));
    toast.info("Finishing the current submission, then stopping…");
  };

  const publishAllResults = async () => {
    if (!selectedAssignment || publishAll) return;

    publishStopRef.current = false;
    setPublishAll({ done: 0, total: 0, current: null, loading: true });

    let queue = [];
    try {
      queue = await fetchPublishQueue(api, "/external-grading", selectedAssignment.id ?? null);
    } catch (err) {
      setPublishAll(null);
      toast.error((await getApiErrorMessage(err)) || "Failed to load the publish queue");
      return;
    }

    // An empty selection means the whole assignment — same convention as the
    // marking actions.
    const selectedIds = markingSelection.selectedIds;
    const queued = selectedIds.size
      ? queue.filter((row) => selectedIds.has(row.submissionId))
      : queue;

    if (!queued.length) {
      setPublishAll(null);
      toast.warn(
        selectedIds.size
          ? "None of the selected submissions have an unpublished result"
          : "Nothing to publish — every marked submission in this assignment is already published"
      );
      return;
    }

    const skipped = selectedIds.size ? selectedIds.size - queued.length : 0;
    const ok = await confirmToast(
      `Publish ${queued.length} marked submission${queued.length === 1 ? "" : "s"} to LoginCSS?` +
        (skipped > 0
          ? ` (${skipped} selected submission${skipped === 1 ? " has" : "s have"} nothing to publish and will be skipped.)`
          : ""),
      { title: `Publish All — ${selectedAssignment.name}`, confirmLabel: "Publish All" }
    );
    if (!ok) {
      setPublishAll(null);
      return;
    }

    setPublishAll({ done: 0, total: queued.length, current: null, loading: false });

    const { successCount, failures, publishedIds, stopped } = await runGradingPublishAll({
      api,
      base: "/external-grading",
      queue: queued,
      assignmentMaxPoints:
        assignmentSettings.settings.maxGrade ?? (Number(selectedAssignment?.grade) || null),
      getStudentFile,
      // A run over a whole assignment would otherwise leave every downloaded
      // submission PDF sitting in the cache for the rest of the session.
      releaseStudentFile: (sid) => { delete pdfCacheRef.current[sid]; },
      onProgress: ({ done, total, current }) =>
        setPublishAll((prev) => (prev ? { ...prev, done, total, current } : prev)),
      shouldStop: () => publishStopRef.current,
    });

    setPublishAll(null);
    publishStopRef.current = false;

    // Reflect the published rows immediately; loadAll then refreshes counts.
    const gradeById = new Map(publishedIds.map((p) => [p.submissionId, p.totalMarks]));
    if (gradeById.size) {
      setSubmissions((prev) =>
        prev.map((s) =>
          gradeById.has(s.submissionId)
            ? {
                ...s,
                localStatus: "done",
                localGrade: gradeById.get(s.submissionId),
                hasFeedbackPdf: true,
                hasDraft: false,
              }
            : s
        )
      );
      setResults((prev) => {
        const next = { ...prev };
        for (const id of gradeById.keys()) delete next[id];
        return next;
      });
      markingSelection.clear();
    }

    const message = formatPublishAllMessage(successCount, failures, stopped);
    if (failures.length) toast.warn(message);
    else toast.success(message);

    loadAll();
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
      downloadBlob(file, `${student.name || "submission"}${which === "ms" ? "_markscheme" : ""}.pdf`);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || `Failed to download ${label}`);
    }
  };

  // Re-view the annotated feedback PDF that was published to LoginCSS (any device).
  // Mirrors the /pdfs envelope: { feedback: { available, base64 } } — base64-only
  // (no presigned URL) to avoid the R2 CORS problem of fetching the URL in-browser.
  const viewFeedback = async (student) => {
    try {
      const res = await api.get(
        `/external-grading/submissions/${student.submissionId}/feedback`,
        { timeout: 120000 }
      );
      const feedback = res.data?.feedback || {};
      if (!feedback.available || !feedback.base64) {
        return toast.error("No feedback PDF available for this submission");
      }
      const file = base64ToFile(feedback.base64, `feedback_${student.submissionId}.pdf`);
      await assertPdfBlob(file, "Feedback");
      window.open(URL.createObjectURL(file), "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to open feedback PDF");
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

  const selectAssignment = (a) => {
    setSelectedAssignment(a);
    setSearch("");
    setPage(1);
    // The cached roster belongs to the assignment being left behind.
    applySearchRoster(null);
    // Submissions are fetched a page at a time, so opening one loads page 1.
    loadAssignmentSubmissions(a, 1);
  };

  const backToAssignments = () => {
    setSelectedAssignment(null);
    setSearch("");
    setPage(1);
    applySearchRoster(null);
    // Drop the previous assignment's rows so they can't leak into the next one.
    setSubmissions([]);
  };

  const sendTeamAlert = async (delegationId) => {
    try {
      setSendingAlertId(delegationId);
      await api.post(`/grading-delegations/${delegationId}/send-alert`);
      toast.success("Alert sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send alert");
    } finally {
      setSendingAlertId(null);
    }
  };

  // Grouped by the server — see loadAssignments.
  const assignments = assignmentIndex;

  const aq = assignmentSearch.trim().toLowerCase();
  const filteredAssignments = aq
    ? assignments.filter((a) => (a.name || "").toLowerCase().includes(aq))
    : assignments;

  // Client-side pagination of the assignment selection list (search filters the
  // whole list first, then we slice into pages).
  const assignmentTotalPages = Math.max(1, Math.ceil(filteredAssignments.length / ASSIGNMENTS_PER_PAGE));
  const safeAssignmentPage = Math.min(assignmentPage, assignmentTotalPages);
  const visibleAssignments = filteredAssignments.slice(
    (safeAssignmentPage - 1) * ASSIGNMENTS_PER_PAGE,
    safeAssignmentPage * ASSIGNMENTS_PER_PAGE
  );

  // `submissions` already holds exactly the page the server returned, so with no
  // query there is nothing left to slice.
  //
  // A query instead runs over `searchRoster` — every submission in the
  // assignment — so it reaches rows on pages that were never loaded, and matches
  // either the student name or the submission id ("4471" or "#4471"). Rows
  // already on screen win over roster rows, since only the paged fetch carries
  // drafts. Until the roster lands, the current page is all we can filter.
  const q = search.trim().toLowerCase();
  const idQuery = q.replace(/^#/, "");
  const assignmentSubmissions = selectedAssignment ? submissions : [];
  const pagedById = new Map(assignmentSubmissions.map((s) => [s.submissionId, s]));
  const searchPool = (searchRoster || assignmentSubmissions).map(
    (s) => pagedById.get(s.submissionId) || s
  );
  const filteredSubmissions = q
    ? searchPool.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (!!idQuery && String(s.submissionId ?? "").includes(idQuery))
      )
    : assignmentSubmissions;

  // Pagination comes from the server for this list — except while searching,
  // where the matches are already in memory and get sliced here.
  const isSearching = !!q;
  const clientTotalPages = isSearching
    ? Math.max(1, Math.ceil(filteredSubmissions.length / PER_PAGE))
    : Math.max(1, listMeta.lastPage);
  const safePage = Math.min(page, clientTotalPages);
  const visibleSubmissions = isSearching
    ? filteredSubmissions.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)
    : filteredSubmissions;

  // "Select page" only ever covers the rows on screen; "Select all" (above)
  // reaches the rest of the assignment.
  const pageSelectableIds = visibleSubmissions
    .map((s) => s.submissionId)
    .filter((id) => id != null);
  const pageAllMarkingSelected =
    pageSelectableIds.length > 0 &&
    pageSelectableIds.every((id) => markingSelection.isSelected(id));
  const toggleMarkingSelectPage = () => {
    if (pageAllMarkingSelected) {
      markingSelection.selectIds(
        [...markingSelection.selectedIds].filter((id) => !pageSelectableIds.includes(id))
      );
    } else {
      markingSelection.mergeIds(pageSelectableIds);
    }
  };

  const isCriteria = resultModal?.result?.markingMode === "criteria";
  const total = sumQuestionMarks(questionsForDisplay);
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
            {selectedAssignment && (
              <button
                type="button"
                className="msv-refresh-btn"
                onClick={backToAssignments}
                style={{ marginRight: 8 }}
              >
                <FiArrowLeft size={13} /> Assignments
              </button>
            )}
            <button
              type="button"
              className="msv-refresh-btn"
              onClick={() => loadAll()}
              disabled={loadingList || loadingAssignments || syncing}
            >
              <FiRefreshCw size={13} className={loadingList ? "msv-spin" : ""} />
              {loadingList ? "Loading…" : "Refresh"}
            </button>
            <button
              type="button"
              className="msv-refresh-btn"
              onClick={syncFromProvider}
              disabled={loadingList || loadingAssignments || syncing}
              style={{ marginLeft: 8 }}
              title="Fetch LoginCSS's full list and add anything missing from this view"
            >
              <FiDownloadCloud size={13} className={syncing ? "msv-spin" : ""} />
              {syncing ? "Syncing…" : "Sync from LoginCSS"}
            </button>
          </div>
        </header>

        <div className="ma-content">
          <div className="ma-layout msv-collapsible-layout">

            {/* ── ASSIGNMENT SELECTION ── */}
            {!selectedAssignment ? (
              <div className="ma-column">
                <p className="ma-section-label msv-section-header-expanded">
                  ▼ Select Assignment
                  <span className="ma-panel-count" style={{ marginLeft: 8 }}>
                    {assignments.length} assignment{assignments.length === 1 ? "" : "s"} · {listTotal} submissions
                  </span>
                </p>
                <input
                  className="ma-search-input"
                  placeholder="Search assignments..."
                  value={assignmentSearch}
                  onChange={(e) => { setAssignmentSearch(e.target.value); setAssignmentPage(1); }}
                />
                <div className="ma-scroll-list">
                  {loadingAssignments ? (
                    <p className="ma-loading-msg">Loading…</p>
                  ) : sessionError ? (
                    <p className="ma-empty-msg" style={{ color: "var(--danger)" }}>
                      {sessionError}
                    </p>
                  ) : filteredAssignments.length === 0 ? (
                    <p className="ma-empty-msg">
                      {assignmentSearch ? "No assignments match your search." : "No assignments found."}
                    </p>
                  ) : (
                    visibleAssignments.map((a) => (
                      <div
                        key={a.key}
                        className="ma-assignment-card"
                        onClick={() => selectAssignment(a)}
                      >
                        <div className="ma-assignment-icon"><FiLayers size={14} /></div>
                        <div className="ma-assignment-info">
                          <span className="ma-assignment-title">{a.name}</span>
                          <span className="ma-assignment-due">
                            {a.id != null ? `#${a.id} · ` : ""}
                            {a.count} submission{a.count === 1 ? "" : "s"}
                            {a.grade != null ? ` · /${a.grade}` : ""}
                            {a.dueDate ? (
                              <>
                                {" · "}
                                <FiCalendar size={10} /> {new Date(a.dueDate).toLocaleDateString()}
                              </>
                            ) : ""}
                          </span>
                          {/* Renders only when the director delegated this
                              assignment to the signed-in account. */}
                          <GradingDeadlineBadge delegation={a.myDelegation} />
                          {/* Renders only when the caller is the delegated
                              manager on this assignment. */}
                          <GradingTeamAlert
                            teamDelegations={a.teamDelegations}
                            onSendAlert={sendTeamAlert}
                            sendingId={sendingAlertId}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {!loadingAssignments && filteredAssignments.length > ASSIGNMENTS_PER_PAGE && (
                  <Pagination
                    page={safeAssignmentPage}
                    totalPages={assignmentTotalPages}
                    onPageChange={(p) => setAssignmentPage(p)}
                  />
                )}
              </div>
            ) : (
              <div
                className="msv-section-collapsed"
                onClick={backToAssignments}
                onKeyDown={(e) => e.key === "Enter" && backToAssignments()}
                role="button"
                tabIndex={0}
              >
                <span className="msv-section-collapsed-chevron">▶</span>
                <span className="msv-section-collapsed-text">
                  Assignment: {selectedAssignment.name}
                </span>
                <button
                  type="button"
                  className="msv-section-change"
                  onClick={(e) => { e.stopPropagation(); backToAssignments(); }}
                >
                  [change]
                </button>
              </div>
            )}

            {/* ── SUBMISSIONS FOR SELECTED ASSIGNMENT ── */}
            {selectedAssignment && (
            <div className="ma-right-panel msv-right-panel-full">
              <div className="ma-panel">
                <div className="ma-panel-header">
                  <div className="ma-panel-title-wrap">
                    <div className="ma-panel-dot" />
                    <h2 className="ma-panel-title">{selectedAssignment.name}</h2>
                    <span className="ma-panel-count">
                      {isSearching
                        ? `${filteredSubmissions.length} of ${listMeta.total} match`
                        : `${listMeta.total} total`}
                    </span>
                    <span className="ma-panel-count">
                      {loadingList ? "Counting PDFs…" : `Corrected ${correctedCount} / ${listMeta.total} PDFs`}
                    </span>
                  </div>
                  <div className="msv-panel-controls" style={{ flexWrap: "wrap", gap: 8 }}>
                    <input
                      className="msv-student-search"
                      type="text"
                      placeholder="Search by name or ID…"
                      title="Searches every submission in this assignment, by student name or submission id"
                      value={search}
                      onChange={(e) => onSearchChange(e.target.value)}
                    />
                    {canMark && (
                    <>
                    <select
                      className="msv-gemini-select"
                      value={pickValidGeminiModel(geminiModels, geminiModel)}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      disabled={bulkMarking || priorityBulkRunning}
                      title="Sahahly model for marking"
                      style={{ minWidth: 180, maxWidth: 260 }}
                    >
                      {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map((m) => (
                        <option key={m.id} value={m.id}>
                          {sahahlyModelLabel(m)}
                        </option>
                      ))}
                    </select>
                    {selectedAssignment?.id != null && (
                      <button
                        type="button"
                        className="msv-btn-ai msv-btn-prompt-gen"
                        onClick={() => {
                          setPromptDraft(assignmentPrompt.content || "");
                          setPromptGenOpen(true);
                        }}
                        title="Generate or edit assignment-specific marking prompt"
                      >
                        <FiEdit3 size={13} />
                        Prompt Generation
                        {assignmentPrompt.hasPrompt ? " ✓" : ""}
                      </button>
                    )}
                    {selectedAssignment?.id != null && (
                      <button
                        type="button"
                        className="msv-btn-ai msv-btn-verify"
                        onClick={() => {
                          setMsVerifyResult(null);
                          setMsVerifyOpen(true);
                        }}
                        title="Verify mark scheme against Classroom totals and sample submissions"
                      >
                        <FiShield size={13} />
                        Mark Scheme Verification
                      </button>
                    )}
                    {/* Non-batch "Mark All" buttons removed — keep only the Gemini batch button */}
                    <button
                      className="msv-btn-ai"
                      onClick={() => {
                        if (batchJob?.phase === "processing") {
                          toast.info("Checking batch status…");
                          pollBatchJob(batchJob.jobId, {
                            assignmentId: String(selectedAssignment.id),
                            mode: batchJob.mode,
                            geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
                          });
                        } else {
                          openGuidanceModal(null, { batch: true });
                        }
                      }}
                      disabled={
                        selectedAssignment.id == null ||
                        bulkMarking ||
                        priorityBulkRunning ||
                        batchJob?.phase === "uploading" ||
                        batchJob?.phase === "submitting"
                      }
                      title={
                        selectedAssignment.id == null
                          ? "Batch marking needs an assignment with a LoginCSS id"
                          : markingSelection.selectedCount
                            ? "Submit one Gemini batch job for the selected submissions"
                            : "Submit one Gemini batch job for all unmarked submissions"
                      }
                      style={{ background: "var(--primary)", borderColor: "var(--primary)", color: "var(--primary-contrast)" }}
                    >
                      {batchJob?.phase === "uploading" && <><span className="pm-spinner" /> Uploading…</>}
                      {batchJob?.phase === "submitting" && <><span className="pm-spinner" /> Submitting…</>}
                      {batchJob?.phase === "processing" && <><span className="pm-spinner" /> Batch running… (tap to check)</>}
                      {batchJob?.phase === "error" && <>⚡ Batch failed — retry?</>}
                      {(!batchJob || batchJob.phase === "done") && (
                        <>
                          <FiLayers size={13} />{" "}
                          {markingActionLabel("Mark batch", "Mark Selected (Batch)", markingSelection.selectedCount)}
                        </>
                      )}
                    </button>
                    </>
                    )}
                    {/* Reviewers publish too, so this sits outside the canMark
                        block — it sends results that already exist. */}
                    <button
                      className="msv-btn-ai"
                      onClick={publishAllResults}
                      disabled={!!publishAll || bulkMarking || priorityBulkRunning}
                      title={
                        markingSelection.selectedCount
                          ? "Publish the selected marked submissions to LoginCSS"
                          : "Publish every marked-but-unpublished submission in this assignment to LoginCSS"
                      }
                      style={{ background: "var(--success)", borderColor: "var(--success)", color: "#fff" }}
                    >
                      {publishAll ? (
                        <>
                          <span className="pm-spinner" />{" "}
                          {publishAll.loading
                            ? "Loading queue…"
                            : `Publishing ${publishAll.done}/${publishAll.total}…`}
                        </>
                      ) : (
                        <>
                          <FiSend size={13} />{" "}
                          {markingActionLabel(
                            "Publish All",
                            "Publish Selected",
                            markingSelection.selectedCount
                          )}
                        </>
                      )}
                    </button>
                    {publishAll && !publishAll.loading && (
                      <button
                        className="msv-btn-ai"
                        onClick={stopPublishAll}
                        disabled={!!publishAll.stopping}
                        style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }}
                      >
                        <FiX size={13} /> Stop
                      </button>
                    )}
                  </div>
                </div>

                {publishAll && !publishAll.loading && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--success) 8%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)",
                      fontSize: 12,
                      color: "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="pm-spinner" style={{ width: 12, height: 12 }} />
                    <span>
                      Publishing to LoginCSS — {publishAll.done} of {publishAll.total} done
                      {publishAll.current ? ` · ${publishAll.current}` : ""}
                    </span>
                  </div>
                )}

                {selectedAssignment.id != null && (
                  <GradingAssignmentSettingsBar
                    state={assignmentSettings}
                    partnerGrade={selectedAssignment.grade ?? null}
                  />
                )}

                {/* Row selection narrows a marking run OR a Publish All run, so
                    it renders for reviewers too — they can only do the latter. */}
                <MarkingSelectionBar
                  selectedCount={markingSelection.selectedCount}
                  pageSelectableCount={pageSelectableIds.length}
                  pageAllSelected={pageAllMarkingSelected}
                  onTogglePage={toggleMarkingSelectPage}
                  onSelectAll={selectAllSubmissionsForMarking}
                  onClear={markingSelection.clear}
                  selectingAll={selectingMarkingAll}
                  countSuffix={canMark ? "" : "to publish"}
                />

                {canMark && batchJob && batchJob.phase !== "done" && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                      fontSize: 12,
                      color: "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span className="pm-spinner" style={{ width: 12, height: 12 }} />
                    <span>
                      {batchJob.phase === "uploading" && `Uploading ${batchJob.total} submission PDF(s) to Gemini…`}
                      {batchJob.phase === "submitting" && "Submitting batch job…"}
                      {batchJob.phase === "processing" && `Batch job processing (job: ${batchJob.jobId}) — checking every 15s…`}
                    </span>
                    {(batchJob.phase === "uploading" ||
                      batchJob.phase === "submitting" ||
                      batchJob.phase === "processing") && (
                      <button
                        onClick={stopBatchMark}
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          color: "var(--danger)",
                          background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                        }}
                      >
                        <FiX size={11} style={{ verticalAlign: -1 }} /> Stop
                      </button>
                    )}
                  </div>
                )}

                {canMark &&
                  batchJob?.phase === "done" &&
                  (batchJob?.firstBatch?.status === "pending_confirmation" ||
                    batchJob?.firstBatch?.status === "confirming") && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "color-mix(in srgb, var(--success, #16a34a) 10%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--success, #16a34a) 30%, transparent)",
                        fontSize: 12,
                        color: "var(--muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        ✅ {batchJob.firstBatch.limit ?? 3} submission{(batchJob.firstBatch.limit ?? 3) === 1 ? "" : "s"} marked
                        as a safety check on this new assignment. Review them, then confirm to mark the remaining{" "}
                        {batchJob.firstBatch.remainingCount ?? "the rest"}.
                      </span>
                      <button
                        onClick={confirmFirstBatch}
                        disabled={batchJob.firstBatch.status === "confirming"}
                        style={{
                          marginLeft: "auto",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#fff",
                          background: "var(--success, #16a34a)",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 12px",
                          cursor: "pointer",
                          opacity: batchJob.firstBatch.status === "confirming" ? 0.6 : 1,
                        }}
                      >
                        {batchJob.firstBatch.status === "confirming" ? "Confirming…" : "Confirm & Mark Rest"}
                      </button>
                    </div>
                  )}

                {batchJob?.firstBatch?.status === "confirmed_pending" && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                      fontSize: 12,
                      color: "var(--muted)",
                    }}
                  >
                    Confirmed — marking the remaining submissions is still running in the background
                    (roster sync and uploads can take a few minutes). Refresh this page shortly to check progress.
                  </div>
                )}

                {loadingList && <p className="ma-loading-msg">Loading submissions…</p>}
                {!loadingList && loadingSearchRoster && visibleSubmissions.length === 0 && (
                  <p className="ma-loading-msg">Searching all submissions…</p>
                )}
                {!loadingList && !loadingSearchRoster && visibleSubmissions.length === 0 && (
                  <p className="ma-empty-msg">
                    {search
                      ? `No submissions match "${search}".`
                      : "No submissions for this assignment."}
                  </p>
                )}

                {!loadingList && visibleSubmissions.length > 0 && (
                  <div className="ma-table-wrap">
                    <div className="ma-table-scroll">
                      <table className="ma-table ma-table--cards">
                        <thead>
                          <tr>
                            <th style={{ width: 44 }} aria-label="Select submissions" />
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
                            // `hasDraft` comes from the server without carrying
                            // the draft itself, so the button shows immediately
                            // on load; openSavedResult fetches content on click.
                            const hasResult =
                              !!results[s.submissionId]?.result || !!s.hasDraft;
                            const hasError = single?.status === "error" || bulk?.status === "error" || studentErrors[s.submissionId];
                            return (
                              <tr
                                key={s.submissionId ?? i}
                                className="ma-row"
                                style={{ animationDelay: `${i * 0.025}s` }}
                              >
                                <td>
                                  {s.submissionId != null ? (
                                    <button
                                      type="button"
                                      className={`msv-mark-check ${markingSelection.isSelected(s.submissionId) ? "msv-mark-check--on" : ""}`}
                                      onClick={() => markingSelection.toggle(s.submissionId)}
                                      aria-label={`Select ${s.name || "submission"}`}
                                    >
                                      {markingSelection.isSelected(s.submissionId) ? "✓" : ""}
                                    </button>
                                  ) : null}
                                </td>
                                <td>
                                  <div className="ma-avatar-cell">
                                    <div className="ma-avatar">
                                      {(s.name || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="ma-cell-identity">
                                      <span className="ma-cell-name">{s.name || "—"}</span>
                                      {s.submissionId != null && !s.nameIsFallback && (
                                        <span className="ma-cell-subid" title="Submission ID">
                                          #{s.submissionId}
                                        </span>
                                      )}
                                    </div>
                                    {(() => {
                                      // Either the live pre-grading check or a
                                      // fileWarning baked into a saved result.
                                      const savedWarn = results[s.submissionId]?.result?.fileWarning;
                                      const flagText = pageCountWarningText(pageCountFlags[s.submissionId]);
                                      const orientationFlagText = orientationWarningText(orientationFlags[s.submissionId]);
                                      if (!savedWarn && !flagText && !orientationFlagText) return null;
                                      const title = flagText
                                        || orientationFlagText
                                        || (typeof savedWarn === "string" ? savedWarn : savedWarn?.message)
                                        || "Submitted file may be wrong — page count differs from expected";
                                      return (
                                        <span
                                          title={title}
                                          className="msv-review-warn"
                                          style={{ color: "var(--warning)", fontSize: 11, marginLeft: 6, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}
                                        >
                                          ⚠️{" "}
                                          <span className="msv-review-warn-full">Review Submission</span>
                                          <span className="msv-review-warn-short">Review</span>
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                                <td data-label="Status">{statusBadge(s)}</td>
                                <td data-label="Submitted">
                                  <span className="ma-cell-muted">
                                    {formatSubmittedAt(s.submittedAt)}
                                  </span>
                                </td>
                                <td data-label="Grade">
                                  {s.localGrade != null ? (
                                    <span className="ma-grade-pill">{s.localGrade}</span>
                                  ) : (
                                    <span className="ma-cell-empty">—</span>
                                  )}
                                </td>
                                <td data-label="Feedback">
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

                                    {s.hasFeedbackPdf && (
                                      <button
                                        className="msv-action-btn"
                                        title="View the final graded PDF published to LoginCSS"
                                        onClick={() => viewFeedback(s)}
                                      >
                                        <FiEye size={13} /> Published PDF
                                      </button>
                                    )}

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

                                    {canMark && (
                                      <>
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
                                          style={{ background: "var(--warning)", borderColor: "var(--warning)", color: "#fff" }}
                                        >
                                          <FiSend size={12} /> Priority
                                        </button>

                                        {/* Clearing a result only makes sense next to a "mark
                                            again" button, and the draft belongs to whoever ran
                                            the marking. */}
                                        {hasResult && (
                                          <button
                                            className="msv-action-btn msv-action-btn--delete"
                                            title="Delete result and mark again"
                                            onClick={() => deleteResult(s)}
                                          >
                                            🗑 Delete
                                          </button>
                                        )}
                                      </>
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

                {!loadingList && clientTotalPages > 1 && (
                  <Pagination
                    page={safePage}
                    totalPages={clientTotalPages}
                    onPageChange={(p) => {
                      setPage(p);
                      // Search matches are already in memory; otherwise each
                      // page is its own request.
                      if (!isSearching) loadAssignmentSubmissions(selectedAssignment, p);
                    }}
                  />
                )}
              </div>
            </div>
            )}
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
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                Error Details
              </div>
              <div
                style={{
                  background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)",
                  padding: 12,
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--danger)",
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
      {canMark && guidanceModal && (
        <div className="msv-overlay" onClick={() => setGuidanceModal(null)}>
          <div className="msv-guidance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msv-guidance-header">
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {guidanceModal.batch
                  ? markingActionLabel("📦 Mark Batch (Gemini)", "📦 Mark Batch — Selected", markingSelection.selectedCount)
                  : guidanceModal.priorityBulk
                  ? markingActionLabel("🚀 Mark All (Priority)", "🚀 Mark Selected (Priority)", markingSelection.selectedCount)
                  : guidanceModal.bulk
                  ? markingActionLabel("🤖 Mark All Submissions", "🤖 Mark Selected Submissions", markingSelection.selectedCount)
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
                  style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}
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
                        border: `2px solid ${markingModeModal === m.value ? "var(--primary)" : "var(--border)"}`,
                        background: markingModeModal === m.value ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface-2)",
                        transition: "all 0.18s ease",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sahahly model */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}
                >
                  Sahahly Model
                </label>
                <select
                  className="msv-gemini-select"
                  value={pickValidGeminiModel(geminiModels, geminiModel)}
                  onChange={(e) => setGeminiModel(e.target.value)}
                >
                  {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map((m) => (
                    <option key={m.id} value={m.id}>
                      {sahahlyModelLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Saved prompt dropdown */}
              {savedPrompts.length > 0 && (
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <label
                    style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}
                  >
                    Load saved prompt
                  </label>
                  <div
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: `1px solid ${promptDropdownOpen ? "var(--primary)" : "var(--border)"}`,
                      background: "var(--surface-2)",
                      color: guidance ? "var(--text-primary)" : "var(--muted)",
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
                        color: "var(--muted)",
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
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        zIndex: 200,
                        maxHeight: 220,
                        overflowY: "auto",
                        overflowX: "hidden",
                        boxShadow: "var(--shadow)",
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
                              i < savedPrompts.length - 1 ? "1px solid var(--border)" : "none",
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
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>
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
                              color: "var(--danger)",
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
                style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}
              >
                {markingModeModal === "criteria" ? (
                  <>
                    <span style={{ color: "var(--text-primary)" }}>Criteria</span>{" "}
                    <span style={{ color: "var(--danger)" }}>*</span> — define the grading criteria and weights
                  </>
                ) : (
                  <>
                    Additional Guidance{" "}
                    <span style={{ color: "var(--muted)" }}>(optional)</span>
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
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
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
                {guidanceModal.batch ? (
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
                    <FiLayers size={14} />
                    Start Batch Marking
                  </button>
                ) : guidanceModal.priority || guidanceModal.priorityBulk ? (
                  <button
                    className="ma-send-btn"
                    onClick={() => handleGuidanceConfirm("gemini")}
                    disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1,
                      background: "var(--warning)",
                      borderColor: "var(--warning)",
                      color: "#fff",
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

      {canMark && (
      <AssignmentPromptGeneration
        open={promptGenOpen}
        onClose={() => setPromptGenOpen(false)}
        assignmentTitle={selectedAssignment?.name}
        content={assignmentPrompt.content}
        draft={promptDraft}
        onDraftChange={setPromptDraft}
        maxPoints={assignmentPrompt.maxPoints}
        maxPointsLabel="Total marks:"
        generatedAt={assignmentPrompt.generatedAt}
        loading={assignmentPrompt.loading}
        generating={assignmentPrompt.generating}
        saving={assignmentPrompt.saving}
        hasPrompt={assignmentPrompt.hasPrompt}
        onGenerate={async (extraInstructions) => {
          const res = await assignmentPrompt.generate(extraInstructions);
          if (res?.content) setPromptDraft(res.content);
        }}
        onSave={async () => {
          await assignmentPrompt.save(promptDraft);
        }}
      />
      )}

      {canMark && (
      <MarkSchemeVerificationModal
        open={msVerifyOpen}
        onClose={() => setMsVerifyOpen(false)}
        assignmentId={selectedAssignment?.id != null ? String(selectedAssignment.id) : null}
        assignmentTitle={selectedAssignment?.name}
        verifying={msVerifying}
        result={msVerifyResult}
        onRun={handleRunMsVerification}
      />
      )}

      {/* ── PRE-GRADING PAGE-COUNT REVIEW ── */}
      <PageCountCheckModal
        state={pageCheckModal}
        onResolve={resolvePageCheck}
        onOpenPdf={(c) => viewFile({ submissionId: c.submissionId, name: c.studentName }, "student")}
      />
      <OrientationCheckModal
        state={orientationCheckModal}
        onResolve={resolveOrientationCheck}
        onOpenPdf={(c) => viewFile({ submissionId: c.submissionId, name: c.studentName }, "student")}
      />

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
                      background: isCriteria ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "color-mix(in srgb, var(--primary) 15%, transparent)",
                      color: isCriteria ? "var(--accent)" : "var(--primary)",
                      border: `1px solid ${isCriteria ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "color-mix(in srgb, var(--primary) 30%, transparent)"}`,
                    }}
                  >
                    {isCriteria ? "🎯 Criteria Marking" : "📋 Normal Marking"}
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Final Grade:</span>
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
                        background: `color-mix(in srgb, ${color} 15%, transparent)`,
                        color: color,
                        fontWeight: 700,
                        fontSize: 15,
                        textAlign: "center",
                        outline: "none",
                        cursor: "not-allowed",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>/</span>
                    <input
                      type="number"
                      min={1}
                      value={editingMaxTotal !== null ? editingMaxTotal : effectiveMaxTotal}
                      onChange={(e) => setEditingMaxTotal(Math.max(1, Number(e.target.value)))}
                      style={{
                        width: 56,
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        color: "var(--text-primary)",
                        fontWeight: 700,
                        fontSize: 15,
                        textAlign: "center",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>({pct}%)</span>
                    {hasPendingEdits && (
                      <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>Unsaved edits</span>
                    )}
                    {(hasPendingEdits || editingMaxTotal !== null) && (
                      <button
                        onClick={() => {
                          const reset = resetToConfirmed();
                          if (reset) {
                            setEditingQuestions(reset.questions);
                            setEditingAnnotations(reset.teacherAnnotations || []);
                            setEditingSummary(reset.summary || "");
                            setSummaryTouched(false);
                            setEditingMaxTotal(null);
                            setEditingTotal(null);
                            setPendingRemovedIndices(new Set());
                            revertPreviewToConfirmed();
                          } else {
                            setEditingTotal(null);
                            setEditingMaxTotal(null);
                          }
                        }}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--surface-2)",
                          color: "var(--muted)",
                          cursor: "pointer",
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div style={{ flex: "1 1 180px", minWidth: 140, maxWidth: 280 }}>
                    <div style={{ height: 6, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", borderRadius: 4 }}>
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
                <button
                  type="button"
                  className="msv-btn-ai"
                  onClick={() => setAnnotationsPanelOpen((open) => !open)}
                  style={{
                    fontSize: 12,
                    background: annotationsPanelOpen
                      ? "color-mix(in srgb, var(--primary) 28%, transparent)"
                      : "color-mix(in srgb, var(--primary) 12%, transparent)",
                    borderColor: "var(--primary)",
                    color: "var(--primary)",
                  }}
                  title="Add extra notes on the marked PDF preview"
                >
                  📝 Annotate
                  {editingAnnotations.length > 0 ? ` (${editingAnnotations.length})` : ""}
                </button>
                <button
                  className="msv-btn-ai"
                  onClick={editHistory.undo}
                  disabled={!editHistory.canUndo || confirmingEdits}
                  title="Undo last edit"
                >
                  <FiRotateCcw size={13} />
                </button>
                <button
                  className="msv-btn-ai"
                  onClick={editHistory.redo}
                  disabled={!editHistory.canRedo || confirmingEdits}
                  title="Redo edit"
                >
                  <FiRotateCw size={13} />
                </button>
                {hasPendingEdits && (
                  <button
                    className="msv-btn-ai"
                    onClick={handleConfirmEdits}
                    disabled={confirmingEdits || previewLoading}
                    style={{ background: "var(--success)", borderColor: "var(--success)", color: "#fff" }}
                  >
                    <FiCheck size={13} />
                    {confirmingEdits ? "Saving…" : "Save & regenerate PDF"}
                  </button>
                )}
                {pendingEdits.status !== "restored" && (
                  <PendingEditsSavingHint saving={pendingEdits.saving} />
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
              className="msv-modal-body msv-results-body"
              style={{ display: "flex", gap: 20, height: "80vh", overflow: "hidden" }}
            >
              {/* LEFT: results / editor */}
              <div style={{ flex: "1 1 0", minWidth: 0, overflowY: "auto", height: "100%", paddingRight: 8 }}>
                {pendingEdits.status === "restored" && (
                  <PendingEditsBanner
                    savedAt={pendingEdits.restoredAt}
                    saving={pendingEdits.saving}
                    onDiscard={pendingEdits.discardRestored}
                  />
                )}
                {resultModal.result.fileWarning && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: "10px 14px",
                      background: "var(--warning-bg)",
                      border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "var(--warning)",
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

                {(resultModal.student?.assignment?.id ?? selectedAssignment?.id) && (
                  <MarkingCorrectionChat
                    assignmentId={
                      resultModal.student?.assignment?.id ?? selectedAssignment?.id
                    }
                    submissionId={
                      resultModal.student?.submissionId || resultModal.submissionId
                    }
                    studentId={resultModal.student?.studentId}
                    studentName={resultModal.student?.name}
                    currentResult={{
                      ...resultModal.result,
                      questions: editingQuestions,
                      summary: editingSummary,
                      totalMarks: sumQuestionMarks(questionsForDisplay),
                    }}
                    onApplyPatch={handleCorrectionPatch}
                  />
                )}

                {/* CRITERIA MODE */}
                {isCriteria && resultModal.result.criteriaGrade && (
                  <div style={{ marginBottom: 20 }}>
                    <div
                      style={{
                        padding: "16px 20px",
                        background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                        borderRadius: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--accent)",
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
                        const cgMax = effectiveMaxTotal;
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
                              <div style={{ fontSize: 16, color: "var(--muted)" }}>/ {cgMax}</div>
                              <div style={{ flex: 1, minWidth: 100 }}>
                                <div style={{ height: 8, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", borderRadius: 4 }}>
                                  <div
                                    style={{
                                      width: `${cgPct}%`,
                                      height: "100%",
                                      background: cgColor,
                                      borderRadius: 4,
                                    }}
                                  />
                                </div>
                                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
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
                                      background: "var(--surface-2)",
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
                                    <div style={{ fontSize: 12, color: "var(--muted)", flex: 1 }}>
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
                                  color: "var(--muted)",
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
                      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        📝 Question Corrections (Feedback Only)
                      </span>
                      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    </div>
                  </div>
                )}

                {/* NORMAL MODE summary (editable) */}
                {!isCriteria && (
                  <div className="msv-summary-box">
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--muted)",
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Overall Summary
                    </div>
                    <textarea
                      value={editingSummary}
                      onChange={(e) => {
                        setSummaryTouched(true);
                        setEditingSummary(e.target.value);
                      }}
                      rows={4}
                      placeholder="Short bullet points (one per line, start with •). Updates when you edit marks."
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        lineHeight: 1.6,
                        resize: "vertical",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        outline: "none",
                      }}
                    />
                  </div>
                )}

                {/* QUESTIONS */}
                <MarkingCompletenessNotice
                  result={resultModal?.result}
                  questionCount={questionsForDisplay.length}
                />
                <MarkingPageShiftNotice result={resultModal?.result} />
                {!isCriteria && (
                  <AddMarkingQuestionBar
                    onAdd={(q) => {
                      setEditingQuestions((prev) => [...prev, q]);
                      toast.success(`Added Q${q.questionNumber}`);
                    }}
                  />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  {editingQuestions.map((q, idx) => {
                    if (pendingRemovedIndices.has(idx)) return null;
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
                          <QuestionNumberBadge question={q} guidance={assignmentPrompt.content} allQuestions={questionsForDisplay} />
                          {isCriteria ? (
                            <span
                              style={{
                                padding: "3px 10px",
                                borderRadius: 6,
                                border: `1px solid ${qColor}`,
                                background: `color-mix(in srgb, ${qColor} 15%, transparent)`,
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
                                    patchQuestionRowEdit(prev, idx, {
                                      marksAwarded: Math.min(
                                        qMax,
                                        Math.max(0, Number(e.target.value) || 0)
                                      ),
                                    })
                                  )
                                }
                                style={{
                                  width: 52,
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: `1px solid ${qColor}`,
                                  background: `color-mix(in srgb, ${qColor} 15%, transparent)`,
                                  color: qColor,
                                  fontWeight: 700,
                                  fontSize: 14,
                                  textAlign: "center",
                                  outline: "none",
                                }}
                              />
                              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                                / {q.maxMarks}
                              </span>
                            </div>
                          )}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 60,
                              height: 5,
                              background: "color-mix(in srgb, var(--text-primary) 8%, transparent)",
                              borderRadius: 3,
                            }}
                          >
                            <div
                              style={{ width: `${qPct}%`, height: "100%", background: qColor, borderRadius: 3 }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>{qPct}%</span>
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
                                    background: isGood ? "var(--success-bg)" : "var(--danger-bg)",
                                    color: isGood ? "var(--success)" : "var(--danger)",
                                    border: `1px solid ${isGood ? "color-mix(in srgb, var(--success) 20%, transparent)" : "color-mix(in srgb, var(--danger) 20%, transparent)"}`,
                                  }}
                                >
                                  {isGood ? "✅" : "❌"} {label}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {q.studentAnswer && !isBlankQuestion(q) && (
                          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, color: "var(--muted)" }}>Student: </span>
                            {q.studentAnswer}
                          </div>
                        )}
                        {isBlankQuestion(q) && (
                          <div style={{ fontSize: 12, color: "var(--warning)", marginBottom: 6, lineHeight: 1.5 }}>
                            📭 {q.studentAnswer || "Question left blank — no working or final answer was provided."}
                          </div>
                        )}

                        {q.correctAnswer && (isCriteria || Number(q.maxMarks) === 1) && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--success)",
                              marginBottom: 6,
                              padding: "6px 10px",
                              background: "color-mix(in srgb, var(--success) 7%, transparent)",
                              borderRadius: 6,
                              border: "1px solid color-mix(in srgb, var(--success) 15%, transparent)",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>✅ Correct Answer: </span>
                            {q.correctAnswer}
                          </div>
                        )}

                        {!isCriteria && (
                          <QuestionKeywordFields
                            question={q}
                            onChange={(updated) =>
                              setEditingQuestions((prev) =>
                                applyQuestionRowEdit(prev, idx, updated)
                              )
                            }
                          />
                        )}

                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginBottom: 4,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {isCriteria ? "Comment" : "Examiner Note"}
                        </div>
                        {isCriteria ? (
                          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                            {q.reason}
                          </p>
                        ) : (
                          <textarea
                            value={q.reason}
                            onChange={(e) =>
                              setEditingQuestions((prev) =>
                                patchQuestionRowEdit(prev, idx, { reason: e.target.value })
                              )
                            }
                            rows={3}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface-2)",
                              color: "var(--text-primary)",
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

              {/* MIDDLE: annotated preview */}
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 10,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>📄 Annotated PDF Preview</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {hasPendingEdits && (
                      <span style={{ fontSize: 10, color: "var(--warning)", fontWeight: 600, textTransform: "none" }}>
                        {confirmingEdits ? "Regenerating PDF…" : "Click Save & regenerate PDF to update preview"}
                      </span>
                    )}
                  </div>
                </div>

                {annotationsPanelOpen && (
                  <div
                    style={{
                      marginBottom: 10,
                      maxHeight: 240,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    <TeacherAnnotationsEditor
                      annotations={editingAnnotations}
                      onChange={setEditingAnnotations}
                      questions={editingQuestions}
                    />
                  </div>
                )}

                {previewLoading ? (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Generating preview…</div>
                ) : previewError ? (
                  <div style={{ color: "var(--danger)", fontSize: 13 }}>{previewError}</div>
                ) : annotatedPreviewUrl ? (
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <AnnotatedPdfPreview
                      key={resultModal?.submissionId || resultModal?.student?.submissionId || "preview"}
                      url={annotatedPreviewUrl}
                      placementQuestions={placementQuestions}
                      reportPageCount={reportPageCount}
                      onPlacementChange={handleAnnotationPlacementChange}
                      onQuestionRemove={handleQuestionRemove}
                      labelGuidance={assignmentPrompt.content}
                    />
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No preview available</div>
                )}
              </div>

              {/* RIGHT: mark scheme (read-only) */}
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 10,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                  }}
                >
                  📘 Mark Scheme
                </div>
                {markSchemeLoading ? (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading mark scheme…</div>
                ) : markSchemeError ? (
                  <div style={{ color: "var(--danger)", fontSize: 13 }}>{markSchemeError}</div>
                ) : markSchemePreviewUrl ? (
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <AnnotatedPdfPreview url={markSchemePreviewUrl} labelGuidance={assignmentPrompt.content} />
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No mark scheme available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
