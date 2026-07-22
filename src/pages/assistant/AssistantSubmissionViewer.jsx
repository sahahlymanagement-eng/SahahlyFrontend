import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { promptToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import { downloadBlob } from "../../utils/downloadBlob";

import { usePagination } from "../../hooks/usePagination";
import { useAnnotatedResultPreview } from "../../hooks/useAnnotatedResultPreview";
import { usePageCountCheck, buildPageCountFlagMap, pageCountWarningText } from "../../hooks/usePageCountCheck";
import Pagination from "../../components/Pagination";
import PageCountCheckModal from "../../components/PageCountCheckModal";

import {
  FiEye,
  FiDownload,
  FiRefreshCw,
  FiUsers,
  FiCpu,
  FiSend,
  FiX,
  FiLayers,
  FiCheck,
  FiEdit3,
  FiShield,
} from "react-icons/fi";

import "../manager/ManagerSubmissionViewer.css";
import {
  refreshAssignmentGrades,
  buildPercentOverridesFromStudents,
} from "../../utils/refreshAssignmentFromClassroom";
import {
  computeGradePercent,
  parsePercentInput,
  resolveAssignmentMaxPoints,
} from "../../utils/reportGradePercent";
import {
  exportAssignmentGradesExcel,
  sanitizeExcelFilenameBase,
} from "../../utils/exportGradesExcel";
import SubmissionGradeInput from "../../components/SubmissionGradeInput";
import { enrichMarkingQuestions, isBlankQuestion } from "../../utils/blankQuestionFeedback";
import {
  gradeFromPercent,
  resolveTableGrade,
  appendClassroomGradeToFormData,
} from "../../utils/submissionGrades";
import { SubmissionStatusBadge } from "../../utils/submissionStatusBadge";
import {
  appendMarkingContext,
  assertPdfBlob,
  buildFinalMarkingResult,
  applyTeacherEditsToResult,
  buildNoSubmissionMarkingResult,
  buildBatchMarkingResult,
  currentUserId,
  getApiErrorMessage,
  formatGoogleOAuthError,
  getMarkingResultSummary,
  rebuildMarkingSummary,
  guidanceForForm,
  resolveMarkingGuidanceText,
  hasTeacherEdits,
  isStudentSubmitted,
  normalizeGuidance,
  getResultMaxTotal,
  resolveDisplayMaxTotal,
  sumQuestionMarks,
  filterQuestionsPendingRemoval,
  buildPlacementQuestions,
  questionsForConfirmEdits,
  gradeScorePercent,
  resolveTotalMarksFromResult,
  resolveSavedMarkingGrade,
  getOutOfScopeNotes,
  getTeacherAnnotations,
} from "../../utils/markingFormData";
import TeacherAnnotationsEditor from "../../components/TeacherAnnotationsEditor";
import QuestionKeywordFields from "../../components/QuestionKeywordFields";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import MarkingCorrectionChat from "../../components/MarkingCorrectionChat";
import AddMarkingQuestionBar, {
  MarkingCompletenessNotice,
} from "../../components/AddMarkingQuestionBar";
import AnnotatedPdfPreview from "../../components/AnnotatedPdfPreview";
import QuestionNumberBadge from "../../components/QuestionNumberBadge";
import {
  geminiModelLabel,
  getDefaultMarkingModels,
  parseGeminiModelsResponse,
  pickValidGeminiModel,
  sahahlyModelLabel,
} from "../../utils/markingCost";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
import { buildReturnAllQueue } from "../../utils/returnAllQueue";
import { confirmReturnAll, confirmReturnSingle } from "../../utils/returnConfirmation";
import {
  useMarkingStudentSelection,
  loadEligibleStudentsForMarking,
  markingActionLabel,
} from "../../utils/markingStudentSelection";
import MarkingSelectionBar from "../../components/MarkingSelectionBar";
import AssignmentPromptGeneration from "../../components/AssignmentPromptGeneration";
import MarkSchemeVerificationModal, {
  runMarkSchemeVerification,
} from "../../components/MarkSchemeVerificationModal";
import { useAssignmentMarkingPrompt } from "../../hooks/useAssignmentMarkingPrompt";
import {
  MARKING_MAX_ATTEMPTS,
  MARKING_MAX_RETRIES_MESSAGE,
  runWithMarkingRetries,
} from "../../utils/markingRetries";
import {
  patchBatchJob,
  subscribeBatchJob,
  registerBatchPoll,
  clearBatchPoll,
  setBatchStopped,
  isBatchStopped,
} from "../../utils/assignmentBatchJobStore";

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",         passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

export default function AssignmentSubmissionViewer() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const assignmentPrompt = useAssignmentMarkingPrompt(assignmentId);

  // const [loading, setLoading] = useState(false);
  // const [students, setStudents] = useState([]);

  // const [dueDateTime, setDueDateTime] = useState(null);
  // const [maxGrade, setMaxGrade] = useState(null);
  // const [assignmentTitle, setAssignmentTitle] = useState("");
  // const [classroomId, setClassroomId] = useState(null);

  const [msInfo, setMsInfo] = useState(null);
  const [subjectId, setSubjectId] = useState(null);
  const [uploadingMs, setUploadingMs] = useState(false);

  const [markingModeModal,   setMarkingModeModal]   = useState("normal");
  
  const [markingStudentId, setMarkingStudentId] = useState(null);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkProgress,     setBulkProgress]     = useState({});
  const [bulkLocked, setBulkLocked] = useState(false);
  const bulkStopRef = useRef(false);

  const [batchProgress, setBatchProgress] = useState(null);
  const [batchJob, setBatchJob] = useState(null);

  useEffect(() => {
    if (!assignmentId) {
      setBatchJob(null);
      return undefined;
    }
    return subscribeBatchJob(assignmentId, setBatchJob);
  }, [assignmentId]);

  const batchStarting =
    batchJob?.phase === "uploading" || batchJob?.phase === "submitting";
 
  const [guidanceModal,      setGuidanceModal]      = useState(null);
  const [guidance,           setGuidance]           = useState("");
  const [promptGenOpen,      setPromptGenOpen]      = useState(false);
  const [promptDraft,        setPromptDraft]        = useState("");
  const [msVerifyOpen,       setMsVerifyOpen]       = useState(false);
  const [msVerifying,        setMsVerifying]        = useState(false);
  const [msVerifyResult,     setMsVerifyResult]     = useState(null);
  const [savedPrompts,       setSavedPrompts]       = useState([]);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);

  const [singleProgress, setSingleProgress] = useState({});
  const [resultModal, setResultModal] = useState(null);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [editingAnnotations, setEditingAnnotations] = useState([]);
  const [editingSummary, setEditingSummary] = useState("");
  const [summaryTouched, setSummaryTouched] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [returning,        setReturning]        = useState(false);
  const [editingTotal, setEditingTotal] = useState(null); // null means use effectiveTotal
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);
  const [pendingRemovedIndices, setPendingRemovedIndices] = useState(() => new Set());

  const [studentErrors, setStudentErrors] = useState({});

  const [markingProvider, setMarkingProvider] = useState("gemini");
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [savedResults, setSavedResults] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [exportingGrades, setExportingGrades] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [deletingCorrection, setDeletingCorrection] = useState({});
  const [percentOverrides, setPercentOverrides] = useState({});
  const [gradeOverrides, setGradeOverrides] = useState({});
  const [classroomSyncedGrades, setClassroomSyncedGrades] = useState({});
  const [syncedClassroomMaxPoints, setSyncedClassroomMaxPoints] = useState(null);

  const [expectedPages, setExpectedPages] = useState(null);
  const [expectedPagesInput, setExpectedPagesInput] = useState("");
  const [settingExpectedPages, setSettingExpectedPages] = useState(false);
  const [showExpectedPagesEdit, setShowExpectedPagesEdit] = useState(false);

  const [errorViewer, setErrorViewer] = useState({
  open: false,
  title: "",
  message: null,
});

const openErrorViewer = (title, error) => {
  let message = "";

  if (!error) {
    message = "An unknown error occurred.";
  } else if (typeof error === "string") {
    message = error;
  } else if (error?.response) {
    // Axios / Fetch HTTP errors
    const status = error.response.status;
    const data = error.response.data;

    if (data?.error?.message) {
      // Example: nested OpenAI error
      message = data.error.message;
    } else if (data?.message) {
      // Standard backend message
      message = data.message;
    } else {
      // Translate common HTTP status codes
      switch (status) {
        case 400:
          message = "Bad request. Please check your input.";
          break;
        case 401:
          message = "You are not authorized. Please login again or check credentials.";
          break;
        case 403:
          message = "Access denied. You do not have permission.";
          break;
        case 404:
          message =
            "The requested resource was not found. Check the API endpoint or route you are calling.";
          break;
        case 500:
        case 502:
        case 503:
          message =
            "Server error. The service may be temporarily unavailable. Please try again later.";
          break;
        default:
          message = `Unexpected error (HTTP ${status}).`;
      }
    }
  } else if (error?.message) {
    // Generic JS error
    message = error.message;
  } else {
    // Unknown object
    try {
      message = JSON.stringify(error, null, 2);
    } catch {
      message = "An unknown error occurred (cannot parse error object).";
    }
  }

  setErrorViewer({ open: true, title, message });
};

const recordStudentMarkingError = (submissionId, message, raw = null, title = null) => {
  setStudentErrors(prev => ({
    ...prev,
    [submissionId]: { message, raw, title },
  }));
};
  const safeParse = (value) => {
    if (typeof value !== "string") return value;

    try {
      const parsed = JSON.parse(value);
      // handle double-encoded JSON
      return typeof parsed === "string" ? safeParse(parsed) : parsed;
    } catch {
      return value;
    }
  };

  const extractHumanError = (err) => {
    const data = err?.response?.data;

    // Blob response (responseType:"blob" on PDF fetches) — cannot parse synchronously
    if (data instanceof Blob) {
      const status = err?.response?.status;
      if (status === 404) return "The requested file or resource could not be found.";
      if (status === 401) return "You are not authorized. Please login again or check credentials.";
      if (status === 403) return "Access denied. You do not have permission.";
      return err?.message || "File request failed.";
    }

    const parsedMessage = safeParse(data?.message);
    const errorObj =
      parsedMessage?.error ? parsedMessage : data?.error ? data : parsedMessage;

    if (
      errorObj?.error?.status === "UNAVAILABLE" ||
      errorObj?.error?.code === 503
    ) {
      return "The AI marking service is currently experiencing high demand. Please try again in a few minutes.";
    }

    // Surface the backend's specific message BEFORE falling back to the generic 404 string
    const specificMessage =
      errorObj?.error?.message ||
      data?.error?.message ||
      (typeof parsedMessage === "string" ? parsedMessage : null) ||
      parsedMessage?.message;

    if (specificMessage) return specificMessage;

    if (err?.response?.status === 404) {
      return "The requested file or resource could not be found.";
    }

    const errMessage = err?.message || "";
    if (/request failed with status code 404/i.test(errMessage)) {
      return "The requested file or resource could not be found.";
    }

    return err?.message || "An unexpected error occurred.";
  };

  const recordMarkingErrorsForStudents = (studentList, err, fallbackMessage = "An unexpected error occurred.") => {
    const message = err
      ? (extractHumanError(err) || err?.message || fallbackMessage)
      : fallbackMessage;
    const raw = err?.response?.data ?? null;
    (studentList || []).forEach(s => {
      const submissionId = s?.submissionId ?? s?.student?.submissionId;
      if (submissionId) {
        recordStudentMarkingError(submissionId, message, raw);
      }
    });
    return message;
  };

  const studentParams = useMemo(() => ({
    search: studentSearch,
  }), [studentSearch]);

    const { data: students, page, totalPages, total: studentTotal, loading, fetchPage, extra, setData: setStudents, error: studentFetchError } =
  usePagination(
    `/assignment-submissions/${assignmentId}/students`,
    studentParams,
    10,
    "students",
    !!assignmentId
  );

  const { dueDateTime, maxGrade, assignmentTitle, classroomId, summaryMap = {}, googleUnavailable } = extra;

  // Batch polling runs on a setInterval that outlives the render it was created
  // in, so anything it reads directly would be frozen at that moment. Keep the
  // values it needs live here. Updated every render on purpose (no dep array).
  const pollCtxRef = useRef({ assignmentId: null, page: 1, fetchPage: null });
  useEffect(() => {
    pollCtxRef.current = { assignmentId, page, fetchPage };
  });

  useEffect(() => {
    if (!assignmentId || loading) return;
    if (studentFetchError) {
      toast.error(`Could not load students: ${studentFetchError}`);
    } else if (googleUnavailable) {
      toast.warn(
        "Google Classroom is temporarily unavailable — showing saved students. Ask the director to reconnect the classroom Gmail account if this persists."
      );
    }
  }, [assignmentId, loading, studentFetchError, googleUnavailable]);

  const markingSelection = useMarkingStudentSelection();
  const [selectingMarkingAll, setSelectingMarkingAll] = useState(false);

  const studentsMarkingUrl = assignmentId
    ? `/assignment-submissions/${assignmentId}/students`
    : null;

  useEffect(() => {
    markingSelection.clear();
  }, [assignmentId]);

  const pageSelectableIds = useMemo(
    () => students.filter((s) => s.submissionId).map((s) => s.submissionId),
    [students]
  );

  const pageAllMarkingSelected = useMemo(
    () =>
      pageSelectableIds.length > 0 &&
      pageSelectableIds.every((id) => markingSelection.isSelected(id)),
    [pageSelectableIds, markingSelection.selectedIds]
  );

  const toggleMarkingSelectPage = () => {
    if (pageAllMarkingSelected) {
      markingSelection.selectIds(
        [...markingSelection.selectedIds].filter(
          (id) => !pageSelectableIds.includes(id)
        )
      );
    } else {
      markingSelection.mergeIds(pageSelectableIds);
    }
  };

  const selectAllStudentsForMarking = async () => {
    if (!studentsMarkingUrl) return;
    setSelectingMarkingAll(true);
    try {
      const all = await fetchAllPaginated(api, studentsMarkingUrl, {}, "students");
      const ids = all.filter((s) => s.submissionId).map((s) => s.submissionId);
      markingSelection.selectIds(ids);
      toast.success(`Selected ${ids.length} student(s)`);
    } catch {
      toast.error("Failed to load all students");
    } finally {
      setSelectingMarkingAll(false);
    }
  };

  const resolveEligibleForMarking = async (requireSubmitted = false) => {
    toast.info(
      markingSelection.selectedCount
        ? `Preparing ${markingSelection.selectedCount} selected student(s)…`
        : "Loading all students for this assignment…"
    );
    const result = await loadEligibleStudentsForMarking(api, {
      assignmentId,
      studentsUrl: studentsMarkingUrl,
      selectedIds: markingSelection.selectedIds,
      requireSubmitted,
    });

    if (result.error === "none_of_selected_found") {
      toast.warn("Selected students were not found on this assignment");
      return null;
    }

    const { allStudents, eligible, pool } = result;

    if (markingSelection.selectedCount > 0 && !eligible.length) {
      toast.warn("None of the selected students are eligible for marking (may already be marked)");
      return null;
    }

    if (!eligible.length) {
      const withSubmissions = (allStudents || []).filter((s) => s.submissionId);
      if (!withSubmissions.length) {
        toast.warn("No students with submissions");
        return null;
      }
      toast.warn(
        markingSelection.selectedCount
          ? "Selected students are already marked or not eligible"
          : "All submitted students are already marked for this assignment"
      );
      return null;
    }

    if (markingSelection.selectedCount > 0 && eligible.length < pool.length) {
      toast.info(
        `${eligible.length} of ${pool.length} selected will be marked (others already marked)`
      );
    }

    return { allStudents, eligible };
  };

  // Advisory pre-grading page-count check (shared hook + modal)
  const { pageCheckModal, confirmPageCounts, resolvePageCheck } = usePageCountCheck();
  // Per-submission page-count flags, populated as soon as the check runs so the
  // row warnings update without waiting for grading.
  const [pageCountFlags, setPageCountFlags] = useState({});
  const applyPageCountReport = (report) =>
    setPageCountFlags((prev) => ({ ...prev, ...buildPageCountFlagMap(report) }));
  const pageCheckArgs = (students) => ({ assignmentId, classroomId, students, onReport: applyPageCountReport });

  const assignmentMaxPoints = useMemo(
    () =>
      resolveAssignmentMaxPoints(
        { maxPoints: syncedClassroomMaxPoints ?? maxGrade },
        savedResults
      ),
    [syncedClassroomMaxPoints, maxGrade, savedResults]
  );

  const setPercentOverride = (submissionId, percentage) => {
    if (!submissionId) return;
    setPercentOverrides((prev) => ({
      ...prev,
      [submissionId]: percentage,
    }));
    if (percentage != null && assignmentMaxPoints) {
      const grade = gradeFromPercent(percentage, assignmentMaxPoints);
      if (grade != null) {
        setGradeOverrides((prev) => ({
          ...prev,
          [submissionId]: grade,
        }));
      }
    }
  };

  const setGradeOverride = (submissionId, grade) => {
    if (!submissionId) return;
    if (grade == null) {
      setGradeOverrides((prev) => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      return;
    }
    setGradeOverrides((prev) => ({
      ...prev,
      [submissionId]: grade,
    }));
    if (assignmentMaxPoints) {
      setPercentOverrides((prev) => ({
        ...prev,
        [submissionId]: computeGradePercent(grade, assignmentMaxPoints),
      }));
    }
  };

  const resolvePdfSummary = (submissionId, result) =>
    getMarkingResultSummary(result, {
      storedSummary: savedResults[submissionId]?.summary,
      studentSummary: summaryMap[submissionId],
    });


  const effectiveMaxTotal = resolveDisplayMaxTotal({
    assignmentMaxPoints,
    result: resultModal?.result,
    editingMaxTotal,
  });

  const {
    annotatedPreviewUrl,
    previewLoading,
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmEdits,
    resetToConfirmed,
    reportPageCount,
  } = useAnnotatedResultPreview({
    api,
    assignmentId,
    resultModal,
    editingQuestions,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    assignmentMaxPoints,
    editingMaxTotal,
    resolvePdfSummary,
    pendingRemovedIndices,
  });

  const handleAnnotationPlacementChange = useCallback(
    ({ questionNumber, pageNumber, yPercent }) => {
      setEditingQuestions((prev) =>
        prev.map((q) =>
          String(q.questionNumber) === String(questionNumber)
            ? {
                ...q,
                pageNumber: Math.max(1, Number(pageNumber) || 1),
                yPercent,
              }
            : q
        )
      );
    },
    []
  );

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

  const questionsForDisplay = useMemo(
    () => filterQuestionsPendingRemoval(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

  const placementQuestions = useMemo(
    () => buildPlacementQuestions(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

  useEffect(() => {
    if (!resultModal || summaryTouched) return;
    const submissionId =
      resultModal.submissionId || resultModal.student?.submissionId;
    setEditingSummary(
      rebuildMarkingSummary({
        questions: questionsForDisplay,
        maxTotalMarks: effectiveMaxTotal,
        previousSummary:
          resultModal.result?.summary ||
          getMarkingResultSummary(resultModal.result, {
            storedSummary: savedResults[submissionId]?.summary,
          }),
      })
    );
  }, [
    resultModal,
    questionsForDisplay,
    effectiveMaxTotal,
    summaryTouched,
    savedResults,
  ]);

  // useEffect(() => {
  //   if (!assignmentId) return;
  //   fetchStudents();
  // }, [assignmentId]);

    useEffect(() => {
    if (!promptDropdownOpen) return;
    const close = () => setPromptDropdownOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [promptDropdownOpen]);

  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const res = await api.get("/marking/prompts")
        setSavedPrompts(res.data || []);
      } catch (err) {
        console.error("Failed to load prompts", err);
      }
    };

    fetchPrompts();
    api.get("/marking/gemini-models")
      .then((r) => {
        const { models } = parseGeminiModelsResponse(r.data);
        setGeminiModels(models);
        setGeminiModel((prev) => pickValidGeminiModel(models, prev));
      })
      .catch(() => {
        const models = getDefaultMarkingModels();
        setGeminiModels(models);
        setGeminiModel((prev) => pickValidGeminiModel(models, prev));
      });
  }, []);

  // to upload mark scheme if it exists for the assignment
  useEffect(() => {
    api.get(`/manager-assignments/${assignmentId}/full`, { params: { page: 1, limit: 1 } })
      .then(res => {
        setMsInfo({
          fileId: res.data.assignment.markSchemeFileId,
          webLink: res.data.assignment.markSchemeWebLink
        });
        setSubjectId(res.data.assignment.subjectId || null);
        setExpectedPages(res.data.assignment.expectedPages ?? null);
        setExpectedPagesInput(res.data.assignment.expectedPages != null ? String(res.data.assignment.expectedPages) : "");
      });
  }, [assignmentId]);

  const fetchSavedResults = useCallback(async () => {
    try {
      const res = await api.get(`/submission-files/save-results/${assignmentId}`);
      const map = {};
      const synced = {};
      res.data.data.forEach(r => {
        map[r.submissionId] = {
          status: "done",
          result: r.result,
          aiOriginalResult: r.aiOriginalResult || r.result,
          studentFile: r.studentFileMeta,
          totalMarks: resolveSavedMarkingGrade(r),
          classroomAssignedGrade: r.classroomAssignedGrade ?? null,
          summary: r.summary || getMarkingResultSummary(r.result) || "",
          returnedAt: r.returnedAt ?? null,
          updatedAt: r.updatedAt ?? null,
          teacherEditedAt: r.teacherEditedAt ?? null,
        };
        if (r.classroomAssignedGrade != null) {
          synced[r.submissionId] = r.classroomAssignedGrade;
        }
      });
      setSavedResults(map);
      setClassroomSyncedGrades(synced);
      setSingleProgress(prev => ({ ...prev, ...map }));
    } catch (err) {
      console.error("Failed to load saved results", err);
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchSavedResults();
  }, [fetchSavedResults]);

useEffect(() => {
  if (!students.length || !Object.keys(savedResults).length) return;
  let changed = false;
  const updated = students.map(s => {
    if (classroomSyncedGrades[s.submissionId] != null) return s;
    if (savedResults[s.submissionId]?.classroomAssignedGrade != null) return s;
    const sr = savedResults[s.submissionId];
    if (!sr) return s;
    const newGrade = resolveSavedMarkingGrade(sr);
    if (s.assignedGrade === newGrade) return s;
    changed = true;
    return { ...s, assignedGrade: newGrade };
  });
  if (changed) setStudents(updated);
}, [savedResults, students, classroomSyncedGrades]);

const refreshStudents = async () => {
  if (!assignmentId) return;
  setRefreshing(true);
  try {
    const { students: freshList, maxPoints, pushResult } = await refreshAssignmentGrades(
      api,
      assignmentId,
      "assistant",
      { gradeOverrides, students, savedResults, classroomSyncedGrades }
    );
    const syncedMaxPoints = maxPoints ?? maxGrade ?? null;
    if (syncedMaxPoints != null) {
      setSyncedClassroomMaxPoints(syncedMaxPoints);
      setEditingMaxTotal(null);
    }

    let savedMap = {};
    try {
      const res = await api.get(`/submission-files/save-results/${assignmentId}`);
      (res.data.data || []).forEach((r) => {
        savedMap[r.submissionId] = {
          totalMarks: resolveSavedMarkingGrade(r),
          result: r.result,
        };
      });
      await fetchSavedResults();
    } catch {
      // saved results optional
    }

    const pushedIds = new Set(
      (pushResult?.results || []).filter((r) => r.ok).map((r) => r.submissionId)
    );

    let nextSyncedGrades = { ...classroomSyncedGrades };
    for (const row of pushResult?.results || []) {
      if (row.ok && row.submissionId != null) {
        nextSyncedGrades[row.submissionId] = row.assignedGrade;
      }
    }
    if (pushResult?.results?.length) {
      setClassroomSyncedGrades(nextSyncedGrades);
      setSavedResults((prev) => {
        const next = { ...prev };
        for (const row of pushResult.results) {
          if (!row.ok || !row.submissionId) continue;
          next[row.submissionId] = {
            ...(next[row.submissionId] || {}),
            classroomAssignedGrade: row.assignedGrade,
          };
        }
        return next;
      });
    }

    const mergedGrades = freshList.map((s) => {
      const syncedGrade = nextSyncedGrades[s.submissionId];
      if (syncedGrade != null) {
        return { ...s, assignedGrade: Number(syncedGrade) };
      }
      if (pushedIds.has(s.submissionId)) return s;
      const sr = savedMap[s.submissionId];
      if (!sr) return s;
      const grade = resolveSavedMarkingGrade(sr);
      return grade != null ? { ...s, assignedGrade: grade } : s;
    });

    const effectiveMax =
      syncedMaxPoints ??
      resolveAssignmentMaxPoints({ maxPoints: maxGrade }, savedMap);

    if (effectiveMax != null) {
      setPercentOverrides(
        buildPercentOverridesFromStudents(
          mergedGrades,
          effectiveMax,
          (s) => s.submissionId
        )
      );
    } else {
      setPercentOverrides({});
    }

    if (pushResult?.results?.length) {
      const succeeded = pushResult.results.filter((r) => r.ok).map((r) => r.submissionId);
      setGradeOverrides((prev) => {
        const next = { ...prev };
        for (const id of succeeded) delete next[id];
        return next;
      });
    } else {
      setGradeOverrides({});
    }

    await fetchPage(page);

    if (pushResult?.pushed > 0 && !pushResult?.failed) {
      toast.success(
        `Updated ${pushResult.pushed} grade${pushResult.pushed === 1 ? "" : "s"} in Google Classroom`
      );
    } else if (pushResult?.pushed > 0 && pushResult?.failed > 0) {
      toast.warn(
        `Updated ${pushResult.pushed} grade(s) in Google Classroom; ${pushResult.failed} failed`
      );
    }
    toast.success("Synced grades, max points, and percentages from Google Classroom");
    try {
      await assignmentPrompt.reload();
    } catch {
      // prompt reload optional
    }
  } catch (err) {
    const detail =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Failed to refresh from Google Classroom";
    toast.error(formatGoogleOAuthError(detail) || detail);
    } finally {
    setRefreshing(false);
  }
};

const handleExportGradesExcel = async () => {
  if (!assignmentId) return;

  const raw = await promptToast(
    "Enter the grade scale for this export (e.g. 20 for grades out of 20):",
    {
      title: "Export grades to Excel",
      placeholder: "20",
      defaultValue: "20",
      confirmLabel: "Export",
    }
  );
  if (raw == null) return;

  const targetMax = Number(String(raw).trim());
  if (!Number.isFinite(targetMax) || targetMax <= 0) {
    toast.warn("Please enter a valid number greater than 0");
    return;
  }

  setExportingGrades(true);
  try {
    const allStudents = await fetchAllPaginated(
      api,
      `/assignment-submissions/${assignmentId}/students`,
      {},
      "students"
    );

    const mergedStudents = allStudents.map((s) => {
      const sr = savedResults[s.submissionId];
      if (!sr) return s;
      const grade = resolveSavedMarkingGrade(sr);
      return grade != null ? { ...s, assignedGrade: grade } : s;
    });

    const filename = `${sanitizeExcelFilenameBase(assignmentTitle)}_grades_${targetMax}.xlsx`;
    await exportAssignmentGradesExcel({
      students: mergedStudents,
      targetMax,
      assignmentMaxPoints,
      savedResults,
      percentOverrides,
      gradeOverrides,
      classroomSyncedGrades,
      filename,
      assignmentTitle,
    });
    toast.success("Grades exported to Excel");
  } catch (err) {
    toast.error(err?.message || "Failed to export grades");
  } finally {
    setExportingGrades(false);
  }
};

const deleteCorrection = async (student) => {
  const { submissionId } = student;
  setDeletingCorrection(prev => ({ ...prev, [submissionId]: true }));
  try {
    await api.delete(`/submission-files/save-results/${assignmentId}/${submissionId}`);
    setSavedResults(prev => { const n = { ...prev }; delete n[submissionId]; return n; });
    setSingleProgress(prev => { const n = { ...prev }; delete n[submissionId]; return n; });
    setBulkProgress(prev => { const n = { ...prev }; delete n[submissionId]; return n; });
    toast.success("Correction deleted");
  } catch (e) {
    toast.error("Failed to delete correction");
  } finally {
    setDeletingCorrection(prev => ({ ...prev, [submissionId]: false }));
  }
};




  const handleMsUpload = async (file) => {
    if (!file) return;
    setUploadingMs(true);
    try {
      const fd = new FormData();
      fd.append("markScheme", file);

      const res = await api.post(
        `/manager-assignments/${assignmentId}/upload-markscheme`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

    setMsInfo({ fileId: res.data.fileId, webLink: res.data.webLink });
    // setCachedMsFile(file); 
      toast.success("Mark scheme uploaded");
    } catch (err) {
      toast.error(err.response?.data?.message || "Upload failed");
    } finally { setUploadingMs(false); }
  };

  const openPdf = async (student) => {
    try {
      const res = await api.get("/submission-files/pdf", {
        params: { assignmentId, submissionId: student.submissionId },
        responseType: "blob"
      })

const blob = new Blob([res.data], { type: "application/pdf" });
const url = URL.createObjectURL(blob);
window.open(url);
    } catch {
      toast.error("Failed to open PDF");
    }
  };

  const downloadPdf = async (student) => {
    try {
      const res = await api.get("/submission-files/pdf", {
        params: { assignmentId, submissionId: student.submissionId },
        responseType: "blob"
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      downloadBlob(blob, `${student.name || "submission"}.pdf`);
    } catch {
      toast.error("Download failed");
    }
  };

  const stopBulkMark = () => {
    bulkStopRef.current = true;
    setBulkMarking(false);
    setBulkProgress((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const status = next[id]?.status;
        if (status === "pending" || status === "marking" || status === "retrying") {
          next[id] = { status: "stopped" };
        }
      }
      return next;
    });
    toast.info("Stopping bulk marking…");
  };

  const stopBatchMark = async () => {
    if (!assignmentId) return;
    setBatchStopped(assignmentId, true);

    const jobId = batchJob?.jobId;
    if (jobId) clearBatchPoll(jobId);
    patchBatchJob(assignmentId, null);

    if (jobId) {
      try {
        await api.delete(`/marking/mark-batch/cancel/${jobId}`);
        toast.info("Batch marking cancelled");
      } catch (err) {
        toast.warning(extractHumanError(err) || "Batch stop requested — server cancel failed");
      }
    }
  };

  const openGuidanceModal = (student = null, isBatch = false) => {
    if (expectedPages === null) {
      toast.warn("Please set the expected page count for this assignment before marking");
      setShowExpectedPagesEdit(true);
      return;
    }
    setGuidanceModal(
      isBatch
        ? { batch: true }
        : student
        ? { student }
        : { bulk: true }
    );

    setGuidance(resolveMarkingGuidanceText("", assignmentPrompt.content));
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
  };

  const handleRunMsVerification = async (extraInstructions = "") => {
    if (!assignmentId) return;
    setMsVerifying(true);
    setMsVerifyResult(null);
    try {
      const result = await runMarkSchemeVerification(assignmentId, extraInstructions);
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

  const handleSetExpectedPages = async () => {
    if (!assignmentId) return;
    const val = expectedPagesInput.trim();
    const parsed = val === "" ? null : parseInt(val, 10);
    if (val !== "" && (!Number.isInteger(parsed) || parsed <= 0)) {
      toast.warn("Expected pages must be a positive integer");
      return;
    }
    setSettingExpectedPages(true);
    try {
      await api.patch(`/manager-assignments/${assignmentId}/expected-pages`, { expectedPages: parsed });
      setExpectedPages(parsed);
      setShowExpectedPagesEdit(false);
      toast.success(parsed != null ? `Expected pages set to ${parsed}` : "Expected pages check disabled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to set expected pages");
    } finally {
      setSettingExpectedPages(false);
    }
  };

  const getOriginalQuestions = (modal) =>
    modal?.originalAiResult?.questions || modal?.result?.questions || [];

  const runMarkStudent = async (student, guidanceText, mode = "normal", markingProvider) => {
    // Advisory page-count check before spending AI tokens on a possibly-wrong file.
    const proceed = await confirmPageCounts(pageCheckArgs([student]));
    if (!proceed) return;

    setMarkingStudentId(student.submissionId);
    setSingleProgress(prev => ({
      ...prev,
      [student.submissionId]: {
        status: "marking"
      }
    }));

    try {
      const [studentPdfRes, msPdfRes] = await Promise.all([
        api.get("/submission-files/pdf", {
          params: { assignmentId, submissionId: student.submissionId },
          responseType: "blob"
        }),
        api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
          responseType: "blob"
        })
      ]);


      await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
      await assertPdfBlob(msPdfRes.data, "Mark scheme");

      const studentFile = new File(
        [studentPdfRes.data],
        `${student.name || "student"}.pdf`,
        { type: "application/pdf" }
      );

      const msFile = new File(
        [msPdfRes.data],
        "markscheme.pdf",
        { type: "application/pdf" }
      );

      const fd = new FormData();
      fd.append("studentPdf", studentFile);
      if (maxGrade) fd.append("totalGrade", maxGrade);
      fd.append("markingMode", mode);
      const guidanceValue = guidanceForForm(guidanceText);
      if (guidanceValue) fd.append("guidance", guidanceValue);
      appendMarkingContext(fd, { assignmentId, classroomId });

      if (markingProvider !== "claude") {
        fd.append("geminiModel", geminiModel);
      }
      fd.append("markSchemePdf", msFile);

      const endpoint =
      markingProvider === "claude"
        ? "/markingClaude/mark-claude"
        : "/marking/mark";

      const res = await api.post(endpoint, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      setResultModal({
        student,
        result: res.data,
        originalAiResult: JSON.parse(JSON.stringify(res.data)),
        studentFile,
        submissionId: student.submissionId
      });
      setSingleProgress(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: res.data,
          studentFile,
          submissionId: student.submissionId
        }
      }));
      await api.post("/submission-files/save-results", {
          assignmentId,
          submissionId: student.submissionId,
          studentId: student.studentId,
          studentName: student.name,
          mode,
          provider: markingProvider,
          result: res.data
        });
      setSavedResults(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: res.data,
          aiOriginalResult: JSON.parse(JSON.stringify(res.data)),
          totalMarks: resolveTotalMarksFromResult(res.data),
        }
      }));

      setStudents(prev =>
        prev.map(s =>
          s.submissionId === student.submissionId
            ? {
                ...s,
                assignedGrade: resolveTotalMarksFromResult(res.data)
              }
            : s
        )
      );

      setEditingQuestions((res.data.questions || []).map(q => ({ ...q })));
      setEditingAnnotations(getTeacherAnnotations(res.data).map((a) => ({ ...a })));

    } catch (err) {
          const message = extractHumanError
        ? extractHumanError(err)
        : await getApiErrorMessage(err);

      recordStudentMarkingError(
        student.submissionId,
        message,
        err.response?.data
      );
      setSingleProgress(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "error"
        }
      }));

      openErrorViewer(
        `Marking Failed - ${student.name}`,
        message
      );

      toast.error(message);
      toast.error(await getApiErrorMessage(err));
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runBulkMark = async (guidanceText, mode = "normal", provider = markingProvider) => {
    try {
    const loaded = await resolveEligibleForMarking(false);
    if (!loaded) return;
    const { eligible } = loaded;

    // Advisory page-count check before spending AI tokens on possibly-wrong files.
    const proceed = await confirmPageCounts(pageCheckArgs(eligible));
    if (!proceed) return;

    const guidanceValue = guidanceForForm(guidanceText);

    bulkStopRef.current = false;
      setBulkMarking(true);

      const progress = {};
    eligible.forEach(s => {
      progress[s.submissionId] = { status: "pending" };
    });
      setBulkProgress({ ...progress });

    let doneCount = 0;
    let errorCount = 0;
  
      for (const student of eligible) {
      if (bulkStopRef.current) break;

      setBulkProgress(p => ({
        ...p,
        [student.submissionId]: { status: "marking", attempt: 0, maxAttempts: MARKING_MAX_ATTEMPTS }
      }));

      // -----------------------------
      // 1. FETCH FILES (NO RETRY)
      // -----------------------------
      let studentFile;
      let msFile;

        try {
          const [studentPdfRes, msPdfRes] = await Promise.all([
            api.get("/submission-files/pdf", {
            params: { assignmentId, submissionId: student.submissionId },
              responseType: "blob"
            }),
            api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
              responseType: "blob"
            })
          ]);
  
        await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
        await assertPdfBlob(msPdfRes.data, "Mark scheme");

        studentFile = new File(
          [studentPdfRes.data],
          `${student.name || "student"}.pdf`,
          { type: "application/pdf" }
        );
        msFile = new File(
          [msPdfRes.data],
          "markscheme.pdf",
          { type: "application/pdf" }
        );

      } catch (err) {
        const status = err?.response?.status;
        const loadMessage = await getApiErrorMessage(err);
        const noPdf =
          status === 404 ||
          /no pdf|no attachment/i.test(loadMessage);

        if (noPdf && isStudentSubmitted(student.state)) {
          const zeroResult = buildNoSubmissionMarkingResult({
            markingMode: mode,
            maxTotalMarks: maxGrade,
          });
          try {
            await api.post("/submission-files/save-results", {
              assignmentId,
              submissionId: student.submissionId,
              studentId: student.studentId,
              studentName: student.name,
              mode,
              provider,
              result: zeroResult,
            });
          } catch (saveErr) {
            console.error("save zero result:", saveErr);
          }

          setBulkProgress(p => ({
            ...p,
            [student.submissionId]: {
              status: "done",
              result: zeroResult,
            },
          }));
          setStudents(prev =>
            prev.map(s =>
              s.submissionId === student.submissionId
                ? { ...s, assignedGrade: 0 }
                : s
            )
          );
          continue;
        }

        if (noPdf) {
          continue;
        }

        setBulkProgress(p => ({
          ...p,
          [student.submissionId]: { status: "error" }
        }));

        recordStudentMarkingError(
          student.submissionId,
          loadMessage || "Failed to load files",
          err.response?.data
        );

        errorCount++;
        continue;
      }

      // -----------------------------
      // 2. PREP FORM DATA (ONCE)
      // -----------------------------
          const fd = new FormData();
      fd.append("studentPdf", studentFile);
      fd.append("markingMode", mode);

      if (guidanceValue) fd.append("guidance", guidanceValue);
      if (maxGrade) fd.append("totalGrade", maxGrade);

      appendMarkingContext(fd, {
        assignmentId,
        classroomId
      });
      if (provider !== "claude") {
        fd.append("geminiModel", geminiModel);
      }
          fd.append("markSchemePdf", msFile);

      const endpoint =
        provider === "claude"
          ? "/markingClaude/mark-claude"
          : "/marking/mark";

      const markResult = await runWithMarkingRetries({
        shouldStop: () => bulkStopRef.current,
        onAttemptStart: (attempt, maxAttempts) => {
          setBulkProgress(p => ({
            ...p,
            [student.submissionId]: { status: "marking", attempt, maxAttempts },
          }));
        },
        onRetry: (attempt, maxAttempts, delay) => {
          setBulkProgress(p => ({
            ...p,
            [student.submissionId]: {
              status: "retrying",
              attempt,
              maxAttempts,
              delaySeconds: Math.round(delay / 1000),
            },
          }));
        },
        execute: async () => {
          const res = await api.post(endpoint, fd, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 600000,
          });
          setSavedResults(prev => ({
            ...prev,
            [student.submissionId]: {
              status: "done",
              result: res.data,
              aiOriginalResult: JSON.parse(JSON.stringify(res.data)),
              totalMarks: resolveTotalMarksFromResult(res.data),
            }
          }));
          return res.data;
        },
      });

      if (markResult.stopped) break;

      if (markResult.success) {
        const resultData = markResult.result;
        doneCount++;

        setBulkProgress(p => ({
          ...p,
          [student.submissionId]: {
            status: "done",
            result: resultData,
            studentFile,
          },
        }));

        setStudents(prev =>
          prev.map(s =>
            s.submissionId === student.submissionId
              ? {
                  ...s,
                  assignedGrade: resolveTotalMarksFromResult(resultData),
                }
              : s
          )
        );

        await api.post("/submission-files/save-results", {
          assignmentId,
          submissionId: student.submissionId,
          studentId: student.studentId,
          studentName: student.name,
          mode,
          provider,
          result: resultData,
        });
      } else {
        errorCount++;
        const err = markResult.error;
        const message = markResult.exhausted
          ? MARKING_MAX_RETRIES_MESSAGE
          : extractHumanError(err);

        setBulkProgress(p => ({
          ...p,
          [student.submissionId]: { status: "error" },
        }));

        recordStudentMarkingError(
          student.submissionId,
          message,
          err?.response?.data
        );
      }
    }

    if (bulkStopRef.current) {
      setBulkProgress(p => {
        const next = { ...p };
        for (const s of eligible) {
          const st = next[s.submissionId]?.status;
          if (st === "pending" || st === "marking" || st === "retrying") {
            next[s.submissionId] = { status: "cancelled" };
          }
        }
        return next;
      });
      toast.info(`Bulk marking stopped — ${doneCount} marked, ${errorCount} failed`);
    } else if (errorCount === 0) {
      toast.success(`Bulk marking complete — ${doneCount} student${doneCount === 1 ? "" : "s"} marked`);
    } else if (doneCount > 0) {
      toast.warning(`Bulk marking finished — ${doneCount} marked, ${errorCount} failed`);
    } else {
      toast.error(`Bulk marking failed — ${errorCount} student${errorCount === 1 ? "" : "s"} could not be marked`);
    }

      setBulkMarking(false);
    if (bulkStopRef.current) {
      toast.info("Bulk marking stopped");
    } else {
      toast.success("Bulk marking complete");
    }
    fetchPage(page);
  } catch (err) {
    setBulkMarking(false);
    toast.error(await getApiErrorMessage(err));
  }
  };

  const checkForActiveJob = async () => {
    if (!assignmentId) return;
    try {
      const { data } = await api.get(`/marking/mark-batch/active/${assignmentId}`);
      if (data.active) {
        const {
          jobId,
          studentOrder,
          submittedAt,
          geminiModel: jobModel,
        } = data.active;
        const restoredModel = pickValidGeminiModel(geminiModels, jobModel || geminiModel);
        setBatchStopped(assignmentId, false);
        patchBatchJob(assignmentId, {
          phase: "processing",
          jobId,
          total: studentOrder?.length || 0,
          submittedAt,
          skipped: {},
          results: {},
          mode: "normal",
          geminiModel: restoredModel,
          batchStudents: studentOrder || [],
        });
        pollBatchJob(jobId, {
          assignmentId,
          mode: "normal",
          geminiModel: restoredModel,
          batchStudents: studentOrder || [],
        });
      } else if (batchJob?.phase === "processing") {
        patchBatchJob(assignmentId, null);
      }
    } catch (err) {
      console.error("checkForActiveJob:", err.message);
    }
  };

  useEffect(() => {
    if (!assignmentId) return;
    checkForActiveJob();
  }, [assignmentId]);

  const pollBatchJob = async (jobId, jobMeta = {}) => {
    const assignId = jobMeta.assignmentId || assignmentId;
    if (!assignId || !jobId) return;
    if (isBatchStopped(assignId)) return;

    clearBatchPoll(jobId);

    // True only while the job's assignment is still the one on screen — read
    // live, since this runs inside a long-lived interval.
    const isViewingThisAssignment = () => assignId === pollCtxRef.current.assignmentId;

    const doPoll = async () => {
      if (isBatchStopped(assignId)) return;
      try {
        const { data } = await api.get(`/marking/mark-batch/status/${jobId}`);

        if (data.state === "JOB_STATE_PENDING" || data.state === "JOB_STATE_RUNNING") {
          patchBatchJob(assignId, (prev) => ({ ...prev, phase: "processing", jobId }));
          return;
        }

        clearBatchPoll(jobId);

        if (data.state === "JOB_STATE_FAILED") {
          const message = "Batch marking job failed.";
          if (isViewingThisAssignment()) {
            recordMarkingErrorsForStudents(jobMeta.batchStudents, null, message);
          }
          patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
          toast.error(message);
          return;
        }

        const resultMap = {};
        const saveMode = jobMeta.mode || "normal";
        const modelForResult = jobMeta.geminiModel || geminiModel;
        for (const { student, result, success, error, tokenUsage, compression } of data.results) {
          const enrichedResult = success
            ? buildBatchMarkingResult(result, tokenUsage, modelForResult, compression)
            : null;
          const originalAiResult = enrichedResult
            ? JSON.parse(JSON.stringify(enrichedResult))
            : null;
          resultMap[student.submissionId] = success
            ? { status: "done", result: enrichedResult, originalAiResult }
            : { status: "error", error };

          if (!success && isViewingThisAssignment()) {
            const message =
              typeof error === "string"
                ? error
                : error?.message || "Batch marking failed";
            recordStudentMarkingError(student.submissionId, message, error);
          }

          if (success) {
            if (isViewingThisAssignment()) {
              setStudents((prev) =>
                prev.map((s) =>
                  s.submissionId === student.submissionId
                    ? {
                        ...s,
                        assignedGrade: resolveTotalMarksFromResult(result),
                      }
                    : s
                )
              );
            }

            await api.post("/submission-files/save-results", {
              assignmentId: assignId,
              submissionId: student.submissionId,
              studentId: student.studentId,
              studentName: student.name,
              mode: saveMode,
              provider: "gemini-batch",
              result: enrichedResult,
            }).catch((e) => console.error("save-results:", e.message));
          }
        }

        patchBatchJob(assignId, (prev) => ({
          ...prev,
          phase: "done",
          results: { ...prev?.results, ...resultMap },
        }));
        const okCount = data.results.filter((r) => r.success).length;
        toast.success(`Batch complete — ${okCount} student${okCount === 1 ? "" : "s"} marked.`);
        if (isViewingThisAssignment()) {
          const { fetchPage: livePage, page: livePageNum } = pollCtxRef.current;
          livePage?.(livePageNum);
        }
      } catch (err) {
        console.error("Poll error:", err);
        clearBatchPoll(jobId);
        patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
        toast.error(`Polling failed: ${extractHumanError(err)}`);
      }
    };

    doPoll();
    registerBatchPoll(jobId, setInterval(doPoll, 15_000));
  };

  const runBatchMark = async (guidanceText, mode = "normal", modelOverride = null) => {
    const selectedModel = pickValidGeminiModel(
      geminiModels,
      modelOverride || geminiModel
    );
    if (selectedModel !== geminiModel) {
      setGeminiModel(selectedModel);
    }

    let eligible;
    try {
      const loaded = await resolveEligibleForMarking(true);
      if (!loaded) return;
      eligible = loaded.eligible;
    } catch (err) {
      toast.error(extractHumanError(err) || "Failed to check eligible students");
      return;
    }

    // Advisory page-count check before spending AI tokens on possibly-wrong files.
    const proceed = await confirmPageCounts(pageCheckArgs(eligible));
    if (!proceed) return;

    const guidanceValue = guidanceForForm(guidanceText);

    setBatchStopped(assignmentId, false);

    patchBatchJob(assignmentId, {
      phase: "uploading",
      total: eligible.length,
      skipped: {},
      results: {},
      mode,
      geminiModel: selectedModel,
      batchStudents: eligible.map((s) => ({
        submissionId: s.submissionId,
        studentId: s.studentId,
        name: s.name,
      })),
    });

    let msUri, succeeded, failed;
    try {
      const res = await api.post("/marking/mark-batch/upload", {
        assignmentId,
        students: eligible.map((s) => ({
          submissionId: s.submissionId,
          studentId: s.studentId,
          name: s.name,
        })),
      });
      ({ msUri, succeeded, failed } = res.data);
    } catch (err) {
      const message = recordMarkingErrorsForStudents(
        eligible,
        err,
        "Upload failed"
      );
      toast.error(`Upload failed: ${message}`);
      patchBatchJob(assignmentId, (prev) => ({ ...prev, phase: "error" }));
      return;
    }

    if (isBatchStopped(assignmentId)) {
      patchBatchJob(assignmentId, null);
      toast.info("Batch marking stopped");
      return;
    }

    const skipped = {};
    if (failed?.length) {
      toast.warning(`${failed.length} student(s) could not be uploaded`);
      failed.forEach(({ student, error }) => {
        skipped[student.submissionId] = { error };
        const message =
          typeof error === "string" ? error : error?.message || "Upload failed";
        recordStudentMarkingError(student.submissionId, message, error);
      });
      patchBatchJob(assignmentId, (prev) => ({ ...prev, skipped }));
    }

    if (!succeeded?.length) {
      const message = "No valid submissions to mark.";
      recordMarkingErrorsForStudents(eligible, null, message);
      toast.error(message);
      patchBatchJob(assignmentId, (prev) => ({ ...prev, phase: "error" }));
      return;
    }

    if (isBatchStopped(assignmentId)) {
      patchBatchJob(assignmentId, null);
      toast.info("Batch marking stopped");
      return;
    }

    patchBatchJob(assignmentId, (prev) => ({ ...prev, phase: "submitting" }));

    const submitPayload = {
      assignmentId,
      msUri,
      succeeded,
      markingMode: mode,
      guidance: guidanceValue,
      geminiModel: selectedModel,
      subjectId,
      ...(maxGrade && { totalGrade: maxGrade }),
      classroomId,
    };

    const submitResult = await runWithMarkingRetries({
      execute: async () => {
        try {
          const res = await api.post("/marking/mark-batch/submit", submitPayload);
          return { jobId: res.data.jobId, resumed: false };
        } catch (err) {
          if (err.response?.status === 409) {
            return { jobId: err.response.data.jobId, resumed: true };
          }
          throw err;
        }
      },
      onRetry: (attempt, maxAttempts, delay) => {
        toast.info(
          `Batch submit busy — retry ${attempt}/${maxAttempts} in ${Math.round(delay / 1000)}s…`
        );
      },
    });

    if (!submitResult.success) {
      const err = submitResult.error;
      const message = submitResult.exhausted
        ? MARKING_MAX_RETRIES_MESSAGE
        : recordMarkingErrorsForStudents(
            succeeded.map((r) => r.student),
            err,
            "Batch submission failed"
          );
      toast.error(`Batch submission failed: ${message}`);
      patchBatchJob(assignmentId, (prev) => ({ ...prev, phase: "error" }));
      return;
    }

    const { jobId, resumed } = submitResult.result;
    if (resumed) {
      toast.info("Resuming existing batch job...");
    }

    patchBatchJob(assignmentId, (prev) => ({
      ...prev,
      phase: "processing",
      jobId,
      batchStudents: succeeded.map((r) => r.student),
    }));

    pollBatchJob(jobId, {
      assignmentId,
      mode,
      geminiModel: selectedModel,
      batchStudents: succeeded.map((r) => r.student),
    });
  };

  const handleGuidanceConfirm = (provider = markingProvider) => {
    if (!guidanceModal) return;
    const resolvedGuidance = resolveMarkingGuidanceText(guidance, assignmentPrompt.content);
    if (markingModeModal === "criteria" && !resolvedGuidance) {
      return toast.warn("Criteria marking requires guidance to be provided");
    }
    const g    = resolvedGuidance;
    const mode = markingModeModal;
    setMarkingProvider(provider);
    if (guidanceModal.bulk) {
      setGuidanceModal(null);
      runBulkMark(g, mode, provider);
    } else if (guidanceModal.batch) {
      setGuidanceModal(null);
      runBatchMark(g, mode, pickValidGeminiModel(geminiModels, geminiModel));
    } else {
      setGuidanceModal(null);
      runMarkStudent(guidanceModal.student, g, mode, provider);
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
      const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      // const total = editingQuestions.reduce(
      //   (s, q) => s + (typeof q.marksAwarded === "number" ? q.marksAwarded : 0),0);
      
const isUngraded =
  maxGrade == null ||
  resultModal?.result?.totalMarks == null;

      // const pdfBytes = await annotatePdf({
      //   studentFile: resultModal.studentFile,
      //   questions: editingQuestions,
      //   totalMarks: isUngraded ? "Ungraded" : total,
      //   maxTotalMarks: isUngraded ? "" : maxGrade,
      // });
      const db = savedResults[resultModal.student?.submissionId];
    
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;

      const pdfRes = await api.get("/submission-files/pdf", {
        params: {
          assignmentId,
          submissionId: submissionId
        },
        responseType: "blob",
        timeout: 120_000,
      });
      const studentFile = new File(
        [pdfRes.data],
        "student.pdf",
        { type: "application/pdf" }
      );

      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        totalMarks: editingQuestions.reduce(
          (s, q) => s + q.marksAwarded,
          0
        ),
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
      });

      downloadBlob(new Blob([pdfBytes]), `${resultModal.student.name}_graded.pdf`);
      toast.success("Downloaded");
    } catch (err) {
      toast.error(await getApiErrorMessage(err) || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleCorrectionPatch = useCallback(({ questions, summary }) => {
    setEditingQuestions(questions.map((q) => ({ ...q })));
    if (summary) {
      setEditingSummary(summary);
      setSummaryTouched(true);
    }
  }, []);

  const handleConfirmEdits = async () => {
    if (!resultModal || !assignmentId) return;
    const appliedQuestions = questionsForConfirmEdits(
      editingQuestions,
      pendingRemovedIndices
    ).map((q) => ({ ...q }));
    try {
      const finalResult = await confirmEdits(async ({ finalResult, submissionId }) => {
        await api.post("/submission-files/save-results", {
          assignmentId,
          submissionId: resultModal.student.submissionId || submissionId,
          studentId: resultModal.student.studentId,
          studentName: resultModal.student.name,
          mode: finalResult.markingMode || markingModeModal,
          provider: markingProvider,
          result: finalResult,
        });
        if (finalResult.summary?.trim()) {
          await api.post("/submission-files/save-summary", {
            assignmentId,
            submissionId: resultModal.student.submissionId || submissionId,
            summary: finalResult.summary,
          });
        }
        setResultModal((prev) => ({
          ...prev,
          result: finalResult,
        }));
        setEditingSummary(finalResult.summary || "");
        setSummaryTouched(false);
        setEditingMaxTotal(null);
        setEditingTotal(null);
        await fetchSavedResults();
      });
      if (finalResult) {
        setEditingQuestions(appliedQuestions);
        setPendingRemovedIndices(new Set());
        toast.success("Edits confirmed — preview and grade updated");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to confirm edits");
    }
  };

  const getScoreColor = (awarded, max) => {
    if (!max) return "var(--primary)";
    const pct = awarded / max;
    if (pct >= 0.75) return "var(--success)";
    if (pct >= 0.5)  return "var(--warning)";
    return "var(--danger)";
  };

  const returnToStudent = async () => {
    if (!resultModal) return;
    if (hasPendingEdits) {
      toast.warn("Confirm your edits first so the returned PDF matches the preview");
      return;
    }

    const confirmed = await confirmReturnSingle(resultModal.student?.name);
    if (!confirmed) return;

    setReturning(true);
    try {
      const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      const db = savedResults[resultModal.student?.submissionId];
    
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;


      const pdfRes = await api.get("/submission-files/pdf", {
        params: {
          assignmentId,
          submissionId: submissionId
        },
        responseType: "blob"
      });
      const studentFile = new File(
        [pdfRes.data],
        "student.pdf",
        { type: "application/pdf" }
      );

      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        totalMarks: editingQuestions.reduce(
          (s, q) => s + q.marksAwarded,
          0
        ),
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
      });

      const fd = new FormData();
      fd.append("annotatedPdf",  new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId",  assignmentId);
      fd.append("submissionId",  resultModal.student.submissionId || submissionId);
      fd.append("totalMarks", total);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName",   resultModal.student.name || "Student");
      appendClassroomGradeToFormData(fd, {
        submissionId: resultModal.student.submissionId || submissionId,
        student: resultModal.student,
        gradeOverrides,
        savedResults,
        classroomSyncedGrades,
        fallbackTotal: total,
      });
      
      const pdfSummary = resolvePdfSummary(resultModal.student.submissionId, resultModal.result);
      if (pdfSummary) {
        await api.post("/submission-files/save-summary", {
          assignmentId,
          submissionId: resultModal.student.submissionId,
          summary: pdfSummary,
        });
      }

      await api.post("/submission-files/return-marked", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });
      // await api.post("/submission-files/save-summary")

      
      toast.success("Marked paper returned to student");
      toast.success(resultModal.summary)
      setResultModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to return paper");
    } finally { setReturning(false); }
  };


  const resolveBatchStudentForReturn = (submissionId) => {
    const fromPage = students.find(s => s.submissionId === submissionId);
    if (fromPage) return fromPage;
    const fromBatch = batchJob?.batchStudents?.find(s => s.submissionId === submissionId);
    if (fromBatch) return fromBatch;
    return { submissionId, name: "Student" };
  };

  const returnAllToStudents = async () => {
    if (!studentsMarkingUrl) {
      toast.error("Assignment not loaded");
      return;
    }

    let allStudents = [];
    try {
      allStudents = await fetchAllPaginated(api, studentsMarkingUrl, {}, "students");
    } catch (err) {
      console.error(err);
      toast.error("Failed to load all students for return");
      return;
    }

    const { bulkQueue, batchQueue } = buildReturnAllQueue({
      bulkProgress,
      batchJob,
      savedResults,
      singleProgress,
      allStudents,
    });

    if (!bulkQueue.length && !batchQueue.length) {
      toast.warn("No new graded students to return");
      return;
    }

    setReturning(true);

    const computeReturnMarks = (result, editingQs) => ({
      total: resolveTotalMarksFromResult(result) ??
        editingQs.reduce((s, q) => s + (Number(q.marksAwarded) || 0), 0),
      max:
        result?.criteriaGrade?.maxTotalMarks ??
        result?.maxTotalMarks ??
        maxGrade ??
        0,
    });

    try {
      for (const { submissionId, student, bulk } of bulkQueue) {

        if (!bulk?.result) {
          toast.error(`Missing data for ${student.name}. Stopping return process.`);
          throw new Error("Missing bulk data");
        }

        let studentFile = bulk.studentFile;
        if (!studentFile) {
          const pdfRes = await api.get("/submission-files/pdf", {
            params: {
              assignmentId,
              submissionId: student.submissionId,
            },
            responseType: "blob",
          });
          studentFile = new File(
            [pdfRes.data],
            `${student.name || "student"}.pdf`,
            { type: "application/pdf" }
          );
        }

        const editingQs = bulk.result.questions || [];
        const { total, max } = computeReturnMarks(bulk.result, editingQs);

        let pdfBytes;
        try {
          pdfBytes = await annotatePdf({
            studentFile,
            questions: editingQs,
            totalMarks: total,
            maxTotalMarks: max,
            summary: resolvePdfSummary(student.submissionId, bulk.result),
            outOfScopeNotes: getOutOfScopeNotes(bulk.result),
            teacherAnnotations: getTeacherAnnotations(bulk.result),
          });
        } catch (err) {
          console.error("PDF annotation failed for:", student.name, err);
          toast.error(`Failed to generate PDF for ${student.name}. Stopping process.`);
          throw err;
        }

        const fd = new FormData();
        fd.append("annotatedPdf", new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
        fd.append("assignmentId", assignmentId);
        fd.append("submissionId", student.submissionId);
        fd.append("totalMarks", total);
        fd.append("maxTotalMarks", max);
        fd.append("studentName", student.name || "Student");
        appendClassroomGradeToFormData(fd, {
          submissionId: student.submissionId,
          student,
          gradeOverrides,
          savedResults,
          classroomSyncedGrades,
          fallbackTotal: total,
        });

        try {
          await api.post("/submission-files/return-marked", fd, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120000
          });
        } catch (err) {
          console.error("Return failed for:", student.name, err);
          toast.error(`Return failed for ${student.name}. Stopping process.`);
          throw err;
        }

        const returnedAt = new Date().toISOString();
        setSavedResults((prev) => ({
          ...prev,
          [submissionId]: {
            ...(prev[submissionId] || {}),
            returnedAt,
          },
        }));

        setBulkProgress(p => ({
          ...p,
          [submissionId]: { ...bulk, returned: true }
        }));
      }

      for (const { student, batch, submissionId } of batchQueue) {
        if (!batch?.result) {
          toast.error(`Missing data for ${student.name || submissionId}. Stopping return process.`);
          throw new Error("Missing batch data");
        }

        const editingQs = batch.result.questions || [];
        const { total, max } = computeReturnMarks(batch.result, editingQs);

        let pdfBytes;
        try {
          const pdfRes = await api.get("/submission-files/pdf", {
            params: { assignmentId, submissionId },
            responseType: "blob",
          });
          const studentFile = new File(
            [pdfRes.data],
            `${student.name || "student"}.pdf`,
            { type: "application/pdf" }
          );
          pdfBytes = await annotatePdf({
            studentFile,
            questions: editingQs,
            totalMarks: total,
            maxTotalMarks: max,
            summary: resolvePdfSummary(submissionId, batch.result),
            outOfScopeNotes: getOutOfScopeNotes(batch.result),
            teacherAnnotations: getTeacherAnnotations(batch.result),
          });
        } catch (err) {
          console.error("PDF annotation failed for:", student.name, err);
          toast.error(`Failed to generate PDF for ${student.name || submissionId}. Stopping process.`);
          throw err;
        }

        const fd = new FormData();
        fd.append("annotatedPdf", new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
        fd.append("assignmentId", assignmentId);
        fd.append("submissionId", submissionId);
        fd.append("totalMarks", total);
        fd.append("maxTotalMarks", max);
        fd.append("studentName", student.name || "Student");
        appendClassroomGradeToFormData(fd, {
          submissionId,
          student,
          gradeOverrides,
          savedResults,
          classroomSyncedGrades,
          fallbackTotal: total,
        });

        try {
          await api.post("/submission-files/return-marked", fd, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120000
          });
        } catch (err) {
          console.error("Return failed for:", student.name, err);
          toast.error(`Return failed for ${student.name || submissionId}. Stopping process.`);
          throw err;
        }

        const returnedAt = new Date().toISOString();
        setSavedResults((prev) => ({
          ...prev,
          [submissionId]: {
            ...(prev[submissionId] || {}),
            returnedAt,
          },
        }));

        patchBatchJob(assignmentId, (prev) => ({
          ...prev,
          results: {
            ...prev?.results,
            [submissionId]: { ...batch, returned: true },
          },
        }));
      }

      toast.success(
        `Returned ${bulkQueue.length + batchQueue.length} graded paper${
          bulkQueue.length + batchQueue.length === 1 ? "" : "s"
        }`
      );
    } finally {
      setReturning(false);
    }
  };

  const getStatusBadge = (s) => <SubmissionStatusBadge student={s} />;
  
  const formatError = (err) => {
    if (!err) return "Unknown error";

    if (typeof err === "string") {
      return err;
    }

    return (
      err?.error?.message ||
      err?.data?.error?.message ||
      err?.message ||
      err?.errorMessage ||
      err?.data?.message ||
      JSON.stringify(err, null, 2)
    );
  };
  
  const openMarkScheme = (msInfo) => {
    if (!msInfo?.webLink) return;

    window.open(msInfo.webLink, "_blank", "noopener,noreferrer");
  };

  const handleReturnAll = async () => {
    if (!studentsMarkingUrl) {
      toast.error("Assignment not loaded");
      return;
    }

    try {
      const allStudents = await fetchAllPaginated(
        api,
        studentsMarkingUrl,
        {},
        "students"
      );

      const { bulkQueue, batchQueue } = buildReturnAllQueue({
        bulkProgress,
        batchJob,
        savedResults,
        singleProgress,
        allStudents,
      });

      const returnCount = bulkQueue.length + batchQueue.length;
      if (returnCount === 0) {
        const gradedCount = Object.values(savedResults).filter((s) => s?.result).length;
        if (gradedCount > 0) {
          toast.warn(
            "All graded papers were already returned. Re-mark a student to return updated papers."
          );
        } else {
          toast.warn("No graded papers to return");
        }
        return;
      }

      const confirmed = await confirmReturnAll(returnCount);
      if (!confirmed) return;

      setReturning(true);

      const saveRequests = [
        ...bulkQueue
          .map(({ submissionId, bulk }) => {
            const summary = resolvePdfSummary(submissionId, bulk?.result);
            if (!summary) return null;
            return api.post("/submission-files/save-summary", {
              assignmentId,
              submissionId,
              summary,
            });
          })
          .filter(Boolean),
        ...batchQueue
          .map(({ submissionId, batch }) => {
            const summary = resolvePdfSummary(submissionId, batch?.result);
            if (!summary) return null;
            return api.post("/submission-files/save-summary", {
              assignmentId,
              submissionId,
              summary,
            });
          })
          .filter(Boolean),
      ];

      await Promise.all(saveRequests);

      await returnAllToStudents();
    } catch (err) {
      console.error("Return all failed:", err);
      toast.error((await getApiErrorMessage(err)) || "Return all failed");
    } finally {
      setReturning(false);
    }
  };
  
const isCriteria = resultModal?.result?.markingMode === "criteria";

  const total = sumQuestionMarks(questionsForDisplay);
const max   = effectiveMaxTotal;
  const pct   = gradeScorePercent(total, max);
const color = getScoreColor(total, max);

return (
    <div className="ma-root">
      <main className="ma-main">

        <header className="ma-topbar">
  <div className="ma-topbar-left">
    <h1 className="ma-topbar-title">{assignmentTitle}</h1>
    <span className="ma-topbar-sub">
      {dueDateTime
        ? `Due: ${new Date(dueDateTime).toLocaleString()}`
        : "No due date"}
    </span>
  </div>

  <div className="header-actions">
                <button
                  type="button"
                  onClick={handleExportGradesExcel}
                  disabled={exportingGrades}
                  className="ma-send-btn"
                >
                  <FiDownload /> {exportingGrades ? "Exporting…" : "Export Grades"}
    </button>

                <button onClick={() => navigate("/assistant/assignments")} className="msv-cancel-btn">
      Back
    </button>
  </div>
</header>

<div className="ma-content">
{/* MARK SCHEME BAR */}
<div className="msv-ms-bar">
  <div className="msv-ms-info">
    <div className="msv-ms-title">📋 Mark Scheme</div>
    <div className={`msv-ms-status ${msInfo ? "msv-ms-status--ok" : ""}`}>
      {msInfo
        ? "✅ Uploaded — ready for AI marking"
        : "No mark scheme uploaded"}
    </div>
  </div>

  <input
    type="file"
    accept=".pdf"
    style={{ display: "none" }}
    id="ms-upload"
    onChange={(e) => handleMsUpload(e.target.files[0])}
  />

              {/* Upload Mark Scheme */}
  <button
    className="ma-send-btn"
    onClick={() => document.getElementById("ms-upload").click()}
  >
    {uploadingMs ? "Uploading…" : msInfo ? "Replace MS" : "Upload MS"}
  </button>

               {/* View Mark Scheme */}
  {msInfo && (
    <button
      className="msv-btn-ai"
                  onClick={() => openMarkScheme(msInfo)}
                  style={{
                    marginLeft: 10,
                    background: "var(--primary)",
                    border: "1px solid var(--primary)"
                  }}
                >
                  View Mark Scheme
    </button>
  )}

  {msInfo && assignmentId && (
    <button
      type="button"
      className="msv-btn-ai msv-btn-prompt-gen"
      onClick={() => {
        setPromptDraft(assignmentPrompt.content || "");
        setPromptGenOpen(true);
      }}
      style={{ marginLeft: 10 }}
      title="Generate or edit assignment-specific marking prompt"
    >
      <FiEdit3 size={13} />
      Prompt Generation
      {assignmentPrompt.hasPrompt ? " ✓" : ""}
    </button>
  )}

  {msInfo && assignmentId && (
    <button
      type="button"
      className="msv-btn-ai msv-btn-verify"
      onClick={() => {
        setMsVerifyResult(null);
        setMsVerifyOpen(true);
      }}
      style={{ marginLeft: 10 }}
      title="Verify mark scheme against Classroom totals and sample submissions"
    >
      <FiShield size={13} />
      Mark Scheme Verification
    </button>
  )}

              {/* Mark All */}
              {msInfo  && (
                <button
                  className="msv-btn-ai"
                  onClick={() => openGuidanceModal(null, false)}
                  disabled={bulkMarking || bulkLocked}
                  title={bulkLocked ? "This action can only be run once per assignment" : ""}
                  style={{
                    opacity: bulkLocked ? 0.4 : 1,
                    cursor: bulkLocked ? "not-allowed" : "pointer"
                  }}
                >
                {bulkMarking ? <><span className="pm-spinner" /> Marking…</> : <><FiCpu size={13} /> {markingActionLabel("Mark All Students", "Mark Selected", markingSelection.selectedCount)}</>}
                </button>
              )}
              {msInfo && bulkMarking && (
                <button
                  className="msv-btn-ai"
                  onClick={stopBulkMark}
                  style={{
                    marginLeft: 10,
                    background: "var(--danger)",
                    borderColor: "var(--danger)",
                    color: "#fff",
                  }}
                >
                  <FiX size={13} /> Stop
                </button>
              )}

              {/* Return All */}
              {msInfo && !bulkMarking && (
                <button
                  className="msv-btn-ai"
                  onClick={handleReturnAll}
                  disabled={returning}
                  style={{ marginLeft: 10, background: "var(--success)", borderColor: "var(--success)", color: "#fff" }}
                >
                  {returning ? "Returning…" : "Return All"}
                </button>
                )}

              {/* BATCH MARKING */}
              {msInfo && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 10 }}>
                  <select
                    className="msv-gemini-select"
                    value={pickValidGeminiModel(geminiModels, geminiModel)}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    disabled={bulkMarking || batchStarting}
                    title="Sahahly model for batch marking"
                    style={{ minWidth: 210, maxWidth: 280 }}
                  >
                    {(geminiModels.length
                      ? geminiModels
                      : [{ id: geminiModel, label: geminiModel }]
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {sahahlyModelLabel(m)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="msv-btn-ai"
                    onClick={() => {
                      if (batchJob?.phase === "processing") {
                        pollBatchJob(batchJob.jobId, {
                          assignmentId,
                          mode: batchJob.mode,
                          geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
                          batchStudents: batchJob.batchStudents,
                        });
                      } else {
                        openGuidanceModal(null, true);
                      }
                    }}
                    disabled={bulkMarking || batchStarting}
                    style={{ background: "var(--primary)", borderColor: "var(--primary)", color: "var(--primary-contrast)" }}
                  >
                    {batchJob?.phase === "uploading"  && <><span className="pm-spinner" /> Uploading…</>}
                    {batchJob?.phase === "submitting" && <><span className="pm-spinner" /> Submitting…</>}
                    {batchJob?.phase === "processing" && <><span className="pm-spinner" /> Batch running… (tap to check)</>}
                    {batchJob?.phase === "error"      && <>⚡ Batch failed — retry?</>}
                    {(!batchJob || batchJob.phase === "done") && <><FiLayers size={13} /> {markingActionLabel("Mark All (Batch)", "Mark Selected (Batch)", markingSelection.selectedCount)}</>}
                  </button>
</div>
              )}
              {batchJob && batchJob.phase !== "done" && (
                <div style={{
                  marginTop: 8, padding: "10px 14px", borderRadius: 10,
                  background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                  fontSize: 12, color: "var(--text-secondary)",
                  display: "flex", alignItems: "center", gap: 10
                }}>
                  <span className="pm-spinner" style={{ width: 12, height: 12 }} />
                  <span>
                    {batchJob.phase === "uploading"  && `Uploading ${batchJob.total} student PDFs to Gemini…`}
                    {batchJob.phase === "submitting" && "Submitting batch job…"}
                    {batchJob.phase === "processing" && `Batch job processing (job: ${batchJob.jobId}) — checking every 15s…`}
                  </span>
                  {batchJob?.phase === "processing" && (
                    <button
                      onClick={() => {
                        toast.info("Checking status…"); 
                        pollBatchJob(batchJob.jobId, {
                          assignmentId,
                          mode: batchJob.mode,
                          geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
                          batchStudents: batchJob.batchStudents,
                        });
                      }}
                      style={{
                        marginLeft: "auto", fontSize: 11, color: "var(--primary)",
                        background: "none", border: "none", cursor: "pointer"
                      }}
                    >
                      Check now
                    </button>
                  )}
                  {(batchJob?.phase === "uploading" ||
                    batchJob?.phase === "submitting" ||
                    batchJob?.phase === "processing") && (
                    <button
                      onClick={stopBatchMark}
                      style={{
                        marginLeft: batchJob?.phase === "processing" ? 8 : "auto",
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
               
            </div>

              {/* Expected Pages */}
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>📄 Expected Pages:</span>
                {!showExpectedPagesEdit ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 600, color: expectedPages != null ? "var(--success)" : "var(--danger)" }}>
                      {expectedPages != null ? `${expectedPages} pages` : "Not set — required before marking"}
                    </span>
                    <button
                      className="ma-send-btn"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      onClick={() => { setShowExpectedPagesEdit(true); setExpectedPagesInput(expectedPages != null ? String(expectedPages) : ""); }}
                    >
                      {expectedPages != null ? "Edit" : "Set"}
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 8"
                      value={expectedPagesInput}
                      onChange={(e) => setExpectedPagesInput(e.target.value)}
                      style={{ width: 80, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)" }}
                    />
                    <button
                      className="ma-send-btn"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      onClick={handleSetExpectedPages}
                      disabled={settingExpectedPages}
                    >
                      {settingExpectedPages ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="msv-cancel-btn"
                      style={{ fontSize: 11, padding: "4px 10px" }}
                      onClick={() => setShowExpectedPagesEdit(false)}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>

              {/* SEARCH + REFRESH */}
              <div className="msv-panel-controls" style={{ marginBottom: 10 }}>
                <input
                  className="msv-student-search"
                  type="text"
                  placeholder="Search by name…"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                />
                <button
                  className="msv-refresh-btn"
                  onClick={refreshStudents}
                  disabled={refreshing || loading}
                  title="Sync max points, grades, and resubmissions from Google Classroom"
                >
                  <FiRefreshCw size={13} className={refreshing ? "msv-spin" : ""} />
                  <span className="msv-refresh-btn-label">{refreshing ? "Refreshing…" : "Refresh"}</span>
                </button>
</div>

              <MarkingSelectionBar
                selectedCount={markingSelection.selectedCount}
                pageSelectableCount={pageSelectableIds.length}
                pageAllSelected={pageAllMarkingSelected}
                onTogglePage={toggleMarkingSelectPage}
                onSelectAll={selectAllStudentsForMarking}
                onClear={markingSelection.clear}
                selectingAll={selectingMarkingAll}
              />

{/* TABLE */}
{loading ? <p className="ma-loading-msg">Loading...</p> : (
                  <>
                  {students.length === 0 && (
                    <p className="ma-empty-msg">
                      {studentSearch ? `No students match "${studentSearch}".` : "No students found."}
                    </p>
                  )}
                  {students.length > 0 && (
  <div className="ma-table-wrap">
    <div className="ma-table-scroll">

      <table className="ma-table ma-table--cards">
        <thead>
          <tr>
            <th style={{ width: 44 }} aria-label="Select for marking" />
            <th>Name</th>
            <th>Status</th>
            <th>Submitted At</th>
            <th>Grade</th>
                            <th>%</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {students.map((s, i) => {
            const bulk     = bulkProgress[s.submissionId];
            const bulkDone = bulk?.status === "done";
                            const bulkPending = bulk?.status === "pending";
                            const bulkMarking = bulk?.status === "marking";
                            const bulkError   = bulk?.status === "error";
                            const bulkRetrying = bulk?.status === "retrying";  // ← add this
                            
                            const single = singleProgress[s.submissionId];
                            // const singleMarking = single?.status === "marking";
                            // const singleError = single?.status === "error";

                            const db = savedResults[s.submissionId];

                            const batch     = batchJob?.results?.[s.submissionId];
                            const batchDone = batch?.status === "done";
                            const batchError = batch?.status === "error";
                            const batchQueued  = batchJob?.phase === "processing" &&
                                                  !batchDone && !batchError &&
                                                  batchJob?.results?.[s.submissionId] === undefined &&
                                                  batchJob?.total > 0;
                            
                            const hasResult = !!(single?.status === "done" || db?.result);
                            const isMarking = single?.status === "marking" || markingStudentId === s.submissionId;
                            const hasError = single?.status === "error" || studentErrors[s.submissionId];

                            const markingLoading = isMarking || bulkMarking || bulkRetrying || markingStudentId === s.submissionId || batchQueued;
                            const markingDone = bulkDone || hasResult || batchDone;
                            const markingError = bulkError || hasError || batchError || studentErrors[s.submissionId];
                            const inlineMarkResult =
                              (batchDone && batch?.result) ||
                              (bulkDone && bulk?.result) ||
                              (db?.result?.tokenUsage ? db.result : null);
          
          
          return (
            <tr
              key={s.submissionId}
              className="ma-row"
              style={{ animationDelay: `${i * 0.025}s` }}
            >
              <td>
                {s.submissionId ? (
                  <button
                    type="button"
                    className={`msv-mark-check ${markingSelection.isSelected(s.submissionId) ? "msv-mark-check--on" : ""}`}
                    onClick={() => markingSelection.toggle(s.submissionId)}
                    aria-label={`Select ${s.name || "student"} for marking`}
                  >
                    {markingSelection.isSelected(s.submissionId) ? "✓" : ""}
                  </button>
                ) : null}
              </td>

              {/* NAME */}
              <td>
                <div className="ma-avatar-cell">
                  <div className="ma-avatar">
                    {(s.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <span className="ma-cell-name">{s.name || "—"}</span>
                                  {(() => {
                                    const savedWarn = savedResults[s.submissionId]?.result?.fileWarning;
                                    const flagText = pageCountWarningText(pageCountFlags[s.submissionId]);
                                    if (!savedWarn && !flagText) return null;
                                    const title = flagText
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

              {/* STATUS */}
              <td data-label="Status">{getStatusBadge(s)}</td>

              {/* SUBMITTED AT */}
              <td data-label="Submitted">
                <span className="ma-cell-muted">
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleString()
                    : "—"}
                </span>
              </td>

              {/* GRADE */}
              <td data-label="Grade">
                                <SubmissionGradeInput
                                  student={s}
                                  submissionId={s.submissionId}
                                  assignmentMaxPoints={assignmentMaxPoints}
                                  gradeOverrides={gradeOverrides}
                                  savedResults={savedResults}
                                  classroomSyncedGrades={classroomSyncedGrades}
                                  onGradeChange={setGradeOverride}
                                />
                              </td>

                              {/* PERCENT */}
                              <td data-label="%">
                                {resolveTableGrade(
                                  s.submissionId,
                                  s,
                                  gradeOverrides,
                                  savedResults,
                                  classroomSyncedGrades
                                ) != null &&
                                assignmentMaxPoints ? (
                                      <div className="ma-percent-wrap">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          className="ma-percent-input"
                                          value={
                                            percentOverrides[s.submissionId] ??
                                            computeGradePercent(
                                              resolveTableGrade(
                                                s.submissionId,
                                                s,
                                                gradeOverrides,
                                                savedResults,
                                                classroomSyncedGrades
                                              ),
                                              assignmentMaxPoints
                                            )
                                          }
                                      onChange={(e) =>
                                        setPercentOverride(
                                          s.submissionId,
                                          parsePercentInput(e.target.value)
                                        )
                                      }
                                    />
                                    <span className="ma-percent-suffix">%</span>
                                  </div>
                ) : (
                  <span className="ma-cell-empty">—</span>
                )}
              </td>

              {/* ACTIONS */}
              <td>
                {s.submissionId ? (
                  <div className="msv-actions">

                    <button className="msv-action-btn" onClick={() => openPdf(s)}> <FiEye size={13} /> </button>
                    <button className="msv-action-btn" onClick={() => downloadPdf(s)}> <FiDownload size={13} /> </button>

                                    {studentErrors[s.submissionId] && (
                                      <button
                                        className="msv-action-btn msv-action-btn--view"
                                        title="View Error"
                                        onClick={() =>
                                          openErrorViewer(
                                            studentErrors[s.submissionId].title || `Marking Failed - ${s.name}`,
                                            studentErrors[s.submissionId].message
                                          )
                                        }
                                      >
                                        View Error
                                      </button>
                                    )}

                    {msInfo && (
                                      <>
                                        
                                        {/* Results button — show if any source has results */}
                                        {(bulkDone || batchDone || single?.status === "done" || db?.result) && (
                      <button
                                            className="msv-action-btn msv-action-btn--ai msv-action-btn--done"
                                            title="View Results"
                        onClick={() => {
                                              const result =
                                                batchDone ? batch.result :
                                                bulkDone ? bulk.result :
                                                single?.status === "done" ? single.result :
                                                db?.result;
                                              const studentFile =
                                                bulkDone ? bulk.studentFile :
                                                single?.status === "done" ? single.studentFile :
                                                null;
                                              const originalAiResult =
                                                (batchDone ? batch?.originalAiResult : null) ??
                                                (bulkDone ? bulk?.originalAiResult : null) ??
                                                (single?.status === "done" ? single?.originalAiResult : null) ??
                                                db?.aiOriginalResult ??
                                                result;
                                              setResultModal({
                                                student: s,
                                                result,
                                                originalAiResult: JSON.parse(JSON.stringify(originalAiResult)),
                                                studentFile,
                                              });
                                              setEditingQuestions(
                                                enrichMarkingQuestions(result.questions || []).map((q) => ({ ...q }))
                                              );
                                              setEditingAnnotations(getTeacherAnnotations(result).map((a) => ({ ...a })));
                            setEditingMaxTotal(null);
                                              setSummaryTouched(false);
                                              setEditingSummary(
                                                rebuildMarkingSummary({
                                                  questions: result.questions || [],
                                                  maxTotalMarks: resolveDisplayMaxTotal({
                                                    assignmentMaxPoints,
                                                    result,
                                                    editingMaxTotal: null,
                                                  }),
                                                  previousSummary: result.summary || "",
                                                })
                                              );
                                              setAnnotationsPanelOpen(false);
                                            }}
                                          >
                                            ✅ Results
                                          </button>
                                        )}

                                        {/* Mark button — always shown */}
                                        <button
                                          className={`msv-action-btn msv-action-btn--ai ${markingError ? "msv-action-btn--error" : ""}`}
                                          title="Mark with AI"
                                          onClick={() => openGuidanceModal(s)}
                                          disabled={markingLoading}
                                        >
                                          {markingLoading 
                                            ? bulkRetrying
                                            ? <span style={{ fontSize: 10, color: "var(--warning)" }}>
                                                ⟳ Retry {bulk.attempt}/{bulk.maxAttempts}
                                              </span>
                                            : batchQueued
                                            ? <span style={{ fontSize: 10, color: "var(--primary)" }}>⚡ Batch…</span>
                                            : <span className="pm-spinner" />
                                            : markingError
                                            ? <>❌ Retry</>
                          : <><FiCpu size={12} /> Mark</>
                        }
                                        </button>

                                          {/* {bulkRetrying && (
                                            <button onClick={stopBulkMark}>Stop</button>
                                          )} */}

                                        {db?.result && (
                                          <button
                                            className="msv-action-btn msv-action-btn--delete"
                                            title="Delete Correction"
                                            onClick={() => deleteCorrection(s)}
                                            disabled={deletingCorrection[s.submissionId] || markingLoading}
                                          >
                                            {deletingCorrection[s.submissionId] ? <span className="pm-spinner" /> : "🗑 Delete"}
                      </button>
                                        )}


                                        {inlineMarkResult?.pdfCompression && (
                                          <div style={{
                                            marginTop: 4,
                                            fontSize: 11,
                                            color: "var(--muted)",
                                          }}>
                                            {inlineMarkResult.pdfCompression.applied
                                              ? `PDF compressed — saved ${inlineMarkResult.pdfCompression.savingsPercent}%`
                                              : (inlineMarkResult.pdfCompression.student?.reason ||
                                                  inlineMarkResult.pdfCompression.method ||
                                                  "PDF compression not applied")}
                                          </div>
                                        )}
                                          
                                        {bulkRetrying && bulkMarking && (
                                          <div style={{
                                            marginTop: 6,
                                            fontSize: 11,
                                            color: "var(--warning)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6
                                          }}>
                                            <span className="pm-spinner" />
                                            Server busy — retrying in {bulk.delaySeconds}s
                                            <span style={{ color: "var(--muted)" }}>
                                              ({bulk.attempt}/{bulk.maxAttempts})
                                            </span>
                                          </div>
                                        )}
                                      </>
                    )}

                  </div>
                ) : "—"}
              </td>

            </tr>
                            
          );
          })}
        </tbody>
      </table>
<Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
    </div>
  </div>
)}
                  </>
                )}

</div>

      </main>

              {errorViewer.open && (
                <div className="msv-overlay" onClick={() =>
                  setErrorViewer({ open: false, title: "", message: null })
                }>
                  <div
                    className="msv-results-modal"
                    onClick={e => e.stopPropagation()}
                    style={{ maxWidth: 500 }}
                  >
                    <div className="msv-modal-header">
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        ❌ {errorViewer.title}
                      </div>

                      <button
                        className="msv-icon-btn"
                        onClick={() =>
                          setErrorViewer({ open: false, title: "", message: null })
                        }
                      >
                        <FiX />
                      </button>
                    </div>

                    <div style={{ padding: "16px 20px" }}>
                      <div style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginBottom: 8
                      }}>
                        Error Details
                      </div>

                      <div style={{
                        background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)",
                        padding: 12,
                        borderRadius: 10,
                        fontSize: 13,
                        color: "var(--danger)",
                        whiteSpace: "pre-wrap",
                        maxHeight: 300,
                        overflowY: "auto"
                      }}>
                        {formatError(errorViewer.message)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

      {/* ── PAGE-COUNT PRE-CHECK MODAL (advisory) ── */}
      <PageCountCheckModal
        state={pageCheckModal}
        onResolve={resolvePageCheck}
        onOpenPdf={(c) => openPdf({ submissionId: c.submissionId, name: c.student?.name })}
      />

      {/* ── GUIDANCE MODAL ── */}
      {guidanceModal && (
        <div className="msv-overlay" onClick={() => setGuidanceModal(null)}>
          <div className="msv-guidance-modal" onClick={e => e.stopPropagation()}>
            <div className="msv-guidance-header">
                        
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                            {guidanceModal.batch ? "⚡ Mark All Students (Batch)"  :
                            guidanceModal.bulk  ? "🤖 Mark All Students"           :
                                                  `🤖 Mark — ${guidanceModal.student?.name}`}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                            {guidanceModal.batch
                              ? `Submits all eligible students in this assignment via Gemini batch API — ${studentTotal} students in class`
                              : guidanceModal.bulk
                    ? `Marking ${students.filter(s => s.submissionId).length} students with AI`
                    : "AI will mark against the uploaded mark scheme"}
                </div>
                        
              <button className="msv-icon-btn" onClick={() => setGuidanceModal(null)}><FiX size={16} /></button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Mode selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}>Marking Mode</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {[
                    { value: "normal",   label: "📋 Normal Marking",  desc: "Marks against the mark scheme" },
                    { value: "criteria", label: "🎯 Criteria Marking", desc: "Two-layer: corrections + criteria grade" }
                  ].map(m => (
                    <div
                      key={m.value}
                      onClick={() => setMarkingModeModal(m.value)}
                      style={{
                        flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                        border: `2px solid ${markingModeModal === m.value ? "var(--primary)" : "var(--border)"}`,
                        background: markingModeModal === m.value ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface-2)",
                        transition: "all 0.18s ease"
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

                        {/* Sahahly model (bulk, batch, and single mark) */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                            Sahahly Model
                          </label>
                          <select
                            className="msv-gemini-select"
                            value={pickValidGeminiModel(geminiModels, geminiModel)}
                            onChange={e => setGeminiModel(e.target.value)}
                          >
                            {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map(m => (
                              <option key={m.id} value={m.id}>{sahahlyModelLabel(m)}</option>
                            ))}
                          </select>
                          <p style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                            {guidanceModal.batch
                              ? "Used for the Sahahly batch job (marks all students in one run)."
                              : "Used when you start marking with Sahahly."}
                          </p>
              </div>

              {/* Saved prompt dropdown */}
              {savedPrompts.length > 0 && (
                <div style={{ marginBottom: 14, position: "relative" }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>Load saved prompt</label>
                  <div
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: `1px solid ${promptDropdownOpen ? "color-mix(in srgb, var(--primary) 50%, transparent)" : "var(--border)"}`,
                      background: "var(--surface-2)", color: guidance ? "var(--text-primary)" : "var(--muted)",
                      fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center",
                      justifyContent: "space-between", userSelect: "none",
                      transition: "all 0.18s ease"
                    }}
                              onClick={e => {
                                e.stopPropagation(); 
                                setPromptDropdownOpen(v => !v); }}
                  >
                    <span>{guidance ? (savedPrompts.find(p => p.content === guidance)?.name || "📋 Custom guidance entered") : "📋 Select a saved prompt…"}</span>
                    <span style={{ fontSize: 10, color: "var(--muted)", transform: promptDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>▼</span>
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
                                maxHeight: 220,          // 👈 important
                                overflowY: "auto",       // 👈 enables scroll
                                overflowX: "hidden",
                                boxShadow: "var(--shadow)"
                              }}>
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
                                    borderBottom: i < savedPrompts.length - 1 ? "1px solid var(--border)" : "none",
                                  }}
                                >
                                  {/* LEFT: prompt content (click to select) */}
                                  <div
                                    style={{ flex: 1 }}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setGuidance(p.content);
                                      setPromptDropdownOpen(false);
                                    }}
                                  >
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                                      {p.name}
                        </div>
                                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                      {p.content.slice(0, 80)}...
                                    </div>
                                  </div>

                                  {/* RIGHT: delete button */}
                                  <button
                                    onMouseDown={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();

                                      try {
                                        await api.delete(`/marking/prompts/${p._id}`);

                                        setSavedPrompts(prev => prev.filter(x => x._id !== p._id));
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
                                      padding: "4px 6px"
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

              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
                {markingModeModal === "criteria"
                  ? <><span style={{ color: "var(--text-primary)" }}>Criteria</span> <span style={{ color: "var(--danger)" }}>*</span> — define the grading criteria and weights</>
                  : <>Additional Guidance <span style={{ color: "var(--muted)" }}>(optional)</span></>
                }
              </label>
              <textarea
                value={guidance}
                onChange={e => setGuidance(e.target.value)}
                rows={6}
                placeholder={markingModeModal === "criteria"
                  ? "Define criteria e.g:\nOn-Time Submission: 2 marks — full marks if submitted on time\nCompleteness: 2 marks — all questions attempted\nShowing Steps: 2 marks — working shown\nSelf-Correction: 2 marks — evidence of review\nBase Score: 2 marks — guaranteed minimum"
                  : "e.g. Be strict with units. Award method marks if working is shown..."
                }
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
              />
                <button
                  className="ma-send-btn"
                            onClick={async () => {
                              if (!guidance.trim()) return toast.warn("Cannot save empty prompt");

                              const name = prompt("Name this prompt:");
                              if (!name) return;

                              try {
                                const res = await api.post("/marking/prompts", {
                                  name,
                                  content: guidance
                                });

                                setSavedPrompts(prev => [...prev, res.data]);
                                toast.success("Prompt saved");
                              } catch {
                                toast.error("Failed to save prompt");
                              }
                            }}
                          >
                            Save Prompt
                          </button>

                          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>

                            {/* Gemini + Claude buttons — shown for normal/bulk/single, hidden for batch */}
                            {!guidanceModal.batch && (
                              <>
                                <button className="ma-send-btn"
                                  onClick={() => handleGuidanceConfirm("gemini")}
                                  disabled={markingModeModal === "criteria" && !guidance.trim()}
                                  style={{ flex: 1, justifyContent: "center", opacity: markingModeModal === "criteria" && !guidance.trim() ? 0.4 : 1 }}>
                  <FiCpu size={14} />
                                  {guidanceModal.bulk ? "Start Marking All with Gemini" : "Start Marking with Gemini"}
                </button>
                                <button className="ma-send-btn" onClick={() => handleGuidanceConfirm("claude")}>
                                  <FiCpu size={14} />
                                  {guidanceModal.bulk ? "Start Marking All with Claude" : "Start Marking with Claude"}
                                </button>
                              </>
                            )}

                            {/* Batch button */}
                            {guidanceModal.batch && (
                              <button className="ma-send-btn"
                                onClick={() => handleGuidanceConfirm()}
                                disabled={markingModeModal === "criteria" && !guidance.trim()}
                                style={{ flex: 1, justifyContent: "center",
                                  opacity: markingModeModal === "criteria" && !guidance.trim() ? 0.4 : 1 }}>
                                <FiLayers size={14} />
                                {`Submit Batch — ${geminiModelLabel(geminiModels, pickValidGeminiModel(geminiModels, geminiModel))}`}
                              </button>
                            )}

                <button className="msv-cancel-btn" onClick={() => setGuidanceModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AssignmentPromptGeneration
        open={promptGenOpen}
        onClose={() => setPromptGenOpen(false)}
        assignmentTitle={assignmentTitle}
        content={assignmentPrompt.content}
        draft={promptDraft}
        onDraftChange={setPromptDraft}
        maxPoints={assignmentPrompt.maxPoints ?? maxGrade}
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

      <MarkSchemeVerificationModal
        open={msVerifyOpen}
        onClose={() => setMsVerifyOpen(false)}
        assignmentId={assignmentId}
        assignmentTitle={assignmentTitle}
        verifying={msVerifying}
        result={msVerifyResult}
        onRun={handleRunMsVerification}
      />

      {/* ── RESULTS MODAL ── */}
            {resultModal && (
              <div className="msv-overlay" onClick={() => setResultModal(null)}>
                <div className="msv-results-modal" onClick={e => e.stopPropagation()}>
                  <div className="msv-modal-header">
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        AI Marking Results — {resultModal.student.name}
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                          background: isCriteria ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "color-mix(in srgb, var(--primary) 15%, transparent)",
                          color: isCriteria ? "var(--accent)" : "var(--primary)",
                          border: `1px solid ${isCriteria ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "color-mix(in srgb, var(--primary) 30%, transparent)"}`
                        }}>
                          {isCriteria ? "🎯 Criteria Marking" : "📋 Normal Marking"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Final Grade:</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                              readOnly
                          type="number"
                          min={0}
                          max={effectiveMaxTotal}
                          value={total}
                          // value={editingTotal !== null ? editingTotal : effectiveTotal}
                          // onChange={e => setEditingTotal(Math.min(effectiveMaxTotal, Math.max(0, Number(e.target.value))))}
                          style={{
                            width: 56, padding: "3px 8px", borderRadius: 6,
                                border: `1px solid ${color}`,
                                background: `color-mix(in srgb, ${color} 15%, transparent)`,
                                color: color,
                            fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none",
                                // readonly: true,
                            cursor: "not-allowed"  // optional: makes it visually clear
                          }}
                        />
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>/</span>
                        <input
                          type="number"
                          min={1}
                          value={editingMaxTotal !== null ? editingMaxTotal : effectiveMaxTotal}
                          onChange={e => {
                            const newMax = Math.max(1, Number(e.target.value));
                            setEditingMaxTotal(newMax);
                          }}
                          style={{
                            width: 56, padding: "3px 8px", borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            color: "var(--text-primary)",
                            fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none"
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                              ({pct}%)
                        </span>
                            {hasPendingEdits && (
                              <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>
                                Unsaved edits
                              </span>
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
                                  } else {
                                    setEditingTotal(null);
                                    setEditingMaxTotal(null);
                                  }
                                }}
                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--muted)", cursor: "pointer" }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                          <div style={{ flex: "1 1 180px", minWidth: 140, maxWidth: 280 }}>
                            <div style={{ height: 6, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", borderRadius: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s ease" }} />
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
                              borderColor: "color-mix(in srgb, var(--primary) 45%, transparent)",
                              color: "var(--primary)",
                            }}
                            title="Add extra notes on the marked PDF preview"
                          >
                            📝 Annotate
                            {editingAnnotations.length > 0 ? ` (${editingAnnotations.length})` : ""}
                          </button>
                          {hasPendingEdits && (
                            <button
                              className="msv-btn-ai"
                              onClick={handleConfirmEdits}
                              disabled={confirmingEdits || previewLoading}
                              style={{ background: "var(--success)", borderColor: "var(--success)", color: "#fff" }}
                            >
                              <FiCheck size={13} />
                              {confirmingEdits ? "Confirming…" : "Confirm Edits"}
                            </button>
                          )}
                          <button className="ma-send-btn" onClick={downloadGradedPdf} disabled={downloading || hasPendingEdits} style={{ fontSize: 12 }} title={hasPendingEdits ? "Confirm edits first" : undefined}>
                        <FiDownload size={13} />{downloading ? "Generating…" : "Download PDF"}
                      </button>
                          <button className="msv-btn-ai" onClick={returnToStudent} disabled={returning || hasPendingEdits} title={hasPendingEdits ? "Confirm edits first" : undefined}>
                        <FiSend size={13} />{returning ? "Returning…" : "Return to Student"}
                      </button>
                      <button className="msv-icon-btn" onClick={() => setResultModal(null)}><FiX size={16} /></button>
                    </div>
                  </div>
      
                      <div
                        className="msv-modal-body msv-results-body"
                        style={{
                          display: "flex",
                          gap: 20,
                          height: "80vh",   // important
                          overflow: "hidden"
                        }}
                      >
                    {/* LEFT CARD (UNCHANGED - your current results UI) */}
                    <div 
                      style={{
                        flex: "0 0 60%",
                        overflowY: "auto",
                        height: "100%",
                        paddingRight: 8
                      }}
                    >

                        {resultModal.result.fileWarning && (
                        <div style={{
                            marginBottom: 12,
                            padding: "10px 14px",
                            background: "color-mix(in srgb, var(--warning) 10%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
                            borderRadius: 10,
                            fontSize: 13,
                            color: "var(--warning)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}>
                            ⚠️ <span>{typeof resultModal.result.fileWarning === "string" ? resultModal.result.fileWarning : resultModal.result.fileWarning.message || "Submitted file may be wrong — page count differs from expected"}</span>
                        </div>
                        )}
                        <PdfCompressionStats pdfCompression={resultModal.result.pdfCompression} />
          

                        {assignmentId && (
                          <MarkingCorrectionChat
                            assignmentId={assignmentId}
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
      
                    {/* ── CRITERIA MODE: show criteria grade first ── */}
                    {isCriteria && resultModal.result.criteriaGrade && (
                      <div style={{ marginBottom: 20 }}>
                        {/* Final grade card */}
                        <div style={{ padding: "16px 20px", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 12, marginBottom: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>🎯 Criteria Grade (Final)</div>
                          {(() => {
                            const cg    = resultModal.result.criteriaGrade;
                            const total = cg.totalMarks || 0;
                            const max   = cg.maxTotalMarks || 10;
                            const pct   = max > 0 ? Math.round((total / max) * 100) : 0;
                            const color = getScoreColor(total, max);
                            return (
                              <>
                                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
                                  <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{total}</div>
                                  <div style={{ fontSize: 16, color: "var(--muted)" }}>/ {max}</div>
                                  <div style={{ flex: 1, minWidth: 100 }}>
                                    <div style={{ height: 8, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", borderRadius: 4 }}>
                                      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
                                    </div>
                                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{pct}%</div>
                                  </div>
                                </div>
                                {/* Criteria breakdown table */}
                                {cg.breakdown?.length > 0 && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {cg.breakdown.map((row, i) => (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, flexWrap: "wrap" }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, minWidth: 160 }}>{row.criterion}</div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: getScoreColor(row.marksAwarded, row.maxMarks), minWidth: 60 }}>
                                          {row.marksAwarded} / {row.maxMarks}
                                        </div>
                                        <div style={{ fontSize: 12, color: "var(--muted)", flex: 1 }}>{row.reason}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {cg.summary && (
                                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12, lineHeight: 1.6 }}>{cg.summary}</p>
                                    
                                    
                                    
                                )}
                              </>
                            );
                          })()}
                        </div>
      
                        {/* Divider */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>📝 Question Corrections (Feedback Only)</span>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        </div>
                      </div>
                    )}
      
                        {/* ── NORMAL MODE: summary only (grade + bar live in header) ── */}
                    {!isCriteria && (
                      <>
                          <div className="msv-summary-box">
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Overall Summary</div>
                              <textarea
                                value={editingSummary}
                                onChange={(e) => {
                                  setSummaryTouched(true);
                                  setEditingSummary(e.target.value);
                                }}
                                rows={4}
                                placeholder="Short bullet points (one per line, start with •). Updates when you edit marks."
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                              />
                          </div>
                      </>
                    )}
      
                    {/* ── QUESTIONS (both modes) ── */}
                        <MarkingCompletenessNotice
                          result={resultModal?.result}
                          questionCount={questionsForDisplay.length}
                        />
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
                            const color = getScoreColor(awarded, qMax);
                            const qPct = qMax > 0 ? Math.round((awarded / qMax) * 100) : 0;
                        return (
                          <div key={idx} className="msv-q-card">
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                              <QuestionNumberBadge question={q} />
                              {/* In criteria mode, scores are read-only feedback */}
                              {isCriteria ? (
                                <span style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 15%, transparent)`, color, fontWeight: 700, fontSize: 13 }}>
                                      {awarded} / {qMax}
                                </span>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input
                                        type="number" min={0} max={qMax}
                                        value={awarded}
                                        onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, marksAwarded: Math.min(qMax, Math.max(0, Number(e.target.value) || 0)) } : x))}
                                    style={{ width: 52, padding: "4px 8px", borderRadius: 6, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 15%, transparent)`, color, fontWeight: 700, fontSize: 14, textAlign: "center", outline: "none" }}
                                  />
                                  <span style={{ color: "var(--muted)", fontSize: 13 }}>/</span>
                                  {(q._manual || q._backfilled) ? (
                                    <input
                                      type="number"
                                      min={1}
                                      max={50}
                                      value={qMax}
                                      onChange={(e) => {
                                        const max = Math.max(1, Number(e.target.value) || 1);
                                        setEditingQuestions((prev) =>
                                          prev.map((x, i) =>
                                            i === idx
                                              ? {
                                                  ...x,
                                                  maxMarks: max,
                                                  marksAwarded: Math.min(max, Number(x.marksAwarded) || 0),
                                                }
                                              : x
                                          )
                                        );
                                      }}
                                      style={{
                                        width: 44,
                                        padding: "4px 6px",
                                        borderRadius: 6,
                                        border: "1px solid var(--border)",
                                        background: "var(--surface-2)",
                                        color: "var(--text-primary)",
                                        fontSize: 13,
                                        textAlign: "center",
                                        outline: "none",
                                      }}
                                    />
                                  ) : (
                                    <span style={{ color: "var(--muted)", fontSize: 13 }}>{qMax}</span>
                                  )}
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 60, height: 5, background: "color-mix(in srgb, var(--text-primary) 8%, transparent)", borderRadius: 3 }}>
                                    <div style={{ width: `${qPct}%`, height: "100%", background: color, borderRadius: 3 }} />
                              </div>
                                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{qPct}%</span>
                            </div>
      
                            {q.checklist && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                                {CHECKLIST_CONFIG.map(({ key, label, passIsGood }) => {
                                  const val    = q.checklist[key];
                                  const isGood = passIsGood ? val === true : val === false;
                                  return (
                                    <span key={key} style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, background: isGood ? "color-mix(in srgb, var(--success) 10%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)", color: isGood ? "var(--success)" : "var(--danger)", border: `1px solid ${isGood ? "color-mix(in srgb, var(--success) 20%, transparent)" : "color-mix(in srgb, var(--danger) 20%, transparent)"}` }}>
                                      {isGood ? "✅" : "❌"} {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
      
                                {q.studentAnswer && !isBlankQuestion(q) && (
                              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                                <span style={{ fontWeight: 600, color: "var(--muted)" }}>Student: </span>{q.studentAnswer}
                              </div>
                            )}
                                {isBlankQuestion(q) && (
                                  <div style={{ fontSize: 12, color: "var(--warning)", marginBottom: 6, lineHeight: 1.5 }}>
                                    📭 {q.studentAnswer || "Question left blank — no working or final answer was provided."}
                                  </div>
                            )}
      
                            {/* Correct answer — shown in criteria mode */}
                                {/* Correct answer — criteria mode or MCQ */}
                                {q.correctAnswer && (isCriteria || Number(q.maxMarks) === 1) && (
                              <div style={{ fontSize: 12, color: "var(--success)", marginBottom: 6, padding: "6px 10px", background: "color-mix(in srgb, var(--success) 7%, transparent)", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--success) 15%, transparent)" }}>
                                <span style={{ fontWeight: 600 }}>✅ Correct Answer: </span>{q.correctAnswer}
                              </div>
                            )}

                                {!isCriteria && (
                                  <QuestionKeywordFields
                                    question={q}
                                    onChange={(updated) =>
                                      setEditingQuestions((prev) =>
                                        prev.map((x, i) => (i === idx ? updated : x))
                                      )
                                    }
                                  />
                            )}
      
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {isCriteria ? "Comment" : "Examiner Note"}
                            </div>
                            {isCriteria ? (
                              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{q.reason}</p>
                            ) : (
                              <textarea
                                value={q.reason}
                                onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, reason: e.target.value } : x))}
                                rows={3}
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: 12, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                    
                    {/* RIGHT CARD (NEW - Annotated File) */}
                    <div style={{
                      flex: "0 0 40%",
                      height: "100%",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 12
                    }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 10,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}>
                        <span>📄 Annotated PDF Preview</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {hasPendingEdits && (
                            <span style={{ fontSize: 10, color: "var(--warning)", fontWeight: 600, textTransform: "none" }}>
                              Confirm edits to update preview
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
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          Generating preview…
                        </div>
                      ) : previewError ? (
                        <div style={{ color: "var(--danger)", fontSize: 13 }}>
                          {previewError}
                        </div>
                      ) : annotatedPreviewUrl ? (
                        <div
                          style={{
                            flex: 1,
                            minHeight: 0,
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          <AnnotatedPdfPreview
                            url={annotatedPreviewUrl}
                            placementQuestions={placementQuestions}
                            reportPageCount={reportPageCount}
                            onPlacementChange={handleAnnotationPlacementChange}
                            onQuestionRemove={handleQuestionRemove}
                          />
                        </div>
                      ) : (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          No preview available
                        </div>
                      )}
                    </div>

                    </div>
                   
                    </div>
                  </div>
                
                )}

          </div>
        );
      }

