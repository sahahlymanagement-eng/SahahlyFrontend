import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { promptToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import {
  FiUsers, FiClipboard, FiDownload, FiEye, FiCpu,
  FiUploadCloud, FiX, FiCalendar, FiSend, FiLayers, FiAlertCircle, FiCheck, FiRefreshCw
} from "react-icons/fi";
import ManagerSidebar from "../../components/ManagerSidebar";
import { usePagination } from "../../hooks/usePagination";
import { useAnnotatedResultPreview } from "../../hooks/useAnnotatedResultPreview";
import Pagination from "../../components/Pagination";
import {
  appendMarkingContext,
  assertPdfBlob,
  buildFinalMarkingResult,
  buildBatchMarkingResult,
  buildPriorityMarkingResult,
  buildNoSubmissionMarkingResult,
  applyTeacherEditsToResult,
  sumQuestionMarks,
  gradeScorePercent,
  resolveTotalMarksFromResult,
  resolveSavedMarkingGrade,
  currentUserId,
  getApiErrorMessage,
  getMarkingResultSummary,
  rebuildMarkingSummary,
  guidanceForForm,
  hasTeacherEdits,
  isStudentSubmitted,
  normalizeGuidance,
  getResultMaxTotal,
  resolveDisplayMaxTotal,
  getOutOfScopeNotes,
  getTeacherAnnotations,
} from "../../utils/markingFormData";
import TeacherAnnotationsEditor from "../../components/TeacherAnnotationsEditor";
import QuestionKeywordFields from "../../components/QuestionKeywordFields";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import TokenUsageStats from "../../components/TokenUsageStats";
import {
  formatCostPair,
  geminiModelLabel,
  parseGeminiModelsResponse,
  pickValidGeminiModel,
  PRIORITY_RATE_FACTOR,
  resolveMarkingCost,
} from "../../utils/markingCost";
import { syncAssignmentFromClassroom, refreshAssignmentGrades, buildPercentOverridesFromStudents } from "../../utils/refreshAssignmentFromClassroom";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
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
import {
  gradeFromPercent,
  resolveTableGrade,
  appendClassroomGradeToFormData,
} from "../../utils/submissionGrades";
import {
  MARKING_MAX_ATTEMPTS,
  MARKING_MAX_RETRIES_MESSAGE,
  runWithMarkingRetries,
} from "../../utils/markingRetries";
import "./ManagerSubmissionViewer.css";

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",         passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

export default function ManagerSubmissionViewer() {
  // const BATCH_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];
  const PRIORITY_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];
  const navigate   = useNavigate();
  const msInputRef = useRef();

  const [user,               setUser]               = useState(null);
  const [selectedClassroom,  setSelectedClassroom]  = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [classroomSearch,    setClassroomSearch]    = useState("");
  const [assignmentSearch,   setAssignmentSearch]   = useState("");
  const [studentSearch,      setStudentSearch]      = useState("");
  const [markingModeModal,   setMarkingModeModal]   = useState("normal");

  const classroomParams = useMemo(() => ({
    personId: user?.id,
    search: classroomSearch,
  }), [user?.id, classroomSearch]);

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination("/students/my-classrooms", classroomParams, 20, "data", !!user?.id);

  const assignmentParams = useMemo(() => ({
    search: assignmentSearch,
  }), [assignmentSearch]);

  const {
    data: assignments,
    page: assignmentPage,
    totalPages: assignmentTotalPages,
    fetchPage: fetchAssignmentPage,
    loading: loadingAssignments,
  } = usePagination(
    selectedClassroom ? `/manager-assignments/classroom/${selectedClassroom._id}/assignments` : "/manager-assignments/classroom/_",
    assignmentParams,
    10,
    "data",
    !!selectedClassroom?._id
  );

  const studentParams = useMemo(() => ({
    search: studentSearch,
  }), [studentSearch]);

  const {
    data: students,
    page: studentPage,
    totalPages: studentTotalPages,
    total: studentTotal,
    loading: loadingStudents,
    fetchPage: fetchStudentPage,
    setData: setStudents,
    extra: studentExtra,
  } = usePagination(
    selectedAssignment ? `/manager-assignments/${selectedAssignment._id}/full` : "/manager-assignments/_/full",
    studentParams,
    10,
    "students",
    !!selectedAssignment?._id
  );

  const summaryMap = studentExtra?.summaryMap || {};

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
  const [bulkLocked, setBulkLocked] = useState(false);
  const bulkStopRef = useRef(false);

  // Priority (synchronous, no polling)
  const [priorityBulkRunning, setPriorityBulkRunning] = useState(false);
  const priorityStopRef = useRef(false);

  const [batchProgress, setBatchProgress] = useState(null);
  const [batchJob, setBatchJob] = useState(null);
  const batchStopRef = useRef(false);
  const batchPollRef = useRef(null);


  // Results modal
  const [singleProgress, setSingleProgress] = useState({});
  const [resultModal,      setResultModal]      = useState(null);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [editingAnnotations, setEditingAnnotations] = useState([]);
  const [editingSummary, setEditingSummary] = useState("");
  const [summaryTouched, setSummaryTouched] = useState(false);
  const [downloading,      setDownloading]      = useState(false);
  const [returning,        setReturning]        = useState(false);
  const [editingTotal, setEditingTotal] = useState(null); // null means use effectiveTotal
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);

  const [studentErrors, setStudentErrors] = useState({});

  const [markingProvider, setMarkingProvider] = useState("gemini");
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-3.1-flash-lite");
  const [savedResults, setSavedResults] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [exportingGrades, setExportingGrades] = useState(false);
  const [deletingCorrection, setDeletingCorrection] = useState({});
  const [percentOverrides, setPercentOverrides] = useState({});
  const [gradeOverrides, setGradeOverrides] = useState({});
  const [classroomSyncedGrades, setClassroomSyncedGrades] = useState({});

  const [aiReviewProgress, setAiReviewProgress] = useState({});
  const [aiReviewModal, setAiReviewModal] = useState(null);
  const [aiReviewPdfUrl, setAiReviewPdfUrl] = useState(null);
  const [aiReviewSaving, setAiReviewSaving] = useState(false);

  const [expectedPages, setExpectedPages] = useState(null);
  const [expectedPagesInput, setExpectedPagesInput] = useState("");
  const [settingExpectedPages, setSettingExpectedPages] = useState(false);
  const [showExpectedPagesEdit, setShowExpectedPagesEdit] = useState(false);

  // const [cachedMsFile, setCachedMsFile] = useState(null);

  const [errorViewer, setErrorViewer] = useState({
  open: false,
  title: "",
  message: null,
});

const resolvePdfSummary = (submissionId, result) =>
  getMarkingResultSummary(result, {
    storedSummary: savedResults[submissionId]?.summary,
    studentSummary: summaryMap[submissionId],
  });

  const assignmentMaxPoints = useMemo(() => {
    const assignment =
      selectedAssignment?.maxPoints != null
        ? selectedAssignment
        : studentExtra?.assignment ?? selectedAssignment;
    return resolveAssignmentMaxPoints(assignment, savedResults);
  }, [selectedAssignment, studentExtra?.assignment, savedResults]);

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
  } = useAnnotatedResultPreview({
    api,
    assignmentId: selectedAssignment?._id,
    resultModal,
    editingQuestions,
    editingAnnotations,
    editingSummary,
    effectiveMaxTotal,
    assignmentMaxPoints,
    editingMaxTotal,
    resolvePdfSummary,
  });

useEffect(() => {
  if (!resultModal || summaryTouched) return;
  const submissionId =
    resultModal.submissionId || resultModal.student?.submissionId;
  setEditingSummary(
    rebuildMarkingSummary({
      questions: editingQuestions,
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
  editingQuestions,
  effectiveMaxTotal,
  summaryTouched,
  savedResults,
]);

const fetchSavedResults = useCallback(async () => {
  if (!selectedAssignment?._id) return;
  try {
    const res = await api.get(`/submission-files/save-results/${selectedAssignment._id}`);
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
        provider: r.provider,
        mode: r.mode,
        summary: r.summary || "",
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
}, [selectedAssignment?._id]);

useEffect(() => {
  fetchSavedResults();
}, [fetchSavedResults]);

useEffect(() => { setStudentSearch(""); }, [selectedAssignment?._id]);

const refreshStudents = async () => {
  if (!selectedAssignment?._id) return;
  setRefreshing(true);
  try {
    const { students: freshList, maxPoints, pushResult } = await refreshAssignmentGrades(
      api,
      selectedAssignment._id,
      "manager",
      { gradeOverrides, students, savedResults, classroomSyncedGrades }
    );
    const syncedMaxPoints = maxPoints ?? selectedAssignment.maxPoints ?? null;
    if (syncedMaxPoints != null) {
      setSelectedAssignment((prev) => (prev ? { ...prev, maxPoints: syncedMaxPoints } : prev));
      setEditingMaxTotal(null);
    }

    let savedMap = {};
    try {
      const res = await api.get(`/submission-files/save-results/${selectedAssignment._id}`);
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
      resolveAssignmentMaxPoints(selectedAssignment, savedMap);

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

    await fetchStudentPage(studentPage);

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
  } catch {
    toast.error("Failed to refresh from Google Classroom");
  } finally {
    setRefreshing(false);
  }
};

const handleExportGradesExcel = async () => {
  if (!selectedAssignment?._id) return;

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
      `/manager-assignments/${selectedAssignment._id}/full`,
      {},
      "students"
    );

    const mergedStudents = allStudents.map((s) => {
      const sr = savedResults[s.submissionId];
      if (!sr) return s;
      const grade = resolveSavedMarkingGrade(sr);
      return grade != null ? { ...s, assignedGrade: grade } : s;
    });

    const filename = `${sanitizeExcelFilenameBase(selectedAssignment.title)}_grades_${targetMax}.xlsx`;
    exportAssignmentGradesExcel({
      students: mergedStudents,
      targetMax,
      assignmentMaxPoints,
      savedResults,
      percentOverrides,
      gradeOverrides,
      classroomSyncedGrades,
      filename,
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
    await api.delete(`/submission-files/save-results/${selectedAssignment._id}/${submissionId}`);
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

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return navigate("/login");
    setUser(JSON.parse(stored));
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;
    api.get("/marking/prompts")
      .then(r => setSavedPrompts(r.data || []))
      .catch(() => {});
    api.get("/marking/gemini-models")
      .then((r) => {
        const { models } = parseGeminiModelsResponse(r.data);
        setGeminiModels(models);
        setGeminiModel((prev) => pickValidGeminiModel(models, prev));
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (studentExtra.assignment) {
      const a = studentExtra.assignment;
      setMsInfo(a.markSchemeFileId ? { fileId: a.markSchemeFileId, webLink: a.markSchemeWebLink } : null);
      setExpectedPages(a.expectedPages ?? null);
      setExpectedPagesInput(a.expectedPages != null ? String(a.expectedPages) : "");
    }
  }, [studentExtra.assignment]);

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
  }, []);

 
    

  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setMsInfo(null);
  };

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);
    setMsInfo(null);
    setBulkProgress({});
    setExpectedPages(null);
    setExpectedPagesInput("");
    setShowExpectedPagesEdit(false);
    try {
      const msRes = await api.get(`/manager-assignments/${assignment._id}/markscheme`);
      setMsInfo(msRes.data.fileId ? msRes.data : null);
    } catch { /* markscheme optional */ }
  };

  const expandClassroomSection = () => {
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setMsInfo(null);
    setBulkProgress({});
  };

  const expandAssignmentSection = () => {
    setSelectedAssignment(null);
    setMsInfo(null);
    setBulkProgress({});
    setExpectedPages(null);
    setExpectedPagesInput("");
    setShowExpectedPagesEdit(false);
  };

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

  const handleBack = () => {
    if (selectedAssignment) {
      expandAssignmentSection();
      return;
    }
    if (selectedClassroom) {
      expandClassroomSection();
      return;
    }
    navigate("/manager/dashboard");
  };

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


  const openGuidanceModal = (student = null, isBatch = false, intent = null) => {
    if (expectedPages === null) {
      toast.warn("Please set the expected page count for this assignment before marking");
      setShowExpectedPagesEdit(true);
      return;
    }
    setGuidanceModal(
      intent === "priority"
        ? { priority: true, student }
        : intent === "priorityBulk"
        ? { priorityBulk: true }
        : isBatch
        ? { batch: true }
        : student
        ? { student }
        : { bulk: true }
    );

    setGuidance("");
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
  };

  const handleSetExpectedPages = async () => {
    if (!selectedAssignment?._id) return;
    const val = expectedPagesInput.trim();
    const parsed = val === "" ? null : parseInt(val, 10);
    if (val !== "" && (!Number.isInteger(parsed) || parsed <= 0)) {
      toast.warn("Expected pages must be a positive integer");
      return;
    }
    setSettingExpectedPages(true);
    try {
      await api.patch(`/manager-assignments/${selectedAssignment._id}/expected-pages`, { expectedPages: parsed });
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
    batchStopRef.current = true;
    if (batchPollRef.current) {
      clearInterval(batchPollRef.current);
      batchPollRef.current = null;
    }

    const jobId = batchJob?.jobId;
    setBatchJob(null);

    if (jobId) {
      try {
        await api.delete(`/marking/mark-batch/cancel/${jobId}`);
        toast.info("Batch marking cancelled");
      } catch (err) {
        toast.warning(extractHumanError(err) || "Batch stop requested — server cancel failed");
      }
  }
}

  const stopPriorityBulk = () => {
    priorityStopRef.current = true;
    setPriorityBulkRunning(false);
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
    toast.info("Stopping priority marking…");
  };

  const providerDisplayLabel = (provider) => {
    if (provider === "claude") return "Claude";
    return "Gemini";
  };

  const resolveStudentMarkingContext = (student, rowCtx = {}) => {
    const {
      batch,
      batchDone,
      bulk,
      bulkDone,
      single,
      db,
    } = rowCtx;

    if (batchDone && batch?.result) {
      return {
        result: batch.result,
        provider: "gemini",
        mode: batch.result?.markingMode || "normal",
      };
    }
    if (bulkDone && bulk?.result) {
      return {
        result: bulk.result,
        provider: markingProvider,
        mode: bulk.result?.markingMode || "normal",
      };
    }
    if (single?.status === "done" && single?.result) {
      return {
        result: single.result,
        provider: markingProvider,
        mode: single.result?.markingMode || "normal",
      };
    }
    if (db?.result) {
      return {
        result: db.result,
        provider: db.provider || "gemini",
        mode: db.mode || db.result?.markingMode || "normal",
      };
    }
    return null;
  };

  const hasSavedMarkingResult = (rowCtx) => !!resolveStudentMarkingContext(null, rowCtx);

  const findFlaggedReviewQuestions = (existingQuestions, qwenQuestions) => {
    const existing = existingQuestions || [];
    const qwen = qwenQuestions || [];
    const existingMap = new Map(existing.map((q) => [String(q.questionNumber), q]));
    const qwenMap = new Map(qwen.map((q) => [String(q.questionNumber), q]));
    const allNumbers = new Set([...existingMap.keys(), ...qwenMap.keys()]);
    const flagged = [];

    for (const questionNumber of allNumbers) {
      const existingQ = existingMap.get(questionNumber);
      const qwenQ = qwenMap.get(questionNumber);
      const existingMarks = existingQ ? Number(existingQ.marksAwarded) : null;
      const qwenMarks = qwenQ ? Number(qwenQ.marksAwarded) : null;

      if (existingMarks === qwenMarks) continue;

      flagged.push({
        questionNumber,
        existingMarks,
        qwenMarks,
        maxMarks: existingQ?.maxMarks ?? qwenQ?.maxMarks ?? 0,
        existingQuestion: existingQ,
        qwenQuestion: qwenQ,
        resolvedMarks: existingQ ? Number(existingQ.marksAwarded) : (qwenQ ? Number(qwenQ.marksAwarded) : 0),
        resolution: null,
        manualInput: "",
      });
    }

    return flagged;
  };

  const runAiReview = async (student, rowCtx) => {
    const ctx = resolveStudentMarkingContext(student, rowCtx);
    if (!ctx?.result) {
      toast.warn("No marking result found for this student");
      return;
    }

    const submissionId = student.submissionId;
    setAiReviewProgress((prev) => ({ ...prev, [submissionId]: "reviewing" }));

    try {
      const [studentPdfRes, msPdfRes] = await Promise.all([
        api.get("/submission-files/pdf", {
          params: { assignmentId: selectedAssignment._id, submissionId },
          responseType: "blob",
        }),
        api.get(`/manager-assignments/${selectedAssignment._id}/markscheme-file`, {
          responseType: "blob",
        }),
      ]);

      await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
      await assertPdfBlob(msPdfRes.data, "Mark scheme");

      const studentFile = new File(
        [studentPdfRes.data],
        `${student.name || "student"}.pdf`,
        { type: "application/pdf" }
      );
      const msFile = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });

      const fd = new FormData();
      fd.append("studentPdf", studentFile);
      fd.append("markSchemePdf", msFile);
      fd.append("assignmentId", selectedAssignment._id);
      fd.append("submissionId", submissionId);
      if (selectedAssignment.maxPoints) {
        fd.append("totalGrade", selectedAssignment.maxPoints);
      }

      const res = await api.post("/ai-review/review", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000,
      });

      const flagged = findFlaggedReviewQuestions(
        ctx.result.questions,
        res.data.questions
      );

      if (!flagged.length) {
        toast.success("AI Review complete — no discrepancies found");
        return;
      }

      const pdfUrl = URL.createObjectURL(
        new Blob([studentPdfRes.data], { type: "application/pdf" })
      );

      setAiReviewModal({
        student,
        existingResult: ctx.result,
        qwenResult: res.data,
        flagged,
        provider: ctx.provider,
        mode: ctx.mode,
        pdfUrl,
      });
      setAiReviewPdfUrl(pdfUrl);
    } catch (err) {
      toast.error(await getApiErrorMessage(err));
    } finally {
      setAiReviewProgress((prev) => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
    }
  };

  const closeAiReviewModal = () => {
    if (aiReviewModal?.pdfUrl) URL.revokeObjectURL(aiReviewModal.pdfUrl);
    setAiReviewModal(null);
    setAiReviewPdfUrl(null);
  };

  const resolveFlaggedQuestion = (questionNumber, resolution, marks) => {
    setAiReviewModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        flagged: prev.flagged.map((item) =>
          item.questionNumber === questionNumber
            ? { ...item, resolution, resolvedMarks: marks }
            : item
        ),
      };
    });
  };

  const saveAiReviewResolutions = async () => {
    if (!aiReviewModal) return;

    const unresolved = aiReviewModal.flagged.filter((f) => f.resolution == null);
    if (unresolved.length) {
      toast.warn("Please resolve all flagged questions before saving");
      return;
    }

    setAiReviewSaving(true);
    try {
      const resolvedMap = new Map(
        aiReviewModal.flagged.map((f) => [String(f.questionNumber), f.resolvedMarks])
      );

      const updatedQuestions = (aiReviewModal.existingResult.questions || []).map((q) => {
        const key = String(q.questionNumber);
        if (!resolvedMap.has(key)) return { ...q };
        return { ...q, marksAwarded: resolvedMap.get(key) };
      });

      for (const f of aiReviewModal.flagged) {
        if (!aiReviewModal.existingResult.questions?.some(
          (q) => String(q.questionNumber) === String(f.questionNumber)
        ) && f.qwenQuestion) {
          updatedQuestions.push({
            ...f.qwenQuestion,
            marksAwarded: f.resolvedMarks,
          });
        }
      }

      const finalResult = buildFinalMarkingResult(aiReviewModal.existingResult, updatedQuestions);
      const submissionId = aiReviewModal.student.submissionId;

      const saveProvider = ["gemini", "claude"].includes(aiReviewModal.provider)
        ? aiReviewModal.provider
        : "gemini";

      await api.post("/submission-files/save-results", {
        assignmentId: selectedAssignment._id,
        submissionId,
        studentId: aiReviewModal.student.studentId,
        studentName: aiReviewModal.student.name,
        mode: aiReviewModal.mode,
        provider: saveProvider,
        result: finalResult,
      });

      const savedEntry = {
        status: "done",
        result: finalResult,
        aiOriginalResult: aiReviewModal.existingResult,
        provider: aiReviewModal.provider,
        mode: aiReviewModal.mode,
        totalMarks: resolveTotalMarksFromResult(finalResult),
      };

      setSavedResults((prev) => ({ ...prev, [submissionId]: savedEntry }));
      setSingleProgress((prev) => ({ ...prev, [submissionId]: savedEntry }));
      setStudents((prev) =>
        prev.map((s) =>
          s.submissionId === submissionId
            ? {
                ...s,
                assignedGrade: resolveTotalMarksFromResult(finalResult),
              }
            : s
        )
      );

      toast.success("Review resolutions saved");
      closeAiReviewModal();
    } catch (err) {
      toast.error(await getApiErrorMessage(err));
    } finally {
      setAiReviewSaving(false);
    }
  };

  const runMarkStudent = async (student, guidanceText, mode = "normal", provider = markingProvider) => {
    setMarkingStudentId(student.submissionId);
    setSingleProgress(prev => ({
      ...prev,
      [student.submissionId]: {
        status: "marking"
      }
    }));

    try {
      const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
      if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

      const [studentPdfRes, msPdfRes] = await Promise.all([
        api.get("/submission-files/pdf", {
          params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
          responseType: "blob"
        }),
        api.get(`/manager-assignments/${selectedAssignment._id}/markscheme-file`, {
          responseType: "blob"
        })
      ]);

      await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
      await assertPdfBlob(msPdfRes.data, "Mark scheme");

      const studentFile = new File([studentPdfRes.data], `${student.name || "student"}.pdf`, { type: "application/pdf" });
      const msFile      = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });

      const fd = new FormData();
      fd.append("studentPdf",    studentFile);
      fd.append("markingMode",   mode);
      const guidanceValue = guidanceForForm(guidanceText);
      if (guidanceValue) fd.append("guidance", guidanceValue);
      if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
      appendMarkingContext(fd, {
        assignmentId: selectedAssignment._id,
        classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      });

      if (provider !== "claude") {
        fd.append("geminiModel", selectedModel);
      }
      fd.append("markSchemePdf", msFile);

      const endpoint =
      provider === "claude"
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
        submissionId: student.submissionId,
      });
      setSingleProgress(prev => ({
          ...prev,
          [student.submissionId]: {
            status: "done",
            result: res.data,
            studentFile
          }
        }));
        await api.post("/submission-files/save-results", {
            assignmentId:selectedAssignment._id,
            submissionId: student.submissionId,
            studentId: student.studentId,
            studentName: student.name,
            mode,
            provider,
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

      setEditingQuestions(res.data.questions.map(q => ({ ...q })));
      setEditingAnnotations(getTeacherAnnotations(res.data).map((a) => ({ ...a })));
      setEditingMaxTotal(null);
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
            // toast.error(await getApiErrorMessage(err));
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runMarkStudentPriority = async (student, guidanceText, mode = "normal") => {
    setMarkingStudentId(student.submissionId);
    setSingleProgress(prev => ({
      ...prev,
      [student.submissionId]: {
        status: "marking"
      }
    }));

    try {
      const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
      if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

      const [studentPdfRes, msPdfRes] = await Promise.all([
        api.get("/submission-files/pdf", {
          params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
          responseType: "blob"
        }),
        api.get(`/manager-assignments/${selectedAssignment._id}/markscheme-file`, {
          responseType: "blob"
        })
      ]);

      await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
      await assertPdfBlob(msPdfRes.data, "Mark scheme");

      const studentFile = new File([studentPdfRes.data], `${student.name || "student"}.pdf`, { type: "application/pdf" });
      const msFile      = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });

      const fd = new FormData();
      fd.append("studentPdf",    studentFile);
      fd.append("markingMode",   mode);
      const guidanceValue = guidanceForForm(guidanceText);
      if (guidanceValue) fd.append("guidance", guidanceValue);
      if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
      appendMarkingContext(fd, {
        assignmentId: selectedAssignment._id,
        classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      });
      fd.append("geminiModel", selectedModel);
      fd.append("markSchemePdf", msFile);

      const res = await api.post("/marking/mark-priority", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      const enrichedResult = buildPriorityMarkingResult(
        res.data,
        res.data.tokenUsage,
        selectedModel,
        res.data.servedServiceTier
      );

      setResultModal({
        student,
        result: enrichedResult,
        originalAiResult: JSON.parse(JSON.stringify(enrichedResult)),
        studentFile,
        submissionId: student.submissionId,
      });
      setSingleProgress(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: enrichedResult,
          studentFile
        }
      }));
      await api.post("/submission-files/save-results", {
        assignmentId: selectedAssignment._id,
        submissionId: student.submissionId,
        studentId: student.studentId,
        studentName: student.name,
        mode,
        provider: "gemini-priority",
        result: enrichedResult
      });
      setSavedResults(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: enrichedResult,
          aiOriginalResult: JSON.parse(JSON.stringify(enrichedResult)),
          totalMarks: resolveTotalMarksFromResult(enrichedResult),
        }
      }));

      setStudents(prev =>
        prev.map(s =>
          s.submissionId === student.submissionId
            ? {
                ...s,
                assignedGrade: resolveTotalMarksFromResult(enrichedResult)
              }
            : s
        )
      );

      if (res.data?.servedServiceTier === "standard") {
        toast.info("Priority unavailable — ran at standard speed.");
      }

      const tokenTotal = enrichedResult?.tokenUsage?.totalTokens;
      if (tokenTotal) {
        const cost = resolveMarkingCost(enrichedResult);
        const costText = cost ? ` · ${formatCostPair(cost)}` : "";
        toast.success(
          `Priority mark complete — ${Number(tokenTotal).toLocaleString()} tokens${costText}`
        );
      }

      setEditingQuestions(enrichedResult.questions.map(q => ({ ...q })));
      setEditingAnnotations(getTeacherAnnotations(enrichedResult).map((a) => ({ ...a })));
      setEditingMaxTotal(null);
    } catch (err) {
      const message = extractHumanError
        ? extractHumanError(err)
        : await getApiErrorMessage(err);

      recordStudentMarkingError(
        student.submissionId,
        message,
        err.response?.data,
        `Priority Marking Failed - ${student.name}`
      );
      setSingleProgress(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "error"
        }
      }));

      openErrorViewer(
        `Priority Marking Failed - ${student.name}`,
        message
      );

      toast.error(message);
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runBulkMark = async (guidanceText, mode = "normal", provider = markingProvider) => {
    try {
    toast.info("Loading all students for this assignment…");
    const allStudents = await fetchAllPaginated(
      api,
      `/manager-assignments/${selectedAssignment._id}/full`,
      {},
      "students"
    );

    const res = await api.post(
      "/submission-files/eligible-for-bulk-marking",
      {
        assignmentId: selectedAssignment._id,
        submissions: allStudents
      }
    );

    const backendEligible = new Set(
      res.data.map(s => s.submissionId)
    );

    const eligible = allStudents.filter(
      s => s.submissionId && backendEligible.has(s.submissionId)
    );
    
    if (!eligible.length) {
      const withSubmissions = allStudents.filter((s) => s.submissionId);
      if (!withSubmissions.length) {
        return toast.warn("No students with submissions");
      }
      return toast.warn("All submitted students are already marked for this assignment");
    }

    const guidanceValue = guidanceForForm(guidanceText);
    const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
    if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

    bulkStopRef.current = false;
    setBulkMarking(true);

    const progress = {};
    eligible.forEach(s => { progress[s.submissionId] = { status: "pending" }});
    setBulkProgress({ ...progress });

    let doneCount = 0;
    let errorCount = 0;

    for (const student of eligible) {
      if (bulkStopRef.current) break;

      setBulkProgress(p => ({ 
        ...p, 
        [student.submissionId]:{
          status: "marking",
          attempt: 0,
          maxAttempts: MARKING_MAX_ATTEMPTS
        }
      }));

      let studentFile;
      let msFile;

      try {
        const [studentPdfRes, msPdfRes] = await Promise.all([
          api.get("/submission-files/pdf", {
            params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
            responseType: "blob"
          }),
          api.get(`/manager-assignments/${selectedAssignment._id}/markscheme-file`, {
            responseType: "blob"
          }),
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
          maxTotalMarks: selectedAssignment.maxPoints,
        });
        try {
          await api.post("/submission-files/save-results", {
            assignmentId: selectedAssignment._id,
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

        const fd = new FormData();
        fd.append("studentPdf",    studentFile);
        fd.append("markingMode",   mode);

        if (guidanceValue) fd.append("guidance", guidanceValue);

        if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
    
        appendMarkingContext(fd, {
          assignmentId: selectedAssignment._id,
          classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
        });
        if (provider !== "claude") {
          fd.append("geminiModel", selectedModel);
        }
        if (msFile) {
          fd.append("markSchemePdf", msFile);
        }

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
            assignmentId: selectedAssignment._id,
            submissionId: student.submissionId,
            studentId: student.studentId,
            studentName: student.name,
            mode,
            provider,
            result: resultData,
          });
                  // HEAD: setSavedResults dropped by 00b30c1, restored here
        setSavedResults(prev => ({
          ...prev,
          [student.submissionId]: {
            status: "done",
            result: resultData,
            aiOriginalResult: JSON.parse(JSON.stringify(resultData)),
            totalMarks: resolveTotalMarksFromResult(resultData),
          }
        }));
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
  fetchStudentPage(studentPage);
  } catch (err) {
    setBulkMarking(false);
    toast.error(await getApiErrorMessage(err));
  }
  };

  const checkForActiveJob = async () => {
    try {
      const { data } = await api.get(
        `/marking/mark-batch/active/${selectedAssignment._id}`
      );
      console.log("checkForActiveJob response:", data);
      if (data.active) {
        const {
          jobId,
          studentOrder,
          submittedAt,
          geminiModel: jobModel,
        } = data.active;
        const restoredModel = pickValidGeminiModel(geminiModels, jobModel || geminiModel);
        console.log("restoring batch job:", jobId);
        setBatchJob({
          phase:       "processing",
          jobId,
          total:       studentOrder?.length || 0,
          submittedAt,
          skipped:     {},
          results:     {},
          mode:        "normal",
          geminiModel: restoredModel,
          batchStudents: studentOrder || [],
        });
        pollBatchJob(jobId, {
          mode: "normal",
          geminiModel: restoredModel,
          batchStudents: studentOrder || [],
        });
      }
    } catch (err) {
      console.error("checkForActiveJob:", err.message);
    }
  };

  useEffect(() => {
    if (!selectedAssignment?._id) return;
    checkForActiveJob();
  }, [selectedAssignment?._id]); // runs whenever selected assignment changes



  const pollBatchJob = async (jobId, jobMeta = {}) => {
    if (batchStopRef.current) return;
    // Clear any existing poll first
    if (batchPollRef.current) {
      clearInterval(batchPollRef.current);
      batchPollRef.current = null;
    }

    console.log("Starting poll for jobId:", jobId);

    const doPoll = async () => {
      if (batchStopRef.current) return;
      console.log("Polling:", jobId);
      try {
        const { data } = await api.get(`/marking/mark-batch/status/${jobId}`);
        console.log("Poll response state:", data.state);

        if (data.state === "JOB_STATE_PENDING" || data.state === "JOB_STATE_RUNNING") {
          setBatchJob(prev => ({ ...prev, phase: "processing", jobId }));
          toast.info("Still processing, check back soon…");
          return;
        }

        clearInterval(batchPollRef.current);
        batchPollRef.current = null;

        if (data.state === "JOB_STATE_FAILED") {
          const message = "Batch marking job failed.";
          recordMarkingErrorsForStudents(jobMeta.batchStudents, null, message);
          setBatchJob(prev => ({ ...prev, phase: "error" }));
          toast.error(message);
          return;
        }

        // SUCCEEDED
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

          if (!success) {
            const message =
              typeof error === "string"
                ? error
                : error?.message || "Batch marking failed";
            recordStudentMarkingError(student.submissionId, message, error);
          }

          if (success) {
            setStudents(prev =>
              prev.map(s => s.submissionId === student.submissionId
                ? {
                    ...s,
                    assignedGrade: resolveTotalMarksFromResult(result)
                  }
                : s
              )
            );

            await api.post("/submission-files/save-results", {
              assignmentId: selectedAssignment._id,
              submissionId: student.submissionId,
              studentId:    student.studentId,
              studentName:  student.name,
              mode:         saveMode,
              provider:     "gemini-batch",
              result:         enrichedResult,
            }).catch(e => console.error("save-results:", e.message));
          }
        }

        setBatchJob(prev => ({
          ...prev,
          phase: "done",
          results: { ...prev?.results, ...resultMap },
        }));
        toast.success(`Batch complete — ${data.results.filter(r => r.success).length} students marked.`);
        fetchStudentPage(studentPage);

      } catch (err) {
        console.error("Poll error:", err);
        clearInterval(batchPollRef.current);
        batchPollRef.current = null;
        setBatchJob(prev => ({ ...prev, phase: "error" }));
        toast.error(`Polling failed: ${extractHumanError(err)}`);
      }
    };

    doPoll();
    batchPollRef.current = setInterval(doPoll, 15_000);
  };


// ── Submit batch — memory setup + upload + submit, then hand off to pollBatchJob
const runBatchMark = async (guidanceText, mode = "normal", modelOverride = null) => {
  const selectedModel = pickValidGeminiModel(
    geminiModels,
    modelOverride || geminiModel
  );

  // 00b30c1: sync model state if it changed
  if (selectedModel !== geminiModel) {
    setGeminiModel(selectedModel);
  }

  // 00b30c1: fetch ALL students across pages, not just current page
  let eligible;
  let allStudents;
  try {
    toast.info("Loading all students for this assignment…");
    allStudents = await fetchAllPaginated(
      api,
      `/manager-assignments/${selectedAssignment._id}/full`,
      {},
      "students"
    );

    const res = await api.post(
      "/submission-files/eligible-for-bulk-marking",
      {
        assignmentId: selectedAssignment._id,
        submissions: allStudents,
      }
    );
    const backendEligible = new Set(res.data.map((s) => s.submissionId));
    // HEAD: also gate on isStudentSubmitted
    eligible = allStudents.filter(
      (s) =>
        s.submissionId &&
        backendEligible.has(s.submissionId) &&
        isStudentSubmitted(s.state)
    );
  } catch (err) {
    toast.error(extractHumanError(err) || "Failed to check eligible students");
    return;
  }

  if (!eligible.length) {
    const withSubmissions = (allStudents || []).filter((s) => s.submissionId);
    if (!withSubmissions.length) {
      return toast.warn("No students have submitted this assignment yet");
    }
    return toast.warn("All submitted students are already marked for this assignment");
  }

  const guidanceValue = guidanceForForm(guidanceText);


  batchStopRef.current = false;

  setBatchJob({
    phase: "uploading",
    total: eligible.length,
    skipped: {},
    results: {},
    mode,
    geminiModel: selectedModel,
    batchStudents: eligible.map(s => ({
      submissionId: s.submissionId,
      studentId: s.studentId,
      name: s.name,
    })),
  });

  // Step 1 — upload student PDFs + mark scheme
  let msUri, succeeded, failed, zeroed;
  try {
    const res = await api.post("/marking/mark-batch/upload", {
      assignmentId: selectedAssignment._id,
      markingMode: mode,          // HEAD: included for zeroed detection
      students: eligible.map(s => ({
        submissionId: s.submissionId,
        studentId:    s.studentId,
        name:         s.name,
        state:        s.state,   // HEAD: included for zeroed detection
      })),
    });
    ({ msUri, succeeded, failed, zeroed } = res.data);
  } catch (err) {
    const message = recordMarkingErrorsForStudents(
      eligible,
      err,
      "Upload failed"
    );
    toast.error(`Upload failed: ${message}`);
    setBatchJob(prev => ({ ...prev, phase: "error" }));
    return;
  }

  if (batchStopRef.current) {
    setBatchJob(null);
    toast.info("Batch marking stopped");
    return;
  }

  // HEAD: handle zeroed students (no PDF → 0 marks)
  if (zeroed?.length) {
    const zeroedResults = {};
    zeroed.forEach(({ student, result }) => {
      zeroedResults[student.submissionId] = {
        status: "done",
        result,
        originalAiResult: JSON.parse(JSON.stringify(result)),
      };
    });
    setBatchJob(prev => ({
      ...prev,
      results: { ...prev.results, ...zeroedResults },
    }));
    setStudents(prev =>
      prev.map(s =>
        zeroedResults[s.submissionId]
          ? { ...s, assignedGrade: 0 }
          : s
      )
    );
    toast.info(`${zeroed.length} student(s) with no PDF — awarded 0 marks`);
  }

  // Surface upload failures immediately
  const skipped = {};
  if (failed?.length) {
    toast.warning(`${failed.length} student(s) could not be uploaded`);
    failed.forEach(({ student, error }) => {
      skipped[student.submissionId] = { error };
      const message =
        typeof error === "string" ? error : error?.message || "Upload failed";
      recordStudentMarkingError(student.submissionId, message, error);
    });
    setBatchJob(prev => ({ ...prev, skipped }));
  }

  if (!succeeded?.length) {
    if (zeroed?.length) {
      setBatchJob(prev => ({ ...prev, phase: "done" }));
      toast.success(`Batch complete — ${zeroed.length} student(s) awarded 0 (no submission PDF).`);
      return;
    }
    const message = "No valid submissions to mark.";
    recordMarkingErrorsForStudents(eligible, null, message);
    toast.error(message);
    setBatchJob(prev => ({ ...prev, phase: "error" }));
    return;
  }

  if (batchStopRef.current) {
    setBatchJob(null);
    toast.info("Batch marking stopped");
    return;
  }

  // Step 2 — submit job (with overload retries)
  setBatchJob(prev => ({ ...prev, phase: "submitting" }));

  const submitPayload = {
    assignmentId:  selectedAssignment._id,
    msUri,
    succeeded,
    markingMode:   mode,
    guidance:      guidanceValue,
    geminiModel:   selectedModel,
    subjectId:     selectedAssignment.subjectId,
    ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
    classroomId:   selectedClassroom?._id ?? selectedAssignment?.classroomId,
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
    setBatchJob((prev) => ({ ...prev, phase: "error" }));
    return;
  }

  const { jobId, resumed } = submitResult.result;
  if (resumed) {
    toast.info("Resuming existing batch job...");
  }

  setBatchJob(prev => ({
    ...prev,
    phase: "processing",
    jobId,
    batchStudents: succeeded.map(r => r.student),
  }));

  // Step 3 — hand off to standalone poller
  pollBatchJob(jobId, {
    mode,
    geminiModel: selectedModel,
    batchStudents: succeeded.map(r => r.student),
  });
};


// ── Priority whole-class — synchronous, single request, no polling/jobId
const runPriorityBulk = async (guidanceText, mode = "normal") => {
  if (!PRIORITY_ALLOWED_IDS.includes(currentUserId())) {
    toast.error("You are not allowed to do priority marking.");
    return;
  }

  const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
  if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

  let eligible;
  let allStudents;
  try {
    toast.info("Loading all students for this assignment…");
    allStudents = await fetchAllPaginated(
      api,
      `/manager-assignments/${selectedAssignment._id}/full`,
      {},
      "students"
    );

    const res = await api.post("/submission-files/eligible-for-bulk-marking", {
      assignmentId: selectedAssignment._id,
      submissions: allStudents,
    });
    const backendEligible = new Set(res.data.map((s) => s.submissionId));
    eligible = allStudents.filter(
      (s) =>
        s.submissionId &&
        backendEligible.has(s.submissionId) &&
        isStudentSubmitted(s.state)
    );
  } catch (err) {
    toast.error(extractHumanError(err) || "Failed to check eligible students");
    return;
  }

  if (!eligible.length) {
    const submitted = allStudents.filter((s) => isStudentSubmitted(s.state));
    if (!submitted.length) {
      return toast.warn("No students have submitted this assignment yet");
    }
    return toast.warn("All submitted students are already marked for this assignment");
  }

  const guidanceValue = guidanceForForm(guidanceText);

  // Mark eligible rows as pending so the per-row UI shows progress.
  const progress = {};
  eligible.forEach((s) => { progress[s.submissionId] = { status: "marking" }; });
  priorityStopRef.current = false;
  setBulkProgress((prev) => ({ ...prev, ...progress }));
  setPriorityBulkRunning(true);

  try {
    const { data } = await api.post("/marking/mark-priority/bulk", {
      assignmentId: selectedAssignment._id,
      students: eligible.map((s) => ({
        submissionId: s.submissionId,
        studentId:    s.studentId,
        name:         s.name,
        state:        s.state,
      })),
      markingMode: mode,
      guidance:    guidanceValue,
      geminiModel: selectedModel,
      subjectId:   selectedAssignment.subjectId,
      ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
      classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
    });

    if (priorityStopRef.current) {
      setBulkProgress((p) => {
        const next = { ...p };
        for (const s of eligible) {
          const st = next[s.submissionId]?.status;
          if (st === "pending" || st === "marking" || st === "retrying" || st === "stopped") {
            next[s.submissionId] = { status: "cancelled" };
          }
        }
        return next;
      });
      toast.info("Priority marking stopped");
      return;
    }

    let downgradedCount = 0;

    // Successes
    for (const { student, result, tokenUsage, servedServiceTier } of (data.results || [])) {
      const enrichedResult = buildPriorityMarkingResult(
        result,
        tokenUsage,
        selectedModel,
        servedServiceTier
      );
      if (servedServiceTier === "standard") downgradedCount++;

      setBulkProgress((p) => ({
        ...p,
        [student.submissionId]: {
          status: "done",
          result: enrichedResult,
          originalAiResult: JSON.parse(JSON.stringify(enrichedResult)),
        },
      }));
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

      await api.post("/submission-files/save-results", {
        assignmentId: selectedAssignment._id,
        submissionId: student.submissionId,
        studentId:    student.studentId,
        studentName:  student.name,
        mode,
        provider:     "gemini-priority",
        result:       enrichedResult,
      }).catch((e) => console.error("save-results:", e.message));
      setSavedResults(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: enrichedResult,
          aiOriginalResult: JSON.parse(JSON.stringify(enrichedResult)),
          totalMarks: resolveTotalMarksFromResult(enrichedResult),
        }
      }));
    }

    // Failures
    for (const { student, error } of (data.failed || [])) {
      const message =
        typeof error === "string" ? error : error?.message || "Priority marking failed";
      setBulkProgress((p) => ({
        ...p,
        [student.submissionId]: { status: "error" },
      }));
      recordStudentMarkingError(student.submissionId, message, error);
    }

    // Zeroed (no PDF) — already persisted server-side, just reflect in UI
    for (const { student, result } of (data.zeroed || [])) {
      setBulkProgress((p) => ({
        ...p,
        [student.submissionId]: {
          status: "done",
          result,
          originalAiResult: JSON.parse(JSON.stringify(result)),
        },
      }));
      setStudents((prev) =>
        prev.map((s) =>
          s.submissionId === student.submissionId ? { ...s, assignedGrade: 0 } : s
        )
      );
    }

    // Skipped (already marked / not submitted) — clear any pending state
    for (const { student } of (data.skipped || [])) {
      setBulkProgress((p) => {
        const next = { ...p };
        if (next[student.submissionId]?.status === "marking") {
          delete next[student.submissionId];
        }
        return next;
      });
    }

    const ok = (data.results || []).length;
    const zeroed = (data.zeroed || []).length;
    const failed = (data.failed || []).length;
    const tokenTotal = data.aggregateTokenUsage?.totalTokens;
    const aggregateCost = data.aggregateEstimatedCost;
    const tokenSummary =
      tokenTotal != null
        ? ` · ${Number(tokenTotal).toLocaleString()} tokens` +
          (aggregateCost ? ` · ${formatCostPair(aggregateCost)}` : "")
        : "";
    toast.success(
      `Priority complete — ${ok} marked` +
      (zeroed ? `, ${zeroed} zeroed` : "") +
      (failed ? `, ${failed} failed` : "") +
      tokenSummary
    );
    if (downgradedCount) {
      toast.info(`${downgradedCount} student(s) ran at standard speed (priority unavailable).`);
    }
  } catch (err) {
    if (priorityStopRef.current) {
      setBulkProgress((p) => {
        const next = { ...p };
        for (const s of eligible) {
          const st = next[s.submissionId]?.status;
          if (st === "pending" || st === "marking" || st === "retrying" || st === "stopped") {
            next[s.submissionId] = { status: "cancelled" };
          }
        }
        return next;
      });
      toast.info("Priority marking stopped");
      return;
    }
    const message = recordMarkingErrorsForStudents(
      eligible,
      err,
      "Priority marking failed"
    );
    eligible.forEach((s) =>
      setBulkProgress((p) => ({ ...p, [s.submissionId]: { status: "error" } }))
    );
    openErrorViewer("Priority Marking Failed", message);
    toast.error(message);
  } finally {
    setPriorityBulkRunning(false);
  }
};


// Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (batchPollRef.current) clearInterval(batchPollRef.current);
    };
  }, []);


// Resume polling if page was already in "processing" state
// (e.g. user navigated away and came back — if you persist batchJob to localStorage)
  useEffect(() => {
    if (batchJob?.phase === "processing" && batchJob?.jobId && !batchPollRef.current) {
      pollBatchJob(batchJob.jobId, {
        mode: batchJob.mode,
        geminiModel: batchJob.geminiModel,
        batchStudents: batchJob.batchStudents,
      });
    }
  }, []); // only on mount




  const handleGuidanceConfirm = (provider = markingProvider) => {
    if (!guidanceModal) return;
    if (markingModeModal === "criteria" && !normalizeGuidance(guidance)) {
      return toast.warn("Criteria marking requires guidance to be provided");
    }
    const g    = normalizeGuidance(guidance);
    const mode = markingModeModal;
    setMarkingProvider(provider);
    if (guidanceModal.bulk) {
      setGuidanceModal(null);
      runBulkMark(g, mode, provider);
    } else if (guidanceModal.batch) {
      setGuidanceModal(null);
      runBatchMark(g, mode, pickValidGeminiModel(geminiModels, geminiModel));
    } else if (guidanceModal.priorityBulk) {
      setGuidanceModal(null);
      runPriorityBulk(g, mode);
    } else if (guidanceModal.priority) {
      setGuidanceModal(null);
      runMarkStudentPriority(guidanceModal.student, g, mode);
    } else {
      setGuidanceModal(null);
      runMarkStudent(guidanceModal.student, g, mode, provider);
    }
  };

  const downloadGradedPdf = async () => {
    if (!resultModal) return;
    if (!selectedAssignment?._id) return;
    if (hasPendingEdits) {
      toast.warn("Confirm your edits first");
      return;
    }
    setDownloading(true);
    try {
      const totalMarks = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);

      const db = savedResults[resultModal.student?.submissionId];
    
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;

      const pdfRes = await api.get("/submission-files/pdf", {
        params: {
          assignmentId: selectedAssignment._id,
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
          (s, q) => s + (Number(q.marksAwarded) || 0),
          0
        ),
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
      });

      const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `${resultModal.student.name || "student"}_graded.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    } catch (err) {
      toast.error(await getApiErrorMessage(err) || "Failed to download PDF");
    } finally { setDownloading(false); }
  };

  const handleConfirmEdits = async () => {
    if (!resultModal || !selectedAssignment?._id) return;
    try {
      const finalResult = await confirmEdits(async ({ finalResult, submissionId }) => {
        await api.post("/submission-files/save-results", {
          assignmentId: selectedAssignment._id,
          submissionId: resultModal.student.submissionId || submissionId,
          studentId: resultModal.student.studentId,
          studentName: resultModal.student.name,
          mode: finalResult.markingMode || markingModeModal,
          provider: markingProvider,
          result: finalResult,
        });
        if (finalResult.summary?.trim()) {
          await api.post("/submission-files/save-summary", {
            assignmentId: selectedAssignment._id,
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
        toast.success("Edits confirmed — preview and grade updated");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to confirm edits");
    }
  };

  const returnToStudent = async () => {
    if (!resultModal) return;
    if (hasPendingEdits) {
      toast.warn("Confirm your edits first so the returned PDF matches the preview");
      return;
    }
    setReturning(true);
    try {
      const db = savedResults[resultModal.student?.submissionId];
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;

      let studentFile = resultModal.studentFile;
      if (!studentFile && submissionId) {
        const pdfRes = await api.get("/submission-files/pdf", {
          params: {
            assignmentId: selectedAssignment._id,
            submissionId,
          },
          responseType: "blob",
        });
        studentFile = new File(
          [pdfRes.data],
          `${resultModal.student?.name || "student"}.pdf`,
          { type: "application/pdf" }
        );
      }

      const totalMarks = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        totalMarks,
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
      });
      const fd = new FormData();
      fd.append("annotatedPdf", new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId", selectedAssignment._id);
      fd.append("submissionId", resultModal.student.submissionId || submissionId);
      fd.append("totalMarks", totalMarks);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName", resultModal.student.name || "Student");
      appendClassroomGradeToFormData(fd, {
        submissionId: resultModal.student.submissionId || submissionId,
        student: resultModal.student,
        gradeOverrides,
        savedResults,
        classroomSyncedGrades,
        fallbackTotal: totalMarks,
      });

      const pdfSummary = resolvePdfSummary(resultModal.student.submissionId, resultModal.result);
      if (pdfSummary) {
        await api.post("/submission-files/save-summary", {
          assignmentId: selectedAssignment._id,
          submissionId: resultModal.student.submissionId,
          summary: pdfSummary,
        });
      }

      await api.post("/submission-files/return-marked", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      toast.success("Marked paper returned to student");
      setResultModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to return paper");
    } finally {
      setReturning(false);
    }
  };

  const handleReturnAll = async () => {
    try {
      setReturning(true);

      const bulkSaveRequests = Object.entries(bulkProgress)
        .filter(([submissionId, bulk]) =>
          bulk?.status === "done" &&
          resolvePdfSummary(submissionId, bulk?.result) &&
          !bulk?.returned
        )
        .map(([submissionId, bulk]) =>
          api.post("/submission-files/save-summary", {
            assignmentId: selectedAssignment._id,
            submissionId,
            summary: resolvePdfSummary(submissionId, bulk.result),
          })
        );

      const batchSaveRequests = Object.entries(batchJob?.results || {})
        .filter(([submissionId, batch]) =>
          batch?.status === "done" &&
          resolvePdfSummary(submissionId, batch?.result) &&
          !batch?.returned
        )
        .map(([submissionId, batch]) =>
          api.post("/submission-files/save-summary", {
            assignmentId: selectedAssignment._id,
            submissionId,
            summary: resolvePdfSummary(submissionId, batch.result),
          })
        );

      await Promise.all([...bulkSaveRequests, ...batchSaveRequests]);

      await returnAllToStudents();
    } finally {
      setReturning(false);
    }
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

  const filteredClassrooms  = classrooms;
  const filteredAssignments = assignments;
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


  const resolveBatchStudentForReturn = (submissionId) => {
    const fromPage = students.find(s => s.submissionId === submissionId);
    if (fromPage) return fromPage;
    const fromBatch = batchJob?.batchStudents?.find(s => s.submissionId === submissionId);
    if (fromBatch) return fromBatch;
    return { submissionId, name: "Student" };
  };

  const returnAllToStudents = async () => {
    const bulkQueue = students.filter(s => {
      const bulk = bulkProgress[s.submissionId];
      return bulk?.status === "done" && bulk?.result && !bulk?.returned;
    });

    const bulkSubmissionIds = new Set(bulkQueue.map(s => s.submissionId));
    const batchQueue = Object.entries(batchJob?.results || {})
      .filter(([submissionId, batch]) =>
        !bulkSubmissionIds.has(submissionId) &&
        batch?.status === "done" &&
        batch?.result &&
        !batch?.returned
      )
      .map(([submissionId, batch]) => ({
        student: resolveBatchStudentForReturn(submissionId),
        batch,
        submissionId,
      }));

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
        selectedAssignment?.maxPoints ??
        0,
    });

    try {
      for (const student of bulkQueue) {
        const bulk = bulkProgress[student.submissionId];

        if (!bulk?.result) {
          toast.error(`Missing data for ${student.name}. Stopping return process.`);
          throw new Error("Missing bulk data");
        }

        // Priority bulk results have no local studentFile — fetch it on demand
        let studentFile = bulk.studentFile;
        if (!studentFile) {
          const pdfRes = await api.get("/submission-files/pdf", {
            params: {
              assignmentId: selectedAssignment._id,
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
        fd.append("assignmentId", selectedAssignment._id);
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

        setBulkProgress(p => ({
          ...p,
          [student.submissionId]: { ...bulk, returned: true }
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
            params: {
              assignmentId: selectedAssignment._id,
              submissionId,
            },
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
        fd.append("assignmentId", selectedAssignment._id);
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

        setBatchJob(prev => ({
          ...prev,
          results: {
            ...prev?.results,
            [submissionId]: { ...batch, returned: true },
          },
        }));
      }

      toast.success("All graded papers returned");
    } finally {
      setReturning(false);
    }
  };

  if (!user) return null;

  const isCriteria = resultModal?.result?.markingMode === "criteria";

  const total = sumQuestionMarks(editingQuestions);
  const max   = effectiveMaxTotal;
  const pct   = gradeScorePercent(total, max);
  const color = getScoreColor(total, max);

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
          <div className="ma-topbar-right">
            {selectedAssignment && (
              <button
                type="button"
                onClick={handleExportGradesExcel}
                disabled={exportingGrades}
                className="ma-send-btn"
                style={{ marginRight: 10 }}
              >
                <FiDownload size={13} /> {exportingGrades ? "Exporting…" : "Export Grades"}
              </button>
            )}
            <button type="button" onClick={handleBack} className="msv-cancel-btn">
              Back
            </button>
          </div>
        </header>

        <div className="ma-content">
          <div className="ma-layout msv-collapsible-layout">

            {/* ── CLASSROOMS ── */}
            {!selectedClassroom ? (
              <div className="ma-column">
                <p className="ma-section-label msv-section-header-expanded">▼ Select Classroom</p>
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
                <Pagination page={classroomPage} totalPages={classroomTotalPages} onPageChange={fetchClassroomPage} />
              </div>
            ) : (
              <div
                className="msv-section-collapsed"
                onClick={expandClassroomSection}
                onKeyDown={(e) => e.key === "Enter" && expandClassroomSection()}
                role="button"
                tabIndex={0}
              >
                <span className="msv-section-collapsed-chevron">▶</span>
                <span className="msv-section-collapsed-text">Classroom: {selectedClassroom.name}</span>
                <button
                  type="button"
                  className="msv-section-change"
                  onClick={(e) => { e.stopPropagation(); expandClassroomSection(); }}
                >
                  [change]
                </button>
              </div>
            )}

            {/* ── ASSIGNMENTS ── */}
            {selectedClassroom && (
              !selectedAssignment ? (
                <div className="ma-column">
                  <p className="ma-section-label msv-section-header-expanded">▼ Select Assignment</p>
                  <input className="ma-search-input" placeholder="Search assignments..." value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)} />
                  <div className="ma-scroll-list">
                    {loadingAssignments ? (
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
                  <Pagination page={assignmentPage} totalPages={assignmentTotalPages} onPageChange={fetchAssignmentPage} />
                </div>
              ) : (
                <div
                  className="msv-section-collapsed"
                  onClick={expandAssignmentSection}
                  onKeyDown={(e) => e.key === "Enter" && expandAssignmentSection()}
                  role="button"
                  tabIndex={0}
                >
                  <span className="msv-section-collapsed-chevron">▶</span>
                  <span className="msv-section-collapsed-text">Assignment: {selectedAssignment.title}</span>
                  <button
                    type="button"
                    className="msv-section-change"
                    onClick={(e) => { e.stopPropagation(); expandAssignmentSection(); }}
                  >
                    [change]
                  </button>
                </div>
              )
            )}

            {/* ── STUDENTS / SUBMISSIONS ── */}
            {selectedAssignment && (
            <div className="ma-right-panel msv-right-panel-full">
                <div className="ma-panel">
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

                  {/* View Mark Scheme */}
                    {msInfo && (
                      <button
                        className="msv-btn-ai"
                        onClick={() => openMarkScheme(msInfo)}
                        style={{
                          marginLeft: 10,
                          background: "rgba(59,130,246,0.15)",
                          border: "1px solid rgba(59,130,246,0.3)"
                        }}
                      >
                        View Mark Scheme
                      </button>
                    )}

                    {msInfo && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {/* // <button 
                      //   className="msv-btn-ai" 
                      //   onClick={() => openGuidanceModal()} 
                      //   disabled={bulkMarking}
                      // > */}
                          <button
                          className="msv-btn-ai"
                          onClick={() => openGuidanceModal(null, false)}
                          disabled={bulkMarking || batchJob?.phase === "processing"}
    >
                        {bulkMarking ? <><span className="pm-spinner" /> Marking all…</> : <><FiCpu size={13} /> Mark All Students</>}
                      </button>
                      {bulkMarking && (
                        <button
                          className="msv-btn-ai"
                          onClick={stopBulkMark}
                          style={{
                            background: "rgba(239,68,68,0.15)",
                            borderColor: "rgba(239,68,68,0.4)",
                            color: "#f87171",
                          }}
                        >
                          <FiX size={13} /> Stop
                        </button>
                      )}
                  </div>
                    )}
                 {/* Return All */}
                  {msInfo && !bulkMarking && (
                    <button
                      className="msv-btn-ai"
                      onClick={handleReturnAll}
                      disabled={returning}
                      style={{ marginLeft: 10, background: "rgba(34,197,94,0.15)" }}
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
                        disabled={
                          bulkMarking ||
                          batchJob?.phase === "uploading" ||
                          batchJob?.phase === "submitting" ||
                          batchJob?.phase === "processing"
                        }
                        title="Gemini model for batch marking"
                        style={{ minWidth: 210, maxWidth: 280 }}
                      >
                        {(geminiModels.length
                          ? geminiModels
                          : [{ id: geminiModel, label: geminiModel }]
                        ).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                        <button
                          className="msv-btn-ai"
                          onClick={() => {
                            if (batchJob?.phase === "processing") {
                              toast.info("Checking status…");
                              pollBatchJob(batchJob.jobId, {
                                mode: batchJob.mode,
                                geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
                                batchStudents: batchJob.batchStudents,
                              }); // "Check now" behaviour
                            } else {
                              openGuidanceModal(null, true);
                            }
                          }}
                          disabled={bulkMarking || batchJob?.phase === "uploading" || batchJob?.phase === "submitting"}
                          style={{ background: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.4)" }}
                        >
                          {batchJob?.phase === "uploading"  && <><span className="pm-spinner" /> Uploading…</>}
                          {batchJob?.phase === "submitting" && <><span className="pm-spinner" /> Submitting…</>}
                          {batchJob?.phase === "processing" && <><span className="pm-spinner" /> Batch running… (tap to check)</>}
                          {batchJob?.phase === "error"      && <>⚡ Batch failed — retry?</>}
                          {(!batchJob || batchJob.phase === "done") && <><FiLayers size={13} /> Mark All (Batch)</>}
                        </button>
                    </div>
                    )}

                  {/* PRIORITY MARKING (whole class, synchronous) */}
                  {msInfo && PRIORITY_ALLOWED_IDS.includes(currentUserId()) && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 10 }}>
                      <button
                        className="msv-btn-ai"
                        onClick={() => openGuidanceModal(null, false,"priorityBulk")}
                        disabled={bulkMarking || priorityBulkRunning || batchJob?.phase === "processing"}
                        title="Mark whole class on Gemini priority tier (fastest, premium)"
                        style={{ background: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.4)" }}
                      >
                        {priorityBulkRunning
                          ? <><span className="pm-spinner" /> Priority marking…</>
                          : <><FiSend size={13} /> Mark All (Priority)</>}
                      </button>
                      {priorityBulkRunning && (
                        <button
                          className="msv-btn-ai"
                          onClick={stopPriorityBulk}
                          style={{
                            background: "rgba(239,68,68,0.15)",
                            borderColor: "rgba(239,68,68,0.4)",
                            color: "#f87171",
                          }}
                        >
                          <FiX size={13} /> Stop
                        </button>
                      )}
                    </div>
                    )}
                    {batchJob && batchJob.phase !== "done" && (
                      <div style={{
                        marginTop: 8, padding: "10px 14px", borderRadius: 10,
                        background: "rgba(99,102,241,0.08)",
                        border: "1px solid rgba(99,102,241,0.2)",
                        fontSize: 12, color: "rgba(255,255,255,0.6)",
                        display: "flex", alignItems: "center", gap: 10
                      }}>
                        <span className="pm-spinner" style={{ width: 12, height: 12 }} />
                        <span>
                          {batchJob.phase === "uploading"  && `Uploading ${batchJob.total} student PDFs to Gemini…`}
                          {batchJob.phase === "submitting" && "Submitting batch job…"}
                          {batchJob.phase === "processing" && `Batch job processing (job: ${batchJob.jobId}) — checking every 15s…`}
                        </span>
    {/* Manual re-poll button in case user is impatient */}
    {/* {batchJob.phase === "processing" && (
      <button
        onClick={() => pollBatchJob(batchJob.jobId)}
        style={{ marginLeft: "auto", fontSize: 11, color: "#818cf8",
                 background: "none", border: "none", cursor: "pointer" }}
      >
        Check now
      </button>
    )}  */}
                            {batchJob?.phase === "processing" && (
                              <button
                                onClick={() => {
                                  console.log("Check now clicked, jobId:", batchJob.jobId);
                                  pollBatchJob(batchJob.jobId, {
                                    mode: batchJob.mode,
                                    geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
                                    batchStudents: batchJob.batchStudents,
                                  });
                                }}
                                style={{
                                  marginLeft: "auto", fontSize: 11, color: "#818cf8",
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
                                      color: "#f87171",
                                      background: "rgba(239,68,68,0.12)",
                                      border: "1px solid rgba(239,68,68,0.35)",
                                      borderRadius: 6,
                                      padding: "4px 10px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <FiX size={11} style={{ verticalAlign: -1 }} /> Stop
                                  </button>
                                )}

                                </div> )}
                                          </div>

                  {/* Expected Pages */}
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>📄 Expected Pages:</span>
                    {!showExpectedPagesEdit ? (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 600, color: expectedPages != null ? "#22c55e" : "#ef4444" }}>
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
                          style={{ width: 80, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "white" }}
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

                  <div className="ma-panel-header">
                    <div className="ma-panel-title-wrap">
                      <div className="ma-panel-dot" />
                      <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                      <span className="ma-panel-count">{studentTotal} students</span>
                    </div>
                    <div className="msv-panel-controls">
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
                        disabled={refreshing || loadingStudents}
                        title="Sync max points, grades, and resubmissions from Google Classroom"
                      >
                        <FiRefreshCw size={13} className={refreshing ? "msv-spin" : ""} />
                        {refreshing ? "Refreshing…" : "Refresh"}
                      </button>
                    </div>
                  </div>

                  {loadingStudents && <p className="ma-loading-msg">Loading students…</p>}
                  {!loadingStudents && students.length === 0 && (
                    <p className="ma-empty-msg">
                      {studentSearch ? `No students match "${studentSearch}".` : "No students found."}
                    </p>
                  )}

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
                                                  // only show as queued if this student was in the batch
                                                  batchJob?.total > 0;


                              const hasResult = !!(single?.status === "done" || db?.result);
                              const isMarking = single?.status === "marking" || markingStudentId === s.submissionId;
                              const hasError = single?.status === "error" || studentErrors[s.submissionId];

                              const markingLoading = isMarking || bulkMarking || bulkRetrying ||markingStudentId === s.submissionId || batchQueued;
                              const markingDone = bulkDone || hasResult || batchDone;
                              const markingError = bulkError || hasError || batchError || studentErrors[s.submissionId];
                              const inlineMarkResult =
                                (batchDone && batch?.result) ||
                                (bulkDone && bulk?.result) ||
                                (db?.result?.tokenUsage ? db.result : null);

                              const rowMarkingCtx = {
                                batch,
                                batchDone,
                                bulk,
                                bulkDone,
                                single,
                                db,
                              };
                              const showAiReview = hasSavedMarkingResult(rowMarkingCtx);
                              const aiReviewing = aiReviewProgress[s.submissionId] === "reviewing";
                            

                              return (
                                <tr key={s._id || s.submissionId} className="ma-row" style={{ animationDelay: `${i * 0.025}s` }}>
                                  <td>
                                    <div className="ma-avatar-cell">
                                      <div className="ma-avatar">{(s.name || "?").charAt(0).toUpperCase()}</div>
                                      <span className="ma-cell-name">{s.name || "—"}</span>
                                      {savedResults[s.submissionId]?.result?.fileWarning && (
                                        <span
                                          title="Submitted file may be wrong — page count differs from expected"
                                          style={{ color: "#f59e0b", fontSize: 11, marginLeft: 6, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
                                        >
                                          ⚠️ Review Submission
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td>{statusBadge(s)}</td>
                                  <td><span className="ma-cell-muted">{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}</span></td>
                                  <td>
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
                                  <td>
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
                                  <td>
                                    {s.submissionId ? (
                                      <div className="msv-actions">
                                        <button className="msv-action-btn" title="View PDF" onClick={() => openPdf(s)}><FiEye size={13} /></button>
                                        <button className="msv-action-btn" title="Download PDF" onClick={() => downloadPdf(s)}><FiDownload size={13} /></button>

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
                                        {(bulkDone || batchDone ||single?.status === "done" || db?.result) && (
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
                                                submissionId: s.submissionId,
                                              });
                                              setEditingQuestions((result.questions || []).map(q => ({ ...q })));
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
                                            ? <span style={{ fontSize: 10, color: "#f59e0b" }}>
                                                ⟳ Retry {bulk.attempt}/{bulk.maxAttempts}
                                              </span>
                                            : batchQueued
                                            ? <span style={{ fontSize: 10, color: "#818cf8" }}>⚡ Batch…</span>
                                            : <span className="pm-spinner" />
                                            : markingError
                                            ? <>❌ Retry</>
                                            : <><FiCpu size={12} /> Mark</>
                                          }
                                        </button>
                                        {/* Priority single mark */}
                                        {PRIORITY_ALLOWED_IDS.includes(currentUserId()) && (
                                          <button
                                            className="msv-action-btn msv-action-btn--ai"
                                            title="Mark on Gemini priority tier (fastest, premium)"
                                            onClick={() => openGuidanceModal(s,false, "priority")}
                                            disabled={markingLoading || priorityBulkRunning}
                                            style={{ borderColor: "rgba(251,191,36,0.4)" }}
                                          >

                                            <FiSend size={12} /> Mark (Priority)
                                            </button>
                                            )}
                                        {showAiReview && (
                                          <button
                                            className="msv-action-btn"
                                            title="AI Review"
                                            onClick={() => runAiReview(s, rowMarkingCtx)}
                                            disabled={aiReviewing || markingLoading}
                                            style={{
                                              background: aiReviewing
                                                ? "rgba(234, 179, 8, 0.1)"
                                                : "rgba(234, 179, 8, 0.2)",
                                              borderColor: "rgba(234, 179, 8, 0.55)",
                                              color: "#eab308",
                                            }}
                                          >
                                            {aiReviewing ? "Reviewing…" : "AI Review"}
                                          </button>
                                        )}

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

                                        {inlineMarkResult?.tokenUsage && (
                                          <TokenUsageStats result={inlineMarkResult} compact />
                                        )}

                                        {inlineMarkResult?.pdfCompression && (
                                          <div style={{
                                            marginTop: 4,
                                            fontSize: 11,
                                            color: "rgba(255,255,255,0.45)",
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
                                            color: "#f59e0b",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6
                                          }}>
                                            <span className="pm-spinner" />
                                            Server busy — retrying in {bulk.delaySeconds}s
                                            <span style={{ color: "rgba(255,255,255,0.4)" }}>
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
                      </div>
                    </div>
                  )}
                  {!loadingStudents && students.length > 0 && (
                    <Pagination page={studentPage} totalPages={studentTotalPages} onPageChange={fetchStudentPage} />
                  )}
                </div>
            </div>
            )}
          </div>
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
                              color: "rgba(255,255,255,0.5)",
                              marginBottom: 8
                            }}>
                              Error Details
                            </div>
      
                            <div style={{
                              background: "rgba(255,0,0,0.08)",
                              border: "1px solid rgba(255,0,0,0.2)",
                              padding: 12,
                              borderRadius: 10,
                              fontSize: 13,
                              color: "#fca5a5",
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

      {/* ── GUIDANCE MODAL ── */}
                {guidanceModal && (
                  <div className="msv-overlay" onClick={() => setGuidanceModal(null)}>
                    <div className="msv-guidance-modal" onClick={e => e.stopPropagation()}>
                      <div className="msv-guidance-header">
                        
                          <div style={{ fontSize: 15, fontWeight: 700 }}>
                            {guidanceModal.priorityBulk ? "🚀 Mark All Students (Priority)" :
                            guidanceModal.priority     ? `🚀 Mark (Priority) — ${guidanceModal.student?.name}` :
                            guidanceModal.batch        ? "⚡ Mark All Students (Batch)"  :
                            guidanceModal.bulk         ? "🤖 Mark All Students"           :
                                                          `🤖 Mark — ${guidanceModal.student?.name}`}
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                            {guidanceModal.priorityBulk
                              ? `Marks all ${students.filter(s => s.submissionId).length} students on Gemini priority tier — fastest, premium (~+${Math.round((PRIORITY_RATE_FACTOR - 1) * 100)}%)`
                              : guidanceModal.priority
                              ? `Priority tier — fastest/most reliable, premium (~+${Math.round((PRIORITY_RATE_FACTOR - 1) * 100)}%)`
                              : guidanceModal.batch
                              ? `Submits all eligible students in this assignment to Gemini batch API (~50% cheaper) — ${studentTotal} students in class`
                              : guidanceModal.bulk
                              ? `Marking ${students.filter(s => s.submissionId).length} students with AI`
                              : "AI will mark against the uploaded mark scheme"}
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
                    { value: "criteria", label: "🎯 Criteria Marking", desc: "Two-layer: corrections + criteria grade" }
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

              {/* Gemini model (bulk, batch, and single mark) */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
                  Gemini Model
                </label>
                <select
                  className="msv-gemini-select"
                  value={pickValidGeminiModel(geminiModels, geminiModel)}
                  onChange={e => setGeminiModel(e.target.value)}
                >
                  {(geminiModels.length ? geminiModels : [{ id: geminiModel, label: geminiModel }]).map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <p style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  {guidanceModal.batch
                    ? "Used for the Gemini batch job (~50% cheaper than sequential marking)."
                    : "Used when you start marking with Gemini. Flash-Lite models are cheaper and faster."}
                </p>
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
                      transition: "all 0.18s ease"
                    }}
                    onClick={e => { e.stopPropagation(); setPromptDropdownOpen(v => !v); }}
                  >
                    <span>{guidance ? (savedPrompts.find(p => p.content === guidance)?.name || "📋 Custom guidance entered") : "📋 Select a saved prompt…"}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", transform: promptDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>▼</span>
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
                        maxHeight: 220,          // 👈 important
                        overflowY: "auto",       // 👈 enables scroll
                        overflowX: "hidden",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)" 
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
                                    borderBottom: i < savedPrompts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
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
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
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
                                      color: "#ef4444",
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

              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
                {markingModeModal === "criteria"
                  ? <><span style={{ color: "#e2e8f0" }}>Criteria</span> <span style={{ color: "#ef4444" }}>*</span> — define the grading criteria and weights</>
                  : <>Additional Guidance <span style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</span></>
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
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
              />
              <button
                  className="ma-send-btn"
                  onClick={async () => {
                    if (!guidance.trim()) return toast.warn("Cannot save empty prompt");

                    const name = await promptToast("Name this prompt:", {
                      title: "Save prompt",
                      placeholder: "Prompt name",
                      confirmLabel: "Save",
                    });
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
                {!guidanceModal.batch && !guidanceModal.priority && !guidanceModal.priorityBulk && (
                  <>
                    <button
                      className="ma-send-btn"
                      onClick={() => handleGuidanceConfirm("gemini")}
                      disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                      style={{ flex: 1, justifyContent: "center", opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1 }}
                    >
                      <FiCpu size={14} />
                      {guidanceModal.bulk ? "Start Marking All with Gemini" : "Start Marking with Gemini"}
                    </button>

                    <button
                      className="ma-send-btn"
                      onClick={() => handleGuidanceConfirm("claude")}
                    >
                      <FiCpu size={14} />
                      {guidanceModal.bulk ? "Start Marking All with Claude" : "Start Marking with Claude"}
                    </button>
                  </>
                )}

                {guidanceModal.batch && (
                  <button
                    className="ma-send-btn"
                    onClick={() => handleGuidanceConfirm()}
                    disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                    style={{
                      flex: 1, justifyContent: "center",
                      opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1,
                      background: "rgba(99,102,241,0.15)",
                      borderColor: "rgba(99,102,241,0.4)"
                    }}
                  >
                    <FiLayers size={14} />
                    Submit Batch — {geminiModelLabel(geminiModels, pickValidGeminiModel(geminiModels, geminiModel))}
                  </button>
                )}

                {(guidanceModal.priority || guidanceModal.priorityBulk) && (
                  <button
                    className="ma-send-btn"
                    onClick={() => handleGuidanceConfirm("gemini")}
                    disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                    style={{
                      flex: 1, justifyContent: "center",
                      opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1,
                      background: "rgba(251,191,36,0.15)",
                      borderColor: "rgba(251,191,36,0.4)"
                    }}
                  >
                    <FiSend size={14} />
                    {guidanceModal.priorityBulk ? "Start Priority Marking (All)" : "Start Priority Marking"}
                    {" "}— {geminiModelLabel(geminiModels, pickValidGeminiModel(geminiModels, geminiModel))}
                  </button>
                )}

                {/* <button
                  className="ma-send-btn"
                  onClick={() => {
                    handleGuidanceConfirm();
                  }}
                >
                <FiCpu size={14} />
                  {guidanceModal.batch ? "Start Batch Mark" : "Start Batch Mark"}
                </button> */}
                
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
                <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  AI Marking Results — {resultModal.student.name}
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                    background: isCriteria ? "rgba(139,92,246,0.15)" : "rgba(57,156,242,0.15)",
                    color: isCriteria ? "#a78bfa" : "#399cf2",
                    border: `1px solid ${isCriteria ? "rgba(139,92,246,0.3)" : "rgba(57,156,242,0.3)"}`
                  }}>
                    {isCriteria ? "🎯 Criteria Marking" : "📋 Normal Marking"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Final Grade:</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <input
                    readOnly
                    type="number"
                    min={0}
                    max={effectiveMaxTotal}
                    value={total}
                    // onChange={e => setEditingTotal(Math.min(effectiveMaxTotal, Math.max(0, Number(e.target.value))))}
                    style={{
                      width: 56, padding: "3px 8px", borderRadius: 6,
                      border: `1px solid ${color}`,
                      background: `${color}15`,
                      color: color,
                      fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none",
                      cursor:"not-allowed"
                    }}
                  />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>/</span>
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
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none"
                    }}
                  />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                    ({pct}%)
                  </span>
                  {hasPendingEdits && (
                    <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
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
                        } else {
                          setEditingTotal(null);
                          setEditingMaxTotal(null);
                        }
                      }}
                      style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div style={{ flex: "1 1 180px", minWidth: 140, maxWidth: 280 }}>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
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
                      ? "rgba(99,102,241,0.28)"
                      : "rgba(99,102,241,0.12)",
                    borderColor: "rgba(99,102,241,0.45)",
                    color: "#c7d2fe",
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
                    style={{ background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)" }}
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

            {/* <div className="msv-modal-body"> */}
            <div 
                        className="msv-modal-body"
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
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.35)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#fbbf24",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  ⚠️ <span>{typeof resultModal.result.fileWarning === "string" ? resultModal.result.fileWarning : resultModal.result.fileWarning.message || "Submitted file may be wrong — page count differs from expected"}</span>
                </div>
              )}
              <PdfCompressionStats pdfCompression={resultModal.result.pdfCompression} />

              {/* ── TOKEN USAGE ── */}
              {/* {resultModal.result.tokenUsage && (
                <div style={{ display: "flex", gap: 16, marginBottom: 18, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginRight: 4, alignSelf: "center" }}>🔢 Tokens:</div>
                  {[
                    { label: "Input",  value: resultModal.result.tokenUsage.inputTokens  },
                    { label: "Output", value: resultModal.result.tokenUsage.outputTokens },
                    { label: "Total",  value: resultModal.result.tokenUsage.totalTokens  },
                  ].map(t => (
                    <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{t.value?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )} */}

                {/* AI TOKEN USAGE*/}
              <TokenUsageStats result={resultModal.result} />

              {/* ── CRITERIA MODE: show criteria grade first ── */}
              {isCriteria && resultModal.result.criteriaGrade && (
                <div style={{ marginBottom: 20 }}>
                  {/* Final grade card */}
                  <div style={{ padding: "16px 20px", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(139,92,246,0.8)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>🎯 Criteria Grade (Final)</div>
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
                            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>/ {max}</div>
                            <div style={{ flex: 1, minWidth: 100 }}>
                              <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
                              </div>
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{pct}%</div>
                            </div>
                          </div>
                          {/* Criteria breakdown table */}
                          {cg.breakdown?.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {cg.breakdown.map((row, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, flexWrap: "wrap" }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, minWidth: 160 }}>{row.criterion}</div>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: getScoreColor(row.marksAwarded, row.maxMarks), minWidth: 60 }}>
                                    {row.marksAwarded} / {row.maxMarks}
                                  </div>
                                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", flex: 1 }}>{row.reason}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {cg.summary && (
                            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 12, lineHeight: 1.6 }}>{cg.summary}</p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Divider */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>📝 Question Corrections (Feedback Only)</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                  </div>
                </div>
              )}

              {/* ── NORMAL MODE: summary only (grade + bar live in header) ── */}
              {!isCriteria && (
                <>
                  <div className="msv-summary-box">
                    <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Overall Summary</div>
                    <textarea
                      value={editingSummary}
                      onChange={(e) => {
                        setSummaryTouched(true);
                        setEditingSummary(e.target.value);
                      }}
                      rows={5}
                      placeholder="Summary updates automatically when you edit marks or question feedback. Confirm edits to refresh the PDF."
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                    />
                  </div>
                </>
              )}

              {/* ── QUESTIONS (both modes) ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {editingQuestions.map((q, idx) => {
                  const awarded = Number(q.marksAwarded) || 0;
                  const qMax = Number(q.maxMarks) || 0;
                  const color = getScoreColor(awarded, qMax);
                  const qPct = qMax > 0 ? Math.round((awarded / qMax) * 100) : 0;
                  return (
                    <div key={idx} className="msv-q-card">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>Q{q.questionNumber}</span>
                        {/* In criteria mode, scores are read-only feedback */}
                        {isCriteria ? (
                          <span style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${color}`, background: `${color}15`, color, fontWeight: 700, fontSize: 13 }}>
                            {q.marksAwarded} / {q.maxMarks}
                          </span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number" min={0} max={q.maxMarks}
                              value={awarded}
                              onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, marksAwarded: Math.min(qMax, Math.max(0, Number(e.target.value) || 0)) } : x))}
                              style={{ width: 52, padding: "4px 8px", borderRadius: 6, border: `1px solid ${color}`, background: `${color}15`, color, fontWeight: 700, fontSize: 14, textAlign: "center", outline: "none" }}
                            />
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>/ {q.maxMarks}</span>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 60, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                          <div style={{ width: `${qPct}%`, height: "100%", background: color, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{qPct}%</span>
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
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>Student: </span>{q.studentAnswer}
                        </div>
                      )}
                      {q.studentAnswer === "Not attempted" && (
                        <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 6 }}>📭 Not attempted</div>
                      )}

                      {/* Correct answer — criteria mode or MCQ */}
                      {q.correctAnswer && (isCriteria || Number(q.maxMarks) === 1) && (
                        <div style={{ fontSize: 12, color: "rgba(34,197,94,0.8)", marginBottom: 6, padding: "6px 10px", background: "rgba(34,197,94,0.07)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.15)" }}>
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

                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {isCriteria ? "Comment" : "Examiner Note"}
                      </div>
                      {isCriteria ? (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>{q.reason}</p>
                      ) : (
                        <textarea
                          value={q.reason}
                          onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, reason: e.target.value } : x))}
                          rows={3}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.75)", fontSize: 12, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
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
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: 12
                    }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 10,
                        color: "rgba(255,255,255,0.6)",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}>
                        <span>📄 Annotated PDF Preview</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {hasPendingEdits && (
                            <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600, textTransform: "none" }}>
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
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                          Generating preview…
                        </div>
                      ) : previewError ? (
                        <div style={{ color: "#f87171", fontSize: 13 }}>
                          {previewError}
                        </div>
                      ) : annotatedPreviewUrl ? (

                        <div
                          style={{
                            flex: 1,
                            minHeight: 0
                          }}
                        >
                          <iframe
                            key={resultModal.student?.submissionId || resultModal.submissionId}
                            src={annotatedPreviewUrl}
                            title="Annotated PDF"
                            style={{
                              width: "100%",
                              height: "100%",
                              border: "none",
                              borderRadius: 8
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                          No preview available
                        </div>
                      )}
                    </div> 
                </div>
          </div>
        </div>
      )}

      {/* ── AI REVIEW COMPARISON MODAL ── */}
      {aiReviewModal && (
        <div className="msv-overlay" style={{ zIndex: 1100 }}>
          <div
            className="msv-results-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "96vw",
              maxWidth: "96vw",
              height: "92vh",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="msv-modal-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  AI Review — {aiReviewModal.student.name}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                  {aiReviewModal.flagged.length} question{aiReviewModal.flagged.length !== 1 ? "s" : ""} with grade discrepancies
                </div>
              </div>
            </div>

            <div
              className="msv-modal-body"
              style={{
                display: "flex",
                gap: 20,
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  flex: "0 0 50%",
                  overflowY: "auto",
                  height: "100%",
                  paddingRight: 8,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {aiReviewModal.flagged.map((item) => {
                    const color = getScoreColor(item.resolvedMarks, item.maxMarks);
                    return (
                      <div key={item.questionNumber} className="msv-q-card">
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>Q{item.questionNumber}</span>
                          {item.resolution == null && (
                            <span style={{ fontSize: 11, color: "#f59e0b" }}>Unresolved</span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                              {providerDisplayLabel(aiReviewModal.provider)}
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>
                              {item.existingMarks ?? "—"}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                              AI Review
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#eab308" }}>
                              {item.qwenMarks ?? "—"}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                              Resolved
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 15, color }}>
                              {item.resolvedMarks}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          <button
                            className="ma-send-btn"
                            style={{
                              fontSize: 12,
                              padding: "6px 12px",
                              opacity: item.resolution === "keep" ? 1 : 0.65,
                              borderColor: item.resolution === "keep" ? "#399cf2" : undefined,
                            }}
                            onClick={() =>
                              resolveFlaggedQuestion(
                                item.questionNumber,
                                "keep",
                                item.existingMarks ?? 0
                              )
                            }
                          >
                            Keep original
                          </button>
                          <button
                            className="ma-send-btn"
                            style={{
                              fontSize: 12,
                              padding: "6px 12px",
                              background: "rgba(234, 179, 8, 0.15)",
                              borderColor: "rgba(234, 179, 8, 0.4)",
                              color: "#eab308",
                              opacity: item.resolution === "qwen" ? 1 : 0.65,
                            }}
                            onClick={() =>
                              resolveFlaggedQuestion(
                                item.questionNumber,
                                "qwen",
                                item.qwenMarks ?? 0
                              )
                            }
                          >
                            Use AI Review
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            type="number"
                            min={0}
                            max={item.maxMarks || undefined}
                            value={item.manualInput}
                            onChange={(e) =>
                              setAiReviewModal((prev) => ({
                                ...prev,
                                flagged: prev.flagged.map((f) =>
                                  f.questionNumber === item.questionNumber
                                    ? { ...f, manualInput: e.target.value }
                                    : f
                                ),
                              }))
                            }
                            placeholder="Custom grade"
                            style={{
                              width: 90,
                              padding: "6px 8px",
                              borderRadius: 6,
                              border: `1px solid ${color}`,
                              background: `${color}15`,
                              color,
                              fontWeight: 700,
                              fontSize: 13,
                              textAlign: "center",
                              outline: "none",
                            }}
                          />
                          <button
                            className="ma-send-btn"
                            style={{
                              fontSize: 12,
                              padding: "6px 12px",
                              opacity: item.resolution === "manual" ? 1 : 0.65,
                            }}
                            onClick={() => {
                              const val = Number(item.manualInput);
                              if (Number.isNaN(val)) {
                                toast.warn("Enter a valid grade");
                                return;
                              }
                              const clamped = Math.min(
                                item.maxMarks || val,
                                Math.max(0, val)
                              );
                              resolveFlaggedQuestion(item.questionNumber, "manual", clamped);
                            }}
                          >
                            Set grade
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  flex: "0 0 50%",
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
                  }}
                >
                  Student Submission PDF
                </div>
                {aiReviewPdfUrl ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <iframe
                      src={aiReviewPdfUrl}
                      title="Student submission PDF"
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        borderRadius: 8,
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                    Loading PDF…
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="ma-send-btn"
                onClick={saveAiReviewResolutions}
                disabled={aiReviewSaving}
              >
                {aiReviewSaving ? "Saving…" : "Save & Close"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};