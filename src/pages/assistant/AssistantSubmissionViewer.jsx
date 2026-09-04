import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { promptToast, confirmToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import { downloadBlob } from "../../utils/downloadBlob";

import { usePagination } from "../../hooks/usePagination";
import { useAnnotatedResultPreview } from "../../hooks/useAnnotatedResultPreview";
import useMarkingEditHistory from "../../hooks/useMarkingEditHistory";
import { usePageCountCheck, buildPageCountFlagMap, pageCountWarningText, applyPageCountDecision } from "../../hooks/usePageCountCheck";
import {
  useOrientationCheck,
  buildOrientationFlagMap,
  orientationWarningText,
  applyOrientationDecision,
} from "../../hooks/useOrientationCheck";
import Pagination from "../../components/Pagination";
import PageCountCheckModal from "../../components/PageCountCheckModal";
import OrientationCheckModal from "../../components/OrientationCheckModal";
import ExamBoardGuidanceFields from "../../components/ExamBoardGuidanceFields";
import { useExamBoardGuidance } from "../../hooks/useExamBoardGuidance";

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
  FiRotateCcw,
  FiRotateCw,
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
import { enrichMarkingQuestions } from "../../utils/blankQuestionFeedback";
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
  buildV2MarkingResult,
  currentUserId,
  getApiErrorMessage,
  formatGoogleOAuthError,
  getMarkingResultSummary,
  guidanceForForm,
  resolveMarkingGuidanceText,
  hasTeacherEdits,
  isStudentSubmitted,
  normalizeGuidance,
  getResultMaxTotal,
  resolveDisplayMaxTotal,
  sumQuestionMarks,
  resolveEditorObtainedMarks,
  initialEditingTotalFromResult,
  filterQuestionsPendingRemoval,
  buildPlacementQuestions,
  applyPlacementChange,
  applyQuestionLabelChange,
  questionsForConfirmEdits,
  gradeScorePercent,
  resolveTotalMarksFromResult,
  resolveAnnotatePdfTotalMarks,
  resolveSavedMarkingGrade,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  isSameSubmissionModal,
} from "../../utils/markingFormData";
import { prepareEditingQuestions } from "../../utils/recoverMisassignedAnswers";
import TeacherAnnotationsEditor from "../../components/TeacherAnnotationsEditor";
import MarkingQuestionCard from "../../components/MarkingQuestionCard";
import MarkingQuestionSearchBar, {
  filterMarkingQuestions,
} from "../../components/MarkingQuestionSearchBar";
import ClassroomPaperMetadataBar from "../../components/ClassroomPaperMetadataBar";
import OutOfScopeNotesPanel from "../../components/OutOfScopeNotesPanel";
import CriteriaGradeEditor from "../../components/CriteriaGradeEditor";
import {
  cloneCriteriaGrade,
  applyQuestionRowEdit,
} from "../../utils/markingQuestionEdits";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import MarkingCorrectionChat from "../../components/MarkingCorrectionChat";
import BulkQuestionEditChat from "../../components/BulkQuestionEditChat";
import AddMarkingQuestionBar, {
  MarkingCompletenessNotice,
} from "../../components/AddMarkingQuestionBar";
import MarkingPageShiftNotice from "../../components/MarkingPageShiftNotice";
import AnnotatedPdfPreview from "../../components/AnnotatedPdfPreview";
import { getMarkingIntegrityPublishGate } from "../../utils/markingIntegrityPublish";
import {
  orderQuestionsByInventory,
  annotateQuestionScopeFlags,
} from "../../utils/questionDisplayOrder";
import { isBackfilledStub } from "../../utils/backfilledStub";
import {
  geminiModelLabel,
  getDefaultMarkingModels,
  parseGeminiModelsResponse,
  pickValidGeminiModel,
  sahahlyModelLabel,
} from "../../utils/markingCost";
import {
  chunkSizeForGeminiModel,
  formatChunkSizeLabel,
} from "../../utils/markingChunkSize";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
import {
  buildFreshReturnAllQueue,
  runReturnAllQueue,
  saveReturnSummaries,
  formatReturnFailuresMessage,
  studentGoogleUserId,
  isNoAttachmentError,
} from "../../utils/returnAllExecution";
import {
  fetchSavedResultsLight,
  fetchSavedResultDetail,
  savedRowHasMarkingResult,
} from "../../utils/savedResultsApi";
import { sortQuestionsByPlacement } from "../../utils/normalizeQuestionPlacement";
import { confirmReturnAll, confirmReturnSingle } from "../../utils/returnConfirmation";
import {
  useMarkingStudentSelection,
  loadEligibleStudentsForMarking,
  markingActionLabel,
} from "../../utils/markingStudentSelection";
import { confirmBatchMarkScheme } from "../../utils/confirmBatchMarkScheme";
import { sortStudentsBySubmittedAt } from "../../utils/sortStudentsBySubmittedAt";
import MarkingSelectionBar from "../../components/MarkingSelectionBar";
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
  getBatchJob,
} from "../../utils/assignmentBatchJobStore";
import { engineBasePath, isV2, canUseGradingV2 } from "../../utils/markingEngines";
import { invalidateStudentPdf } from "../../utils/studentPdfCache";
import { buildEditorPreviewBaseline } from "../../utils/buildEditorPreviewBaseline";

export default function AssignmentSubmissionViewer() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const assignmentPrompt = useAssignmentMarkingPrompt(assignmentId);

  // gradingv2 is allow-listed until it has been validated against real papers.
  const canMarkV2 = canUseGradingV2(currentUserId());

  const leaveViewer = () => {
    navigate("/assistant/assignments");
  };

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
  const [savedResults, setSavedResults] = useState({});
  const correctedPdfCount = useMemo(
    () => Object.values(savedResults).filter((entry) => entry?.result).length,
    [savedResults]
  );

  useEffect(() => {
    if (!assignmentId) {
      setBatchJob(null);
      return undefined;
    }
    return subscribeBatchJob(assignmentId, setBatchJob);
  }, [assignmentId]);

  const batchStarting =
    batchJob?.phase === "uploading" || batchJob?.phase === "submitting";

  const hasGradedWork = useMemo(() => {
    const fromSaved = Object.values(savedResults).some((s) => s?.result);
    const fromBulk = Object.values(bulkProgress).some(
      (b) => b?.status === "done" && b?.result
    );
    const fromBatch = Object.values(batchJob?.results || {}).some(
      (b) => b?.status === "done" && b?.result
    );
    return fromSaved || fromBulk || fromBatch;
  }, [savedResults, bulkProgress, batchJob]);
 
  const [guidanceModal,      setGuidanceModal]      = useState(null);
  const [guidance,           setGuidance]           = useState("");
  const [savedPrompts,       setSavedPrompts]       = useState([]);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);

  const [singleProgress, setSingleProgress] = useState({});
  const [resultModal, setResultModal] = useState(null);
  // Read-only mark scheme preview (right column of the results modal)
  const msPreviewRef = useRef({ assignmentId: null, url: null });
  const [markSchemePreviewUrl, setMarkSchemePreviewUrl] = useState(null);
  const [markSchemeLoading, setMarkSchemeLoading] = useState(false);
  const [markSchemeError, setMarkSchemeError] = useState(null);

  // Load the assignment's mark scheme as a blob object URL when the results modal opens.
  // Cached per assignment (mark scheme is per-assignment, not per-submission).
  const resultModalOpen = Boolean(resultModal);
  useEffect(() => {
    if (!resultModalOpen) return;
    if (!assignmentId || !msInfo?.fileId) {
      setMarkSchemePreviewUrl(null);
      setMarkSchemeError(null);
      return;
    }
    if (msPreviewRef.current.assignmentId === assignmentId && msPreviewRef.current.url) {
      setMarkSchemePreviewUrl(msPreviewRef.current.url);
      return;
    }
    // AbortController (not just an ignore-flag) so a re-render mid-fetch cancels the
    // in-flight 6MB request instead of leaving it running alongside a fresh duplicate.
    // Two concurrent blob GETs for the same large file was producing net::ERR_FAILED.
    const controller = new AbortController();
    setMarkSchemeLoading(true);
    setMarkSchemeError(null);
    api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
      responseType: "blob",
      signal: controller.signal,
    })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        if (msPreviewRef.current.url && msPreviewRef.current.assignmentId !== assignmentId) {
          URL.revokeObjectURL(msPreviewRef.current.url);
        }
        msPreviewRef.current = { assignmentId, url };
        setMarkSchemePreviewUrl(url);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[markscheme preview]", err);
        setMarkSchemeError("Failed to load mark scheme");
        setMarkSchemePreviewUrl(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarkSchemeLoading(false);
      });
    return () => controller.abort();
  }, [resultModalOpen, assignmentId, msInfo?.fileId]);

  // Revoke the cached mark scheme object URL on unmount.
  useEffect(() => () => {
    if (msPreviewRef.current.url) URL.revokeObjectURL(msPreviewRef.current.url);
  }, []);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [questionSearch, setQuestionSearch] = useState("");
  const [editingCriteriaGrade, setEditingCriteriaGrade] = useState(null);
  const [editingAnnotations, setEditingAnnotations] = useState([]);
  const [editingSummary, setEditingSummary] = useState("");
  const [summaryTouched, setSummaryTouched] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [returning,        setReturning]        = useState(false);
  const [editingTotal, setEditingTotal] = useState(null); // null means use effectiveTotal
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);
  const [pendingRemovedIndices, setPendingRemovedIndices] = useState(() => new Set());
  const [editorSubmissionId, setEditorSubmissionId] = useState(null);
  const [editingOutOfScopeNotes, setEditingOutOfScopeNotes] = useState(() =>
    resultModal?.result ? getOutOfScopeNotes(resultModal.result) : []
  );

  const editHistory = useMarkingEditHistory({
    questions: editingQuestions,
    summary: editingSummary,
    pendingRemovedIndices,
    editingTotal,
    setQuestions: setEditingQuestions,
    setSummary: setEditingSummary,
    setPendingRemovedIndices,
    setEditingTotal,
    resetKey: resultModal
      ? resultModal.submissionId || resultModal.student?.submissionId || "open"
      : null,
  });

  const [studentErrors, setStudentErrors] = useState({});

  const [markingProvider, setMarkingProvider] = useState("gemini");
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
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
  // The assignment's board / paper code / paper, for ClassroomPaperMetadataBar.
  // Held separately because this page never keeps the whole assignment document.
  const [paperMeta, setPaperMeta] = useState(null);
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

  const {
    data: studentsPage,
    page,
    totalPages,
    total: studentTotal,
    loading,
    fetchPage,
    extra,
    setData: setStudents,
    error: studentFetchError,
  } = usePagination(
    `/assignment-submissions/${assignmentId}/students`,
    studentParams,
    10,
    "students",
    !!assignmentId
  );

  const students = useMemo(
    () => sortStudentsBySubmittedAt(studentsPage),
    [studentsPage]
  );

  const { dueDateTime, maxGrade, assignmentTitle, classroomId, summaryMap = {}, googleUnavailable, pdfCount } = extra;
  // Canonical question order + scope evidence (see utils/questionDisplayOrder.js).
  const assignmentInventory = extra.assignmentInventory || null;
  const assignmentPrunedQuestions = extra.assignmentInventoryPrunedQuestions || null;
  const examBoardGuidance = useExamBoardGuidance({
    classroomId: classroomId ?? null,
    assignmentId: assignmentId ?? null,
  });
  const actualPdfCount = pdfCount ?? 0;

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

  // Advisory pre-grading orientation check (shared hook + modal)
  const { orientationCheckModal, confirmOrientations, resolveOrientationCheck } = useOrientationCheck();
  const [orientationFlags, setOrientationFlags] = useState({});
  const applyOrientationReport = (report) =>
    setOrientationFlags((prev) => ({ ...prev, ...buildOrientationFlagMap(report) }));
  const orientationCheckArgs = (students) => ({ assignmentId, classroomId, students, onReport: applyOrientationReport });

  // Runs both advisory checks and returns WHICH submissions to grade, or null
  // to stop. Page-count and orientation each have three outcomes — cancel,
  // grade all anyway, or grade without the flagged papers.
  const confirmPreGradingChecks = async (students) => {
    const pageDecision = await confirmPageCounts(pageCheckArgs(students));
    const afterPage = applyPageCountDecision(students, pageDecision);
    if (!afterPage) return null;

    const pageDropped = students.length - afterPage.length;
    if (pageDropped > 0) {
      toast.info(
        `Skipping ${pageDropped} submission${pageDropped === 1 ? "" : "s"} with unexpected page count`
      );
    }

    const decision = await confirmOrientations(orientationCheckArgs(afterPage));
    const toGrade = applyOrientationDecision(afterPage, decision);
    if (!toGrade) return null;

    const dropped = afterPage.length - toGrade.length;
    if (dropped > 0) {
      toast.info(`Skipping ${dropped} submission${dropped === 1 ? "" : "s"} with mixed page orientation`);
    }
    return toGrade;
  };

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

  const resultModalSubmissionId =
    resultModal?.submissionId || resultModal?.student?.submissionId || null;

  const effectiveMaxTotal = resolveDisplayMaxTotal({
    assignmentMaxPoints,
    result: resultModal?.result,
    editingMaxTotal,
  });

  const getEditorBaseline = useCallback(() => {
    if (!resultModal || editorSubmissionId !== resultModalSubmissionId) return null;
    return buildEditorPreviewBaseline({
      submissionId: resultModalSubmissionId,
      editingQuestions,
      pendingRemovedIndices,
      editingSummary,
      effectiveMaxTotal,
      editingTotal,
      editingCriteriaGrade,
      editingAnnotations,
      editingOutOfScopeNotes,
      resultModal,
    });
  }, [
    resultModal,
    editorSubmissionId,
    resultModalSubmissionId,
    editingQuestions,
    pendingRemovedIndices,
    editingSummary,
    effectiveMaxTotal,
    editingTotal,
    editingCriteriaGrade,
    editingAnnotations,
    editingOutOfScopeNotes,
  ]);

  const {
    annotatedPreviewUrl,
    previewLoading,
    previewError,
    confirmingEdits,
    hasPendingEdits,
    confirmedSnapshot,
    confirmEdits,
    resetToConfirmed,
    revertPreviewToConfirmed,
    retryPreview,
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
    editingTotal,
    summaryTouched,
    resolvePdfSummary,
    pendingRemovedIndices,
    editingCriteriaGrade,
    outOfScopeNotesOverride: editingOutOfScopeNotes,
    editorReadySubmissionId:
      editorSubmissionId === resultModalSubmissionId
        ? resultModalSubmissionId
        : null,
    getEditorBaseline,
  });

  const handleAnnotationPlacementChange = useCallback((change) => {
    setEditingQuestions((prev) => applyPlacementChange(prev, change));
  }, []);

  const handleQuestionLabelChange = useCallback((change) => {
    setEditingQuestions((prev) => applyQuestionLabelChange(prev, change));
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

  const handleOutOfScopeNoteRemove = useCallback((noteIndex) => {
    setEditingOutOfScopeNotes((prev) => prev.filter((_, i) => i !== noteIndex));
    toast.info("Out-of-scope note will be removed when you confirm edits");
  }, []);

  const openSubmissionIdRef = useRef(resultModalSubmissionId);
  openSubmissionIdRef.current = resultModalSubmissionId;

  useEffect(() => {
    setPendingRemovedIndices(new Set());
    setEditingOutOfScopeNotes(resultModal?.result ? getOutOfScopeNotes(resultModal.result) : []);
  }, [resultModalSubmissionId]);

  const questionsForDisplay = useMemo(() => {
    const withIdx = editingQuestions.map((q, i) => ({ ...q, _placementIndex: i }));
    const filtered = withIdx.filter((q) => !pendingRemovedIndices.has(q._placementIndex));
    // Order by the assignment's canonical question list: question-paper order
    // when a question paper was uploaded, mark-scheme order otherwise. Physical
    // placement is only the fallback (no inventory, and for off-list rows).
    const ordered = orderQuestionsByInventory(filtered, assignmentInventory, {
      fallbackSort: sortQuestionsByPlacement,
    });
    return annotateQuestionScopeFlags(ordered, {
      assignmentInventory,
      prunedQuestions: assignmentPrunedQuestions,
      isBackfilledStub,
    });
  }, [editingQuestions, pendingRemovedIndices, assignmentInventory, assignmentPrunedQuestions]);

  const questionsForSearch = useMemo(
    () => filterMarkingQuestions(questionsForDisplay, questionSearch),
    [questionsForDisplay, questionSearch]
  );

  const placementQuestions = useMemo(
    () => buildPlacementQuestions(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

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

  // Mark scheme + assignment meta for this assignment
  useEffect(() => {
    if (!assignmentId) return;
    api
      .get(`/manager-assignments/${assignmentId}/markscheme`)
      .then((res) => setMsInfo(res.data?.fileId ? res.data : null))
      .catch(() => setMsInfo(null));
    api
      .get(`/manager-assignments/${assignmentId}/full`, { params: { page: 1, limit: 1 } })
      .then((res) => {
        setSubjectId(res.data.assignment.subjectId || null);
        setPaperMeta(res.data.assignment);
        setExpectedPages(res.data.assignment.expectedPages ?? null);
        setExpectedPagesInput(
          res.data.assignment.expectedPages != null
            ? String(res.data.assignment.expectedPages)
            : ""
        );
      })
      .catch(() => {});
  }, [assignmentId]);

  const fetchSavedResults = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const map = await fetchSavedResultsLight(api, assignmentId);
      const synced = {};
      Object.entries(map).forEach(([submissionId, row]) => {
        if (row.classroomAssignedGrade != null) {
          synced[submissionId] = row.classroomAssignedGrade;
        }
      });
      setSavedResults(map);
      setClassroomSyncedGrades(synced);
      setSingleProgress((prev) => ({ ...prev, ...map }));
    } catch (err) {
      console.error("Failed to load saved results", err);
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchSavedResults();
  }, [fetchSavedResults]);

  /**
   * Update one paper's row after a save.
   *
   * The alternative - refetching `/save-results/:assignmentId` - pulls a full
   * marking blob for every marked student in the class (several MB on a real
   * assignment) to change the one row that just moved. `saved` is the row the
   * API echoed back; `canonical` is the marking blob it stored.
   */
  const patchSavedResult = useCallback((submissionId, canonical, saved) => {
    if (!submissionId) return;
    const patch = (prev) => {
      const before = prev[submissionId] || {};
      const row = {
        ...before,
        status: "done",
        result: canonical,
        summary: canonical?.summary || before.summary || "",
        totalMarks: resolveTotalMarksFromResult(canonical),
      };
      if (saved) {
        row.classroomAssignedGrade =
          saved.classroomAssignedGrade ?? before.classroomAssignedGrade ?? null;
        row.returnedAt = saved.returnedAt ?? before.returnedAt ?? null;
        row.updatedAt = saved.updatedAt ?? before.updatedAt ?? null;
        row.teacherEditedAt = saved.teacherEditedAt ?? before.teacherEditedAt ?? null;
        if (saved.provider) row.provider = saved.provider;
        if (saved.mode) row.mode = saved.mode;
      }
      return { ...prev, [submissionId]: row };
    };
    setSavedResults(patch);
    setSingleProgress(patch);
  }, []);

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
      savedMap = await fetchSavedResultsLight(api, assignmentId);
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
        await api.delete(`${engineBasePath(batchJob?.engine)}/mark-batch/cancel/${jobId}`);
        toast.info("Batch marking cancelled");
      } catch (err) {
        toast.warning(extractHumanError(err) || "Batch stop requested — server cancel failed");
      }
    }
  };




  const openGuidanceModal = (student = null, isBatch = false, intent = null) => {
    if (expectedPages === null) {
      toast.warn("Please set the expected page count for this assignment before marking");
      setShowExpectedPagesEdit(true);
      return;
    }
    const preferV2ForClassified =
      canMarkV2 && /classified|compiled|workbook/i.test(selectedAssignment?.title || "");
    setGuidanceModal(
      intent === "v2"
        ? { v2: true, student }
        : intent === "batchV2"
        ? { batch: true, engine: "v2" }
        : intent === "normalBulk"
        ? { bulk: true, normalBulk: true }
        : isBatch
        ? { batch: true, ...(preferV2ForClassified ? { engine: "v2" } : {}) }
        : student
        ? { student }
        : { bulk: true }
    );

    setGuidance(resolveMarkingGuidanceText("", assignmentPrompt.content));
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
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
    // Advisory page-count / orientation check before spending AI tokens on a possibly-wrong file.
    if (!(await confirmPreGradingChecks([student]))) return;

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
      examBoardGuidance.appendExamBoardFields(fd);
      appendMarkingContext(fd, { assignmentId, classroomId });

      if (markingProvider !== "claude") {
        fd.append("geminiModel", geminiModel);
      }
      fd.append("chunkSize", String(chunkSizeForGeminiModel(geminiModel)));
      fd.append("markSchemePdf", msFile);

      const endpoint =
      markingProvider === "claude"
        ? "/markingClaude/mark-claude"
        : "/marking/mark";

      const res = await api.post(endpoint, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      openResultsModal({ student, result: res.data, studentFile });
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

    } catch (err) {
      if (err.response?.data?.reason === "first_batch_pending") {
        // The AI grading itself succeeded — only saving it was blocked
        // because this assignment's first batch is awaiting confirmation.
        setSingleProgress(prev => ({ ...prev, [student.submissionId]: { status: "error" } }));
        toast.info(
          "This assignment's first batch is awaiting confirmation — see the banner above to confirm before marking more."
        );
        return;
      }
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

  // ── Single-student marking on gradingv2 ────────────────────────────────────
  // Uses the live v2 endpoint rather than a one-student batch job, so a re-mark
  // comes back immediately. The server fetches its own copies from Drive; the
  // student PDF is pulled here only so the result modal can render annotations.
  const runMarkStudentV2 = async (student, guidanceText, mode = "normal") => {
    if (!canMarkV2) {
      toast.error("You are not allowed to use v2 marking.");
      return;
    }
    if (!(await confirmPreGradingChecks([student]))) return;

    setMarkingStudentId(student.submissionId);
    setSingleProgress((prev) => ({
      ...prev,
      [student.submissionId]: { status: "marking" },
    }));

    try {
      const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
      if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

      const studentPdfRes = await api.get("/submission-files/pdf", {
        params: { assignmentId, submissionId: student.submissionId },
        responseType: "blob",
      });
      await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
      const studentFile = new File(
        [studentPdfRes.data],
        `${student.name || "student"}.pdf`,
        { type: "application/pdf" }
      );

      const { data } = await api.post(
        "/gradingv2/mark-live",
        {
          assignmentId,
          submissionId: student.submissionId,
          markingMode: mode,
          guidance: guidanceForForm(guidanceText),
          ...examBoardGuidance.getExamBoardFields(),
          geminiModel: selectedModel,
          subjectId,
          ...(maxGrade && { totalGrade: maxGrade }),
          classroomId,
          chunkSize: chunkSizeForGeminiModel(selectedModel),
        },
        { timeout: 600_000 }
      );

      const enrichedResult = buildV2MarkingResult(
        data.result,
        data.tokenUsage,
        data.geminiModel || selectedModel,
        { batch: false, diagnostics: data.diagnostics }
      );

      openResultsModal({ student, result: enrichedResult, studentFile });
      setSingleProgress((prev) => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: enrichedResult,
          studentFile,
          submissionId: student.submissionId,
        },
      }));

      await api.post("/submission-files/save-results", {
        assignmentId,
        submissionId: student.submissionId,
        studentId: student.studentId,
        studentName: student.name,
        mode,
        provider: "gemini-v2",
        result: enrichedResult,
      });

      setSavedResults((prev) => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: enrichedResult,
          aiOriginalResult: JSON.parse(JSON.stringify(enrichedResult)),
          totalMarks: resolveTotalMarksFromResult(enrichedResult),
        },
      }));
      setStudents((prev) =>
        prev.map((s) =>
          s.submissionId === student.submissionId
            ? { ...s, assignedGrade: resolveTotalMarksFromResult(enrichedResult) }
            : s
        )
      );

      const diag = data.diagnostics || {};
      // Windows that no neighbour covered mean the paper is genuinely incomplete,
      // which matters more than the token count — say so instead of a success toast.
      if (diag.windowsEmptyAfterRetry > 0) {
        toast.warning(
          `v2 marked with gaps — ${diag.windowsEmptyAfterRetry} window(s) returned nothing` +
            (diag.uncoveredPages?.length ? ` (pages ${diag.uncoveredPages.join(", ")})` : "")
        );
      } else {
        toast.success(`v2 mark complete — ${diag.windowCount ?? "?"} windows`);
      }
      if (diag.fullMsFallbacks > 0) {
        toast.info(
          `${diag.fullMsFallbacks} window(s) fell back to the full mark scheme — pairing missed those pages.`
        );
      }

    } catch (err) {
      const message = extractHumanError
        ? extractHumanError(err)
        : await getApiErrorMessage(err);
      recordStudentMarkingError(student.submissionId, message, err.response?.data);
      setSingleProgress((prev) => ({
        ...prev,
        [student.submissionId]: { status: "error" },
      }));
      openErrorViewer(`v2 Marking Failed - ${student.name}`, message);
      toast.error(message);
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runBulkMark = async (guidanceText, mode = "normal", provider = markingProvider) => {
    try {
    const loaded = await resolveEligibleForMarking(false);
    if (!loaded) return;

    // Advisory page-count / orientation check before spending AI tokens on
    // possibly-wrong files. The orientation review can drop the flagged papers,
    // so the list it hands back — not `loaded.eligible` — is what gets marked.
    const eligible = await confirmPreGradingChecks(loaded.eligible);
    if (!eligible) return;

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
          setBulkProgress(p => {
            const next = { ...p };
            delete next[student.submissionId];
            return next;
          });
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
      examBoardGuidance.appendExamBoardFields(fd);
      if (maxGrade) fd.append("totalGrade", maxGrade);

      appendMarkingContext(fd, {
        assignmentId,
        classroomId
      });
      if (provider !== "claude") {
        fd.append("geminiModel", geminiModel);
      }
      fd.append("chunkSize", String(chunkSizeForGeminiModel(geminiModel)));
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

        try {
          await api.post("/submission-files/save-results", {
            assignmentId,
            submissionId: student.submissionId,
            studentId: student.studentId,
            studentName: student.name,
            mode,
            provider,
            result: resultData,
          });
        } catch (saveErr) {
          if (saveErr.response?.data?.reason === "first_batch_pending") {
            errorCount++;
            setBulkProgress(p => ({ ...p, [student.submissionId]: { status: "error" } }));
            toast.info(
              "This assignment's first batch is awaiting confirmation — see the banner above to confirm before marking more."
            );
            break;
          }
          throw saveErr;
        }
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
    fetchPage(page);
  } catch (err) {
    setBulkMarking(false);
    toast.error(await getApiErrorMessage(err));
  }
  };

  const checkForActiveJob = async () => {
    if (!assignmentId) return;

    // A job could belong to either engine, and they use separate collections,
    // so ask both. v1 is checked first because it is still the default.
    const engines = canMarkV2 ? ["v1", "v2"] : ["v1"];

    for (const engine of engines) {
      let data;
      try {
        ({ data } = await api.get(`${engineBasePath(engine)}/mark-batch/active/${assignmentId}`));
      } catch (err) {
        console.error(`checkForActiveJob (${engine}):`, err.message);
        continue;
      }
      if (!data?.active) continue;

      // v1 returns the job under `active`; v2 returns it flat.
      const job = typeof data.active === "object" ? data.active : data;
      const { jobId, studentOrder, submittedAt, geminiModel: jobModel } = job;
      const restoredModel = pickValidGeminiModel(geminiModels, jobModel || geminiModel);
      const restoredMode = job.markingMode || job.mode || "normal";

      setBatchStopped(assignmentId, false);
      patchBatchJob(assignmentId, {
        phase: "processing",
        jobId,
        total: studentOrder?.length || job.count || 0,
        submittedAt,
        skipped: {},
        results: {},
        mode: restoredMode,
        engine,
        geminiModel: restoredModel,
        batchStudents: studentOrder || [],
      });
      pollBatchJob(jobId, {
        assignmentId,
        mode: restoredMode,
        engine,
        geminiModel: restoredModel,
        batchStudents: studentOrder || [],
      });
      return;
    }

    if (batchJob?.phase === "processing") {
      patchBatchJob(assignmentId, null);
    }
  };


  const pollBatchJob = async (jobId, jobMeta = {}) => {
    const assignId = jobMeta.assignmentId || assignmentId;
    if (!assignId || !jobId) return;
    if (isBatchStopped(assignId)) return;

    clearBatchPoll(jobId);

    // True only while the job's assignment is still the one on screen — read
    // live, since this runs inside a long-lived interval.
    const isViewingThisAssignment = () => assignId === pollCtxRef.current.assignmentId;

    const jobEngine = jobMeta.engine || "v1";
    const jobBase = engineBasePath(jobEngine);
    let pollFailStreak = 0;

    const doPoll = async () => {
      if (isBatchStopped(assignId)) return;
      try {
        const { data } = await api.get(`${jobBase}/mark-batch/status/${jobId}`);
        pollFailStreak = 0;

        if (data.state === "JOB_STATE_PENDING" || data.state === "JOB_STATE_RUNNING") {
          patchBatchJob(assignId, (prev) => ({ ...prev, phase: "processing", jobId }));
          // Wait for this response before scheduling the next one — a bare
          // setInterval would fire again even while this request is still in
          // flight, and a slow poll used to spawn overlapping requests
          // against the same job.
          registerBatchPoll(jobId, setTimeout(doPoll, 15_000));
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
        for (const { student, result, success, error, tokenUsage, compression, diagnostics } of data.results) {
          const enrichedResult = success
            ? isV2(jobEngine)
              ? buildV2MarkingResult(result, tokenUsage, modelForResult, {
                  batch: true,
                  pdfCompression: compression,
                  diagnostics,
                })
              : buildBatchMarkingResult(result, tokenUsage, modelForResult, compression)
            : null;
          const originalAiResult = enrichedResult
            ? JSON.parse(JSON.stringify(enrichedResult))
            : null;
          const integrityIncomplete = Boolean(
            enrichedResult?.markingFailed || enrichedResult?.markingIncomplete ||
            enrichedResult?.markingCompleteness?.markingFailed ||
            enrichedResult?.markingCompleteness?.markingIncomplete
          );
          resultMap[student.submissionId] = success
            ? { status: integrityIncomplete ? "needs_review" : "done", result: enrichedResult, originalAiResult }
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
                        assignedGrade: resolveTotalMarksFromResult(enrichedResult),
                        aiGrade: resolveTotalMarksFromResult(enrichedResult),
                      }
                    : s
                )
              );
              setSavedResults((prev) => ({
                ...prev,
                [student.submissionId]: {
                  status: integrityIncomplete ? "needs_review" : "done",
                  result: enrichedResult,
                  aiOriginalResult: originalAiResult,
                  totalMarks: resolveTotalMarksFromResult(enrichedResult),
                },
              }));
            }

            try {
              await api.post("/submission-files/save-results", {
              assignmentId: assignId,
              submissionId: student.submissionId,
              studentId: student.studentId,
              // v2 returns studentName; v1 returns name.
              studentName: student.name || student.studentName,
              mode: saveMode,
              provider: isV2(jobEngine) ? "gemini-v2-batch" : "gemini-batch",
              result: enrichedResult,
              });
            } catch (e) {
              const message = e?.response?.data?.message || e.message || "Failed to save marking result";
              resultMap[student.submissionId] = { status: "save_failed", result: enrichedResult, originalAiResult, error: message };
              if (isViewingThisAssignment()) {
                setSavedResults((prev) => ({ ...prev, [student.submissionId]: { ...prev[student.submissionId], status: "save_failed", error: message } }));
                recordStudentMarkingError(student.submissionId, message, e);
              }
            }
          }
        }

        patchBatchJob(assignId, (prev) => ({
          ...prev,
          phase: "done",
          results: { ...prev?.results, ...resultMap },
        }));
        const okCount = data.results.filter((r) => r.success).length;
        const failCount = data.results.length - okCount;
        const firstFail = data.results.find((r) => !r.success);
        const failReason =
          typeof firstFail?.error === "string"
            ? firstFail.error
            : firstFail?.error?.message || null;
        if (okCount === 0) {
          toast.error(
            data.results.length === 0
              ? "Batch finished with 0 results — Sahahly returned nothing. Retry or check API/quota."
              : `Batch finished — 0 marked${failCount ? ` (${failCount} failed)` : ""}${
                  failReason ? `: ${failReason}` : ""
                }`
          );
        } else {
          toast.success(
            `Batch complete — ${okCount} student${okCount === 1 ? "" : "s"} marked${
              failCount ? `, ${failCount} failed` : ""
            }.`
          );
        }
        if (isViewingThisAssignment()) {
          try {
            await fetchSavedResults();
          } catch (_) {
            /* in-memory savedResults already updated */
          }
          const { fetchPage: livePage, page: livePageNum } = pollCtxRef.current;
          livePage?.(livePageNum);
        }
      } catch (err) {
        console.error("Poll error:", err);
        pollFailStreak += 1;
        const message = extractHumanError(err) || "Polling failed";
        const transient =
          /fetch failed|network|timeout|econnreset|econnrefused|503|unavailable/i.test(
            String(message)
          );
        if (transient && pollFailStreak < 4) {
          toast.warn(`Batch status check hiccup (${pollFailStreak}/3) — retrying…`);
          patchBatchJob(assignId, (prev) => ({ ...prev, phase: "processing", jobId }));
          registerBatchPoll(jobId, setTimeout(doPoll, 15_000));
          return;
        }
        clearBatchPoll(jobId);
        patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
        toast.error(`Polling failed: ${message}`);
      }
    };

    doPoll();
  };

  const runBatchMark = async (guidanceText, mode = "normal", modelOverride = null, engine = "v1") => {
    const base = engineBasePath(engine);
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

    // Advisory page-count / orientation check before spending AI tokens on
    // possibly-wrong files. Papers the orientation review excluded are dropped
    // from `eligible` here, so every step below sees only what will be marked.
    const toGrade = await confirmPreGradingChecks(eligible);
    if (!toGrade) return;
    eligible = toGrade;

    const msOk = await confirmBatchMarkScheme(assignmentId);
    if (!msOk) {
      toast.info("Batch marking stopped — mark scheme was not accepted");
      return;
    }

    const guidanceValue = guidanceForForm(guidanceText);

    setBatchStopped(assignmentId, false);

    patchBatchJob(assignmentId, {
      phase: "uploading",
      total: eligible.length,
      skipped: {},
      results: {},
      mode,
      engine,
      geminiModel: selectedModel,
      batchStudents: eligible.map((s) => ({
        submissionId: s.submissionId,
        studentId: s.studentId,
        name: s.name,
      })),
    });

    // v2 additionally indexes the mark scheme, windows each script, and uploads
    // every mark-scheme page separately, so this step takes longer and returns
    // msPageUris alongside the whole-scheme msUri.
    let msUri, msPageUris, succeeded, failed;
    try {
      const res = await api.post(`${base}/mark-batch/upload`, {
        assignmentId,
        markingMode: mode,
        chunkSize: chunkSizeForGeminiModel(selectedModel),
        students: eligible.map((s) => ({
          submissionId: s.submissionId,
          studentId: s.studentId,
          name: s.name,
          studentName: s.name,   // v2 reads studentName; v1 ignores it
          state: s.state,
        })),
      }, { timeout: 900_000 });
      ({ msUri, msPageUris, succeeded, failed } = res.data);
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
      ...examBoardGuidance.getExamBoardFields(),
      geminiModel: selectedModel,
      subjectId,
      ...(maxGrade && { totalGrade: maxGrade }),
      classroomId,
      chunkSize: chunkSizeForGeminiModel(selectedModel),
      // v2 only: per-page mark-scheme URIs, so each window references just the
      // scheme pages it needs instead of the whole document.
      ...(msPageUris ? { msPageUris } : {}),
    };

    const submitResult = await runWithMarkingRetries({
      execute: async () => {
        try {
          const res = await api.post(`${base}/mark-batch/submit`, submitPayload, {
            timeout: 300_000,
          });
          return { jobId: res.data.jobId, resumed: false };
        } catch (err) {
          if (err.response?.data?.reason === "first_batch_pending") {
            // Not a job conflict — this assignment's first batch is already
            // capped and waiting on a human. Surface the banner, don't retry.
            throw err;
          }
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
      engine,
      geminiModel: selectedModel,
      batchStudents: succeeded.map((r) => r.student),
    });
  };

  const handleGuidanceConfirm = (provider = markingProvider) => {
    if (!guidanceModal) return;
    const resolvedGuidance = examBoardGuidance.buildResolvedGuidance(
      guidance,
      assignmentPrompt.content
    );
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
      const engine = guidanceModal.engine || "v1";
      setGuidanceModal(null);
      runBatchMark(g, mode, pickValidGeminiModel(geminiModels, geminiModel), engine);
    } else if (guidanceModal.v2) {
      setGuidanceModal(null);
      runMarkStudentV2(guidanceModal.student, g, mode);
    } else {
      setGuidanceModal(null);
      runMarkStudent(guidanceModal.student, g, mode, provider);
    }
  };

  const downloadGradedPdf = async () => {
    if (!resultModal) return;
    if (hasPendingEdits) {
      toast.warn("Save & regenerate PDF first");
      return;
    }

    setDownloading(true);
    try {
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
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
        criteriaGrade: editingCriteriaGrade || resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
      });

      downloadBlob(new Blob([pdfBytes]), `${resultModal.student.name}_graded.pdf`);
      toast.success("Downloaded");
    } catch (err) {
      toast.error(await getApiErrorMessage(err) || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const [openingResultsId, setOpeningResultsId] = useState(null);

  const resolveSavedResultForModal = useCallback(
    async (student, { batch, bulk, single, db }) => {
      const sessionResult =
        (batch?.status === "done" ? batch.result : null) ||
        (bulk?.status === "done" ? bulk.result : null) ||
        (single?.status === "done" ? single.result : null) ||
        null;

      if (sessionResult?.questions?.length) {
        return {
          result: sessionResult,
          studentFile: bulk?.studentFile || single?.studentFile || null,
          originalAiResult:
            batch?.originalAiResult ||
            bulk?.originalAiResult ||
            single?.originalAiResult ||
            null,
        };
      }

      if (db?.result?.questions?.length) {
        return {
          result: db.result,
          studentFile: db.studentFile || null,
          originalAiResult: null,
        };
      }

      if (!assignmentId || !student?.submissionId) {
        return {
          result: db?.result || sessionResult || null,
          studentFile: null,
          originalAiResult: null,
        };
      }

      if (!savedRowHasMarkingResult(db) && !sessionResult) {
        return { result: null, studentFile: null, originalAiResult: null };
      }

      const detail = await fetchSavedResultDetail(
        api,
        assignmentId,
        student.submissionId
      );
      if (detail) {
        setSavedResults((prev) => ({
          ...prev,
          [student.submissionId]: { ...(prev[student.submissionId] || {}), ...detail },
        }));
        setSingleProgress((prev) => ({
          ...prev,
          [student.submissionId]: { ...(prev[student.submissionId] || {}), ...detail },
        }));
      }
      return {
        result: detail?.result || db?.result || sessionResult || null,
        studentFile: detail?.studentFile || db?.studentFile || null,
        originalAiResult: null,
      };
    },
    [assignmentId]
  );

  /**
   * Single entry point for showing a result in the modal.
   *
   * Every marking path used to open the modal and then initialise the editor
   * after its own `await`s, which left a render where the modal showed student B
   * while the editing state still held student A. Doing both in one call closes
   * that window and gives every path the same starting state.
   */
  const openResultsModal = ({
    student,
    result,
    studentFile = null,
    originalAiResult = null,
    submissionId = null,
  }) => {
    const sid = submissionId || student?.submissionId || null;
    setResultModal({
      student,
      result,
      // Cloned only when it is genuinely a different blob - these run to
      // hundreds of KB, and readers already fall back to `result`.
      originalAiResult: originalAiResult
        ? JSON.parse(JSON.stringify(originalAiResult))
        : null,
      studentFile,
      submissionId: sid,
    });
    setEditingQuestions(
      prepareEditingQuestions(enrichMarkingQuestions(result.questions || []))
    );
    setEditingCriteriaGrade(cloneCriteriaGrade(result.criteriaGrade));
    setEditingAnnotations(getTeacherAnnotations(result).map((a) => ({ ...a })));
    setEditingMaxTotal(null);
    setEditingTotal(initialEditingTotalFromResult(result));
    setSummaryTouched(false);
    setEditingSummary(
      getMarkingResultSummary(result, {
        storedSummary: savedResults[sid]?.summary,
        studentSummary: summaryMap[sid],
      }) || ""
    );
    setAnnotationsPanelOpen(false);
    setEditorSubmissionId(sid);
    setQuestionSearch("");
  };

  const handleCorrectionPatch = useCallback(({ questions, summary }) => {
    setEditingQuestions(prepareEditingQuestions(questions));
    if (summary) {
      setEditingSummary(summary);
      setSummaryTouched(true);
    }
  }, []);

  // The row's "View Results" button reads the batch/bulk/single caches *before*
  // the saved DB copy, and those caches still hold the pre-edit AI marks after a
  // confirm. Without this the modal reopens with the old grades until a reload
  // wipes the in-memory job state.
  const syncSessionMarkingCaches = useCallback(
    (submissionId, finalResult) => {
      if (!submissionId || !finalResult) return;
      const patchEntry = (prev) =>
        prev?.[submissionId]
          ? { ...prev, [submissionId]: { ...prev[submissionId], result: finalResult } }
          : prev;
      setSingleProgress(patchEntry);
      setBulkProgress(patchEntry);

      if (getBatchJob(assignmentId)?.results?.[submissionId]) {
        patchBatchJob(assignmentId, (job) => ({
          ...job,
          results: {
            ...job.results,
            [submissionId]: { ...job.results[submissionId], result: finalResult },
          },
        }));
      }
    },
    [assignmentId]
  );

  /**
   * Write a confirmed result (and its summary) to the DB.
   *
   * `mode`/`provider` default to the marking controls, which is right for a save
   * the person just triggered. The auto-save passes the stored ones instead — a
   * paper opened days later must not be relabelled with today's dropdown.
   */
  const persistMarkingResult = async (
    finalResult,
    submissionId,
    { origin, mode, provider, studentId, studentName } = {}
  ) => {
    const { data } = await api.post("/submission-files/save-results", {
      assignmentId,
      submissionId,
      studentId: studentId ?? resultModal?.student?.studentId,
      studentName: studentName ?? resultModal?.student?.name,
      mode: mode || finalResult.markingMode || markingModeModal,
      provider: provider || markingProvider,
      result: finalResult,
      ...(origin ? { origin } : {}),
    });
    const canonical = data?.finalResult || data?.data?.result || finalResult;
    const summary = canonical.summary?.trim();
    // MarkedMeta only caches this string; re-posting the one already stored is
    // a round trip that changes nothing.
    if (summary && summary !== savedResults[submissionId]?.summary?.trim()) {
      await api.post("/submission-files/save-summary", {
        assignmentId,
        submissionId,
        summary: canonical.summary,
      });
    }
    return { canonical, saved: data?.data || null };
  };

  const handleConfirmEdits = async () => {
    if (!resultModal || !assignmentId) return;
    const appliedQuestions = questionsForConfirmEdits(
      editingQuestions,
      pendingRemovedIndices
    ).map((q) => ({ ...q }));
    const startedFor = resultModalSubmissionId;
    try {
      const finalResult = await confirmEdits(async ({ finalResult, submissionId }) => {
        const sid = resultModal.student.submissionId || submissionId;
        const { canonical, saved } = await persistMarkingResult(finalResult, sid, {
          origin: "confirm",
        });
        setResultModal((prev) => ({
          ...prev,
          result: canonical,
        }));
        setEditingSummary(canonical.summary || "");
        setSummaryTouched(false);
        setEditingMaxTotal(null);
        setEditingTotal(null);
        patchSavedResult(sid, canonical, saved);
        syncSessionMarkingCaches(sid, canonical);
        return canonical;
      });
      if (finalResult?.switchedAway) {
        toast.success("Edits saved — stayed on the previous paper");
        return;
      }
      if (finalResult && openSubmissionIdRef.current === startedFor) {
        setEditingQuestions(
          prepareEditingQuestions(
            enrichMarkingQuestions(
              finalResult.finalQuestions || finalResult.questions || appliedQuestions
            )
          )
        );
        setEditingCriteriaGrade(cloneCriteriaGrade(finalResult.criteriaGrade));
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
      toast.warn("Save & regenerate PDF first so the returned PDF matches the preview");
      return;
    }

    const integrityGate = getMarkingIntegrityPublishGate(resultModal.result);
    if (integrityGate?.level === "block") {
      toast.error(integrityGate.message);
      return;
    }
    if (integrityGate?.level === "warn") {
      const okIncomplete = await confirmToast(integrityGate.message, {
        title: integrityGate.title,
        confirmLabel: "Return anyway",
      });
      if (!okIncomplete) return;
    }

    const confirmed = await confirmReturnSingle(resultModal.student?.name);
    if (!confirmed) return;

    setReturning(true);
    try {
      const total = resolveAnnotatePdfTotalMarks({
        questions: editingQuestions,
        criteriaGrade: editingCriteriaGrade || resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
      });
      const db = savedResults[resultModal.student?.submissionId];
    
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;


      const googleUserId = studentGoogleUserId(resultModal.student);

      // A paper auto-marked 0 for a missing submission has nothing to annotate.
      // It still has to go back — the grade IS the result.
      let gradeOnly = Boolean(resultModal.result?.noSubmission);
      let studentFile = null;

      if (!gradeOnly) {
        try {
          const pdfRes = await api.get("/submission-files/pdf", {
            params: {
              assignmentId,
              submissionId: submissionId,
              googleUserId: googleUserId || undefined,
            },
            responseType: "blob"
          });
          studentFile = new File(
            [pdfRes.data],
            "student.pdf",
            { type: "application/pdf" }
          );
        } catch (err) {
          if (await isNoAttachmentError(err)) gradeOnly = true;
          else throw err;
        }
      }

      const pdfBytes = gradeOnly
        ? null
        : await annotatePdf({
            studentFile,
            questions: editingQuestions,
            maxTotalMarks: effectiveMaxTotal,
            summary: resolvePdfSummary(submissionId, resultModal.result),
            outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
            teacherAnnotations: getTeacherAnnotations(resultModal.result),
            criteriaGrade: editingCriteriaGrade || resultModal.result?.criteriaGrade,
            markingMode: resultModal.result?.markingMode || "normal",
          });

      const fd = new FormData();
      if (pdfBytes) {
        fd.append("annotatedPdf",  new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      } else {
        fd.append("gradeOnly", "1");
      }
      fd.append("assignmentId",  assignmentId);
      fd.append("submissionId",  resultModal.student.submissionId || submissionId);
      fd.append("totalMarks", total);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName",   resultModal.student.name || "Student");
      if (googleUserId) {
        fd.append("googleUserId", String(googleUserId));
      }
      appendClassroomGradeToFormData(fd, {
        submissionId: resultModal.student.submissionId || submissionId,
        student: resultModal.student,
        gradeOverrides,
        savedResults,
        classroomSyncedGrades,
        fallbackTotal: total,
        maxPoints: selectedAssignment?.maxPoints ?? effectiveMaxTotal,
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
        timeout: 600000
      });

      // Returning attaches (or rewrites) a marked PDF on the submission, so the
      // cached download is no longer necessarily what /pdf would hand back.
      invalidateStudentPdf(assignmentId, submissionId);

      const returnedAt = new Date().toISOString();
      setSavedResults((prev) => ({
        ...prev,
        [submissionId]: {
          ...(prev[submissionId] || {}),
          returnedAt,
        },
      }));
      setBulkProgress((prev) => {
        if (!prev[submissionId]) return prev;
        return {
          ...prev,
          [submissionId]: { ...prev[submissionId], returned: true },
        };
      });
      
      toast.success("Marked paper returned to student");
      toast.success(resultModal.summary)
      setResultModal(null);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to return paper");
    } finally { setReturning(false); }
  };


  const resolveBatchStudentForReturn = (submissionId) => {
    const fromPage = students.find(s => s.submissionId === submissionId);
    if (fromPage) return fromPage;
    const fromBatch = batchJob?.batchStudents?.find(s => s.submissionId === submissionId);
    if (fromBatch) return fromBatch;
    return { submissionId, name: "Student" };
  };

  const returnAllToStudents = async (prebuiltQueue, freshSavedResults = null) => {
    if (!assignmentId) {
      toast.error("Assignment not loaded");
      return { successCount: 0, failures: [{ reason: "Assignment not loaded" }] };
    }

    let bulkQueue;
    let batchQueue;

    if (prebuiltQueue) {
      ({ bulkQueue, batchQueue } = prebuiltQueue);
    } else {
      try {
        const built = await buildFreshReturnAllQueue({
          api,
          assignmentId,
          studentsMarkingUrl,
          fetchAllPaginated,
          bulkProgress,
          batchJob,
          singleProgress,
          localSavedResults: savedResults,
        });
        ({ bulkQueue, batchQueue } = built.queue);
      } catch {
        toast.error("Failed to load all students for return");
        return { successCount: 0, failures: [{ reason: "Failed to load students" }] };
      }
    }

    if (!bulkQueue.length && !batchQueue.length) {
      toast.warn("No new graded students to return");
      return { successCount: 0, failures: [] };
    }

    const mergedSaved = { ...savedResults, ...(freshSavedResults || {}) };

    const { successCount, failures, outcomes } = await runReturnAllQueue({
      api,
      assignmentId,
      bulkQueue,
      batchQueue,
      maxGradeFallback: maxGrade,
      gradeContext: {
        gradeOverrides,
        savedResults: mergedSaved,
        classroomSyncedGrades,
        maxPoints: maxGrade ?? null,
      },
      annotatePdf,
      resolvePdfSummary,
      getOutOfScopeNotes,
      getTeacherAnnotations,
      appendClassroomGradeToFormData,
      resolveTotalMarksFromResult,
    });

    for (const outcome of outcomes) {
      const keys = new Set(
        [outcome.submissionId, outcome.storedSubmissionId].filter(Boolean).map(String)
      );
      setSavedResults((prev) => {
        const next = { ...prev };
        for (const key of keys) {
          next[key] = {
            ...(prev[key] || {}),
            returnedAt: outcome.returnedAt,
          };
        }
        return next;
      });

      if (outcome.source === "bulk" && outcome.bulk) {
        setBulkProgress((p) => {
          const next = { ...p };
          for (const key of keys) {
            if (next[key]) {
              next[key] = {
                ...next[key],
                returned: true,
                result: outcome.bulk.result,
              };
            }
          }
          return next;
        });
      }

      if (outcome.source === "batch" && outcome.batch) {
        patchBatchJob(assignmentId, (prev) => ({
          ...prev,
          results: {
            ...prev?.results,
            [outcome.submissionId]: { ...outcome.batch, returned: true },
          },
        }));
      }
    }

    return { successCount, failures };
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
    if (!studentsMarkingUrl || !assignmentId) {
      toast.error("Assignment not loaded");
      return;
    }

    if (hasPendingEdits) {
      toast.warn("Save & regenerate PDF first so returned PDFs match the preview");
      return;
    }

    try {
      const { queue, savedResults: freshSaved } = await buildFreshReturnAllQueue({
        api,
        assignmentId,
        studentsMarkingUrl,
        fetchAllPaginated,
        bulkProgress,
        batchJob,
        singleProgress,
        localSavedResults: savedResults,
      });

      const returnCount = queue.bulkQueue.length + queue.batchQueue.length;
      if (returnCount === 0) {
        const gradedCount = Object.values(freshSaved).filter((s) => s?.result).length;
        if (gradedCount > 0) {
          toast.warn(
            "All graded papers were already returned. Re-mark or edit a student to return updated papers."
          );
        } else {
          toast.warn("No graded papers to return");
        }
        return;
      }

      const confirmed = await confirmReturnAll(returnCount);
      if (!confirmed) return;

      setReturning(true);
      setSavedResults((prev) => ({ ...prev, ...freshSaved }));

      await saveReturnSummaries(api, assignmentId, queue, resolvePdfSummary);

      const { successCount, failures } = await returnAllToStudents(queue, freshSaved);

      await fetchSavedResults();

      if (successCount === 0) {
        toast.error(failures[0]?.reason || "Return all failed");
      } else if (failures.length) {
        toast.warn(formatReturnFailuresMessage(successCount, failures), {
          autoClose: 12000,
        });
      } else {
        toast.success(
          `Returned ${successCount} graded paper${successCount === 1 ? "" : "s"}`
        );
      }
    } catch (err) {
      console.error("Return all failed:", err);
      toast.error((await getApiErrorMessage(err)) || "Return all failed");
    } finally {
      setReturning(false);
    }
  };
  
const isCriteria = resultModal?.result?.markingMode === "criteria";

  const summedTotal =
    isCriteria && editingCriteriaGrade
      ? Number(editingCriteriaGrade.totalMarks) || 0
      : sumQuestionMarks(questionsForDisplay);
  const storedFinal =
    resultModal?.result?.finalObtainedMarks != null &&
    Number.isFinite(Number(resultModal.result.finalObtainedMarks))
      ? Number(resultModal.result.finalObtainedMarks)
      : null;
  const total = resolveEditorObtainedMarks({
    questions: questionsForDisplay,
    editingTotal,
    storedFinal,
    baselineQuestions: confirmedSnapshot?.questions ?? resultModal?.result?.questions,
    markingMode: isCriteria ? "criteria" : "normal",
    criteriaGrade: editingCriteriaGrade,
    coverOverride: resultModal?.result?.coverOverride === true,
  });
  // Warn only for an explicit Final Grade override that differs from the row sum.
  // Stale cover totals without coverOverride heal to the paper sum on normalize/save.
  const paperTotal = summedTotal;
  const coverTotal = total;
  const totalMismatch =
    !hasPendingEdits &&
    !previewLoading &&
    questionsForDisplay.length > 0 &&
    Number.isFinite(coverTotal) &&
    Number.isFinite(paperTotal) &&
    coverTotal !== paperTotal &&
    (resultModal?.result?.coverOverride === true ||
      (editingTotal != null && editingTotal !== ""))
      ? {
          coverTotal,
          paperTotal,
          message: `Cover page total ${coverTotal} does not match paper total ${paperTotal}`,
        }
      : null;
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
    <span className="ma-panel-count">
      {loading ? "Counting PDFs…" : `Corrected ${correctedPdfCount} / ${actualPdfCount} PDFs`}
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

                <button onClick={leaveViewer} className="msv-cancel-btn">
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
    accept=".pdf,.kami,.kmi"
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

              {/* Non-batch "Mark All Students" removed — keep only batch marking */}

              {/* Return All */}
              {!bulkMarking && (msInfo || hasGradedWork) && (
                <button
                  type="button"
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
                  <span
                    className="msv-gemini-select"
                    title="Pages per request follow the selected model (2.5 → 3, 3 → 10)"
                    style={{
                      minWidth: 120,
                      display: "inline-flex",
                      alignItems: "center",
                      opacity: 0.85,
                      cursor: "default",
                    }}
                  >
                    {formatChunkSizeLabel(
                      chunkSizeForGeminiModel(
                        pickValidGeminiModel(geminiModels, geminiModel)
                      )
                    )}
                  </span>
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
                    type="button"
                    className="msv-btn-ai"
                    onClick={() => {
                      if (batchJob?.phase === "processing") {
                        pollBatchJob(batchJob.jobId, {
                          assignmentId,
                          mode: batchJob.mode,
                          engine: batchJob.engine,
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
                    {batchJob?.phase === "uploading"  && <><span className="pm-spinner" /> {isV2(batchJob.engine) ? "Indexing + uploading…" : "Uploading…"}</>}
                    {batchJob?.phase === "submitting" && <><span className="pm-spinner" /> Submitting…</>}
                    {batchJob?.phase === "processing" && <><span className="pm-spinner" /> {isV2(batchJob.engine) ? "Batch v2 running… (tap to check)" : "Batch running… (tap to check)"}</>}
                    {batchJob?.phase === "error"      && <>⚡ Batch failed — retry?</>}
                    {(!batchJob || !["uploading", "submitting", "processing", "error"].includes(batchJob.phase)) && (
                      <><FiLayers size={13} /> {markingActionLabel("Mark All (Batch)", "Mark Selected (Batch)", markingSelection.selectedCount)}</>
                    )}
                  </button>

                  <button
                    type="button"
                    className="msv-btn-ai"
                    onClick={() => openGuidanceModal(null, false, "normalBulk")}
                    disabled={bulkMarking || batchStarting || ["uploading", "submitting", "processing"].includes(batchJob?.phase)}
                    title="Mark students one-by-one at live (standard) pricing — same chunk size and model as batch"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    {bulkMarking
                      ? <><span className="pm-spinner" /> Normal marking…</>
                      : <><FiCpu size={13} /> {markingActionLabel("Mark All (Normal)", "Mark Selected (Normal)", markingSelection.selectedCount)}</>}
                  </button>
                  {bulkMarking && (
                    <button
                      type="button"
                      className="msv-btn-ai"
                      onClick={stopBulkMark}
                      style={{
                        background: "var(--danger)",
                        borderColor: "var(--danger)",
                        color: "#fff",
                      }}
                    >
                      <FiX size={13} /> Stop
                    </button>
                  )}

                  {/* BATCH MARKING — gradingv2 (allow-listed while unvalidated).
                      Hidden while a job is running so the two engines cannot be
                      started against the same assignment at once. */}
                  {canMarkV2 && (!batchJob || !["uploading", "submitting", "processing"].includes(batchJob.phase)) && (
                    <button
                      type="button"
                      className="msv-btn-ai"
                      onClick={() => openGuidanceModal(null, false, "batchV2")}
                      disabled={bulkMarking || batchStarting}
                      title="Mark the class with gradingv2 — overlapping 2-page windows, paired mark-scheme pages"
                      style={{ background: "var(--accent, #7c3aed)", borderColor: "var(--accent, #7c3aed)", color: "#fff" }}
                    >
                      <FiLayers size={13} /> {markingActionLabel("Mark All (v2)", "Mark Selected (v2)", markingSelection.selectedCount)}
                    </button>
                  )}
</div>
              )}
              {batchJob && ["uploading", "submitting", "processing"].includes(batchJob.phase) && (
                <div style={{
                  marginTop: 8, padding: "10px 14px", borderRadius: 10,
                  background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                  fontSize: 12, color: "var(--text-secondary)",
                  display: "flex", alignItems: "center", gap: 10
                }}>
                  <span className="pm-spinner" style={{ width: 12, height: 12 }} />
                  <span>
                    {batchJob.phase === "uploading"  && `Uploading ${batchJob.total} student PDFs to Sahahly…`}
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
                          engine: batchJob.engine,
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

              {/* Board / paper code / paper — recorded on every corrected
                  question for this assignment. Same component the manager
                  viewer renders, so the two cannot drift apart. */}
              <ClassroomPaperMetadataBar
                assignmentId={assignmentId}
                assignment={paperMeta}
                onSaved={(values) =>
                  setPaperMeta((prev) => (prev ? { ...prev, ...values } : values))
                }
              />

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
                            const rowIsBulkMarking = bulk?.status === "marking";
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
                            
                            const hasResult = !!(
                              single?.status === "done" ||
                              savedRowHasMarkingResult(db)
                            );
                            const isMarking = single?.status === "marking" || markingStudentId === s.submissionId;
                            const hasError = single?.status === "error" || studentErrors[s.submissionId];

                            const markingLoading = isMarking || rowIsBulkMarking || bulkRetrying || markingStudentId === s.submissionId || batchQueued;
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
                                    const listMeta = db?.listMeta;
                                    const fileWarnText =
                                      (typeof db?.result?.fileWarning === "string"
                                        ? db.result.fileWarning
                                        : db?.result?.fileWarning?.message) ||
                                      (typeof listMeta?.fileWarning === "string"
                                        ? listMeta.fileWarning
                                        : listMeta?.fileWarning?.message);
                                    const flagText = pageCountWarningText(pageCountFlags[s.submissionId]);
                                    const orientationFlagText = orientationWarningText(orientationFlags[s.submissionId]);
                                    const totalMismatchText = listMeta?.totalMismatchMessage;
                                    if (!fileWarnText && !flagText && !orientationFlagText && !totalMismatchText) return null;
                                    const title = flagText
                                      || orientationFlagText
                                      || totalMismatchText
                                      || fileWarnText
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
                                  classroomSyncedGrades,
                                  assignmentMaxPoints
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
                                                classroomSyncedGrades,
                                                assignmentMaxPoints
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

                    {(bulkDone || batchDone || single?.status === "done" || savedRowHasMarkingResult(db)) && (
                      <button
                        className="msv-action-btn msv-action-btn--ai msv-action-btn--done"
                        title="View Results"
                        disabled={openingResultsId === s.submissionId}
                        onClick={async () => {
                          setOpeningResultsId(s.submissionId);
                          try {
                            const { result, studentFile, originalAiResult } =
                              await resolveSavedResultForModal(s, {
                                batch,
                                bulk,
                                single,
                                db,
                              });
                            if (!result) {
                              toast.warn("No marking result found for this student");
                              return;
                            }
                            openResultsModal({
                              student: s,
                              result,
                              studentFile,
                              originalAiResult,
                              submissionId: s.submissionId,
                            });
                          } catch (err) {
                            toast.error(
                              (await getApiErrorMessage(err)) ||
                                "Failed to load marking result"
                            );
                          } finally {
                            setOpeningResultsId(null);
                          }
                        }}
                      >
                        {openingResultsId === s.submissionId ? (
                          <span className="pm-spinner" />
                        ) : (
                          "✅ Results"
                        )}
                      </button>
                    )}

                    {savedRowHasMarkingResult(db) && (
                      <button
                        className="msv-action-btn msv-action-btn--delete"
                        title="Delete Correction"
                        onClick={() => deleteCorrection(s)}
                        disabled={deletingCorrection[s.submissionId] || markingLoading}
                      >
                        {deletingCorrection[s.submissionId] ? <span className="pm-spinner" /> : "🗑 Delete"}
                      </button>
                    )}

                    {msInfo && (
                                      <>
                                        {/* Mark button — always shown when MS ready */}
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
                                            : <><FiCpu size={12} /> Mark All</>
                                          }
                                        </button>

                                        {/* Single mark on gradingv2 — returns immediately,
                                            so this is the way to compare engines on one student. */}
                                        {canMarkV2 && (
                                          <button
                                            className="msv-action-btn msv-action-btn--ai"
                                            title="Mark with gradingv2 (overlapping windows, paired mark-scheme pages)"
                                            onClick={() => openGuidanceModal(s, false, "v2")}
                                            disabled={markingLoading}
                                            style={{ background: "var(--accent, #7c3aed)", borderColor: "var(--accent, #7c3aed)", color: "#fff" }}
                                          >
                                            <FiLayers size={12} /> Mark v2
                                          </button>
                                        )}

                                          {/* {bulkRetrying && (
                                            <button onClick={stopBulkMark}>Stop</button>
                                          )} */}

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
<Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} showAllPages />
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
      <OrientationCheckModal
        state={orientationCheckModal}
        onResolve={resolveOrientationCheck}
        onOpenPdf={(c) => openPdf({ submissionId: c.submissionId, name: c.student?.name })}
      />

      {/* ── GUIDANCE MODAL ── */}
      {guidanceModal && (
        <div className="msv-overlay" onClick={() => setGuidanceModal(null)}>
          <div className="msv-guidance-modal" onClick={e => e.stopPropagation()}>
            <div className="msv-guidance-header">
                        
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                            {guidanceModal.v2 ? `🧪 Mark (v2) — ${guidanceModal.student?.name}` :
                            guidanceModal.engine === "v2" ? "🧪 Mark All Students (Batch v2)" :
                            guidanceModal.batch ? "⚡ Mark All Students (Batch)"  :
                            guidanceModal.normalBulk ? "🤖 Mark All Students (Normal)" :
                            guidanceModal.bulk  ? "🤖 Mark All Students"           :
                                                  `🤖 Mark — ${guidanceModal.student?.name}`}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                            {guidanceModal.v2
                              ? "Experimental engine — marks in overlapping 2-page windows, each sent only the mark-scheme pages it needs. Returns immediately."
                              : guidanceModal.engine === "v2"
                              ? `Experimental engine — overlapping 2-page windows, paired mark-scheme pages, on the batch API. Preparation takes longer than v1: ${studentTotal} students in class`
                              : guidanceModal.batch
                              ? `Submits all eligible students in this assignment via Sahahly batch — ${studentTotal} students in class`
                              : guidanceModal.normalBulk
                              ? `Marks students one-by-one at live pricing — same chunk size and model as batch (${studentTotal} students in class)`
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

              <ExamBoardGuidanceFields {...examBoardGuidance} />

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
                                  {guidanceModal.normalBulk
                                    ? "Start Normal Marking (All) with Sahahly"
                                    : guidanceModal.bulk
                                    ? "Start Marking All with Sahahly"
                                    : "Start Marking with Sahahly"}
                </button>
                                <button className="ma-send-btn" onClick={() => handleGuidanceConfirm("claude")}>
                                  <FiCpu size={14} />
                                  {guidanceModal.normalBulk
                                    ? "Start Normal Marking (All) with Claude"
                                    : guidanceModal.bulk
                                    ? "Start Marking All with Claude"
                                    : "Start Marking with Claude"}
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
                          type="number"
                          min={0}
                          max={effectiveMaxTotal}
                          value={editingTotal !== null ? editingTotal : total}
                          onChange={(e) =>
                            setEditingTotal(
                              Math.min(
                                effectiveMaxTotal,
                                Math.max(0, Number(e.target.value))
                              )
                            )
                          }
                          title="Edit final obtained marks (overrides question sum)"
                          style={{
                            width: 56, padding: "3px 8px", borderRadius: 6,
                                border: `1px solid ${color}`,
                                background: `color-mix(in srgb, ${color} 15%, transparent)`,
                                color: color,
                            fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none",
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
                            {(hasPendingEdits || editingMaxTotal !== null || editingTotal !== null) && (
                          <button
                                onClick={() => {
                                  const reset = resetToConfirmed();
                                  if (reset) {
                                    setEditingQuestions(prepareEditingQuestions(reset.questions));
                                    setEditingCriteriaGrade(cloneCriteriaGrade(reset.criteriaGrade));
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
                    {totalMismatch && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid color-mix(in srgb, var(--warning) 40%, transparent)",
                          background: "color-mix(in srgb, var(--warning) 12%, transparent)",
                          color: "var(--warning)",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {totalMismatch.message}
                      </div>
                    )}
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
                          <button
                            className="msv-btn-ai"
                            onClick={handleConfirmEdits}
                            disabled={confirmingEdits || previewLoading}
                            style={{ background: "var(--success)", borderColor: "var(--success)", color: "#fff" }}
                            title="Save marks to the database and rebuild the annotated PDF preview"
                          >
                            <FiCheck size={13} />
                            {confirmingEdits ? "Saving…" : "Save & regenerate PDF"}
                          </button>
                          <button className="ma-send-btn" onClick={downloadGradedPdf} disabled={downloading || hasPendingEdits} style={{ fontSize: 12 }} title={hasPendingEdits ? "Confirm edits first" : undefined}>
                        <FiDownload size={13} />{downloading ? "Generating…" : "Download PDF"}
                      </button>
                          <button className="msv-btn-ai" onClick={returnToStudent} disabled={returning || hasPendingEdits} title={hasPendingEdits ? "Confirm edits first" : undefined}>
                        <FiSend size={13} />{returning ? "Returning…" : "Return to Student"}
                      </button>
                          {resultModalSubmissionId && savedResults[resultModalSubmissionId]?.result && (
                            <button
                              className="msv-action-btn msv-action-btn--delete"
                              title="Delete Correction"
                              onClick={async () => {
                                await deleteCorrection(resultModal.student);
                                setResultModal(null);
                              }}
                              disabled={deletingCorrection[resultModalSubmissionId] || hasPendingEdits}
                              style={{ fontSize: 12 }}
                            >
                              {deletingCorrection[resultModalSubmissionId] ? "Deleting…" : "🗑 Delete Correction"}
                            </button>
                          )}
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
                        flex: "1 1 0",
                        minWidth: 0,
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
                              totalMarks: total,
                            }}
                            onApplyPatch={handleCorrectionPatch}
                          />
                    )}

                        {/* Edits every paper in this assignment. Applying
                            rewrites the paper on screen too, so close the modal
                            rather than leave stale marks that Confirm Edits
                            would write back over it. */}
                        {assignmentId && (
                          <BulkQuestionEditChat
                            source="classroom"
                            assignmentId={assignmentId}
                            assignmentName={assignmentTitle}
                            onApplied={async () => {
                              setResultModal(null);
                              await fetchSavedResults();
                            }}
                          />
                        )}

                    {isCriteria && editingCriteriaGrade && (
                      <div style={{ marginBottom: 20 }}>
                        <CriteriaGradeEditor
                          criteriaGrade={editingCriteriaGrade}
                          maxTotal={effectiveMaxTotal}
                          onChange={setEditingCriteriaGrade}
                          getScoreColor={getScoreColor}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Question feedback (PDF)
                          </span>
                          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        </div>
                      </div>
                    )}

                    <div className="msv-summary-box">
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Overall summary (PDF)
                      </div>
                      <textarea
                        value={editingSummary}
                        onChange={(e) => {
                          setSummaryTouched(true);
                          setEditingSummary(e.target.value);
                        }}
                        rows={4}
                        placeholder="Short bullet points (one per line, start with •)."
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" }}
                      />
                    </div>

                    <MarkingCompletenessNotice
                      result={resultModal?.result}
                      questionCount={questionsForDisplay.length}
                    />
                    <MarkingPageShiftNotice result={resultModal?.result} />

                    <OutOfScopeNotesPanel
                      notes={editingOutOfScopeNotes}
                      onRemove={handleOutOfScopeNoteRemove}
                    />
                    <AddMarkingQuestionBar
                      onAdd={(q) => {
                        setEditingQuestions((prev) => [...prev, q]);
                        setEditingTotal(null);
                        toast.success(`Added Q${q.questionNumber}`);
                      }}
                    />
                    <MarkingQuestionSearchBar
                      value={questionSearch}
                      onChange={setQuestionSearch}
                      matchCount={questionsForSearch.length}
                      totalCount={questionsForDisplay.length}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                      {questionsForSearch.map((q) => (
                        <MarkingQuestionCard
                          key={q._placementIndex}
                          question={q}
                          index={q._placementIndex}
                          guidance={assignmentPrompt.content}
                          allQuestions={questionsForDisplay}
                          getScoreColor={getScoreColor}
                          onChange={(index, updated) =>
                            setEditingQuestions((prev) =>
                              applyQuestionRowEdit(prev, index, updated)
                            )
                          }
                          onRemove={(questionIndex) => handleQuestionRemove(questionIndex)}
                        />
                      ))}
                    </div>

                  </div>
                    
                    {/* MIDDLE CARD (Annotated File) */}
                    <div style={{
                      flex: "1 1 0",
                      minWidth: 0,
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
                              {confirmingEdits || previewLoading
                                ? "Updating preview…"
                                : "Unsaved changes — click Save & regenerate PDF to update preview"}
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
                        <div
                          className="pdf-preview-status pdf-preview-status--error"
                          style={{ flexDirection: "column", gap: 10 }}
                        >
                          <span style={{ textAlign: "center", maxWidth: 360 }}>{previewError}</span>
                          <button
                            type="button"
                            onClick={retryPreview}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Retry
                          </button>
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
                            key={resultModal?.submissionId || resultModal?.student?.submissionId || "preview"}
                            url={annotatedPreviewUrl}
                            pdfSessionKey={resultModalSubmissionId}
                            placementQuestions={placementQuestions}
                            reportPageCount={reportPageCount}
                            onPlacementChange={handleAnnotationPlacementChange}
                            onQuestionRemove={handleQuestionRemove}
                            onQuestionLabelChange={handleQuestionLabelChange}
                            labelGuidance={assignmentPrompt.content}
                          />
                        </div>
                      ) : (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          No preview available
                        </div>
                      )}
                    </div>

                    {/* RIGHT CARD (NEW - Mark Scheme, read-only) */}
                    <div style={{
                      flex: "1 1 0",
                      minWidth: 0,
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
                      }}>
                        📘 Mark Scheme
                      </div>
                      {markSchemeLoading ? (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          Loading mark scheme…
                        </div>
                      ) : markSchemeError ? (
                        <div style={{ color: "var(--danger)", fontSize: 13 }}>
                          {markSchemeError}
                        </div>
                      ) : markSchemePreviewUrl ? (
                        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                          <AnnotatedPdfPreview url={markSchemePreviewUrl} labelGuidance={assignmentPrompt.content} />
                        </div>
                      ) : (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>
                          No mark scheme available
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

