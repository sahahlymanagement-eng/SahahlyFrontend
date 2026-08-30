import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { promptToast, confirmToast } from "../../utils/confirmToast";
import { annotatePdf } from "../../utils/annotatePdf";
import { downloadBlob } from "../../utils/downloadBlob";
import {
  FiUsers, FiClipboard, FiDownload, FiEye, FiCpu,
  FiUploadCloud, FiX, FiCalendar, FiSend, FiLayers, FiAlertCircle, FiCheck, FiRefreshCw, FiEdit3,
  FiRotateCcw, FiRotateCw
} from "react-icons/fi";
import { usePagination } from "../../hooks/usePagination";
import usePersistedState, { removePersisted } from "../../hooks/usePersistedState";
import { useAnnotatedResultPreview } from "../../hooks/useAnnotatedResultPreview";
import { getStoredUser } from "../../utils/session";
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
  appendMarkingContext,
  assertPdfBlob,
  buildFinalMarkingResult,
  buildBatchMarkingResult,
  buildV2MarkingResult,
  buildPriorityMarkingResult,
  buildNoSubmissionMarkingResult,
  applyTeacherEditsToResult,
  sumQuestionMarks,
  filterQuestionsPendingRemoval,
  buildPlacementQuestions,
  applyPlacementChange,
  applyQuestionLabelChange,
  questionsForConfirmEdits,
  gradeScorePercent,
  resolveTotalMarksFromResult,
  markingResultsAreIdentical,
  resolveAnnotatePdfTotalMarks,
  resolveSavedMarkingGrade,
  currentUserId,
  getApiErrorMessage,
  getMarkingResultSummary,
  rebuildMarkingSummary,
  guidanceForForm,
  resolveMarkingGuidanceText,
  hasTeacherEdits,
  isStudentSubmitted,
  normalizeGuidance,
  getResultMaxTotal,
  resolveDisplayMaxTotal,
  getOutOfScopeNotes,
  getTeacherAnnotations,
  prepareEditingQuestions,
  totalMarksMismatchInfo,
  isSameSubmissionModal,
} from "../../utils/markingFormData";
import TeacherAnnotationsEditor from "../../components/TeacherAnnotationsEditor";
import MarkingQuestionCard from "../../components/MarkingQuestionCard";
import ClassroomPaperMetadataBar from "../../components/ClassroomPaperMetadataBar";
import OutOfScopeNotesPanel from "../../components/OutOfScopeNotesPanel";
import CriteriaGradeEditor from "../../components/CriteriaGradeEditor";
import {
  cloneCriteriaGrade,
  applyQuestionRowEdit,
} from "../../utils/markingQuestionEdits";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import TokenUsageStats from "../../components/TokenUsageStats";
import MarkingCorrectionChat from "../../components/MarkingCorrectionChat";
import BulkQuestionEditChat from "../../components/BulkQuestionEditChat";
import AddMarkingQuestionBar, {
  MarkingCompletenessNotice,
} from "../../components/AddMarkingQuestionBar";
import MarkingPageShiftNotice from "../../components/MarkingPageShiftNotice";
import AnnotatedPdfPreview from "../../components/AnnotatedPdfPreview";
import QuestionNumberBadge from "../../components/QuestionNumberBadge";
import { getMarkingIntegrityPublishGate } from "../../utils/markingIntegrityPublish";
import {
  formatCostPair,
  geminiModelLabel,
  parseGeminiModelsResponse,
  pickValidGeminiModel,
  PRIORITY_RATE_FACTOR,
  resolveMarkingCost,
  sahahlyModelLabel,
} from "../../utils/markingCost";
import {
  chunkSizeForGeminiModel,
  pickableChunkSizes,
  formatChunkSizeLabel,
} from "../../utils/markingChunkSize";
import { canViewMoneyCostsFromStorage, maybeStripMoney } from "../../utils/moneyVisibility";
import { syncAssignmentFromClassroom, refreshAssignmentGrades, buildPercentOverridesFromStudents } from "../../utils/refreshAssignmentFromClassroom";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
import {
  buildFreshReturnAllQueue,
  runReturnAllQueue,
  saveReturnSummaries,
  formatReturnFailuresMessage,
  studentGoogleUserId,
  isNoAttachmentError,
} from "../../utils/returnAllExecution";
import { confirmReturnAll, confirmReturnSingle } from "../../utils/returnConfirmation";
import { sortQuestionsByPlacement } from "../../utils/normalizeQuestionPlacement";
import {
  useMarkingStudentSelection,
  loadEligibleStudentsForMarking,
  markingActionLabel,
} from "../../utils/markingStudentSelection";
import MarkingSelectionBar from "../../components/MarkingSelectionBar";
import ReportTeacherFilterSelect from "../../components/ReportTeacherFilterSelect";
import { buildReportTeacherOptions } from "../../hooks/useReportTeacherFilter";
import { confirmBatchMarkScheme } from "../../utils/confirmBatchMarkScheme";
import { sortStudentsBySubmittedAt } from "../../utils/sortStudentsBySubmittedAt";
import { useAssignmentMarkingPrompt } from "../../hooks/useAssignmentMarkingPrompt";
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
import {
  remainingRunLabel,
  remainingRunInProgress,
  remainingRunIsStale,
  watchRemainingRun,
  retryRemainingRun,
} from "../../utils/firstBatchRemaining";
import { engineBasePath, isV2, canUseGradingV2 } from "../../utils/markingEngines";
import { invalidateStudentPdf } from "../../utils/studentPdfCache";
import { buildEditorPreviewBaseline } from "../../utils/buildEditorPreviewBaseline";
import "./ManagerSubmissionViewer.css";

function geminiDropdownLabel(model) {
  return sahahlyModelLabel(model);
}

export default function ManagerSubmissionViewer({ scope = "manager" }) {
  // const BATCH_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];
  const PRIORITY_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];
  // gradingv2 is allow-listed until it has been validated against real papers.
  const canMarkV2 = canUseGradingV2(currentUserId());
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkHandledRef = useRef(null);
  const msInputRef = useRef();

  const [user,               setUser]               = useState(() => getStoredUser());
  const [selectedClassroom,  setSelectedClassroom]  = usePersistedState(`subviewer:${scope}:classroom`, null);
  const [selectedAssignment, setSelectedAssignment] = usePersistedState(`subviewer:${scope}:assignment`, null);
  const assignmentPrompt = useAssignmentMarkingPrompt(selectedAssignment?._id);
  const [classroomSearch,    setClassroomSearch]    = useState("");
  const [assignmentSearch,   setAssignmentSearch]   = useState("");
  const [studentSearch,      setStudentSearch]      = useState("");
  const [markingModeModal,   setMarkingModeModal]   = useState("normal");

  const isDirectorScope = scope === "director" || scope === "backup";
  const isTeacherScope = scope === "teacher";
  const [directorChunkSize, setDirectorChunkSize] = useState(5);
  const showMarkingTools = !isTeacherScope;
  // Only the director picks chunk size freely; backup + managers + others follow the model.
  const canPickChunkSizeIndependently = scope === "director";
  /** Director picks freely; everyone else locks pages/request to the model. */
  const resolveMarkingChunkSize = useCallback(
    (modelId) =>
      canPickChunkSizeIndependently
        ? directorChunkSize
        : chunkSizeForGeminiModel(modelId),
    [canPickChunkSizeIndependently, directorChunkSize]
  );
  const appendMarkingChunkSize = (fd, modelId) => {
    fd.append("chunkSize", String(resolveMarkingChunkSize(modelId)));
  };
  const examBoardGuidance = useExamBoardGuidance({
    classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId ?? null,
    assignmentId: selectedAssignment?._id ?? null,
    enabled: showMarkingTools,
  });
  const dashboardPath = isDirectorScope
    ? scope === "backup"
      ? "/backup/submissions"
      : "/director/dashboard"
    : isTeacherScope
      ? "/teacher/dashboard"
      : "/manager/dashboard";
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [allTeachers, setAllTeachers] = useState([]);

  const classroomParams = useMemo(() => {
    const params = { search: classroomSearch };
    if (!isDirectorScope && !isTeacherScope) params.personId = user?.id;
    if (!isTeacherScope && teacherFilter !== "all") {
      params.teacherId = teacherFilter;
    }
    return params;
  }, [user?.id, classroomSearch, isDirectorScope, isTeacherScope, teacherFilter]);

  const classroomsUrl = isDirectorScope
    ? "/google-classroom/courses"
    : isTeacherScope
      ? user?.id
        ? `/google-classroom/teacher-courses/${user.id}`
        : "/google-classroom/teacher-courses/_"
      : "/students/my-classrooms";

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
    loading: loadingClassrooms,
  } = usePagination(
    classroomsUrl,
    classroomParams,
    isDirectorScope ? 50 : 20,
    "data",
    isDirectorScope ? true : !!user?.id
  );
  const teacherOptions = useMemo(
    () => buildReportTeacherOptions(false, allTeachers, classrooms),
    [allTeachers, classrooms]
  );

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
    data: studentsPage,
    page: studentPage,
    totalPages: studentTotalPages,
    total: studentTotal,
    loading: loadingStudents,
    fetchPage: fetchStudentPage,
    setData: setStudents,
    extra: studentExtra,
    error: studentFetchError,
  } = usePagination(
    selectedAssignment ? `/manager-assignments/${selectedAssignment._id}/full` : "/manager-assignments/_/full",
    studentParams,
    10,
    "students",
    !!selectedAssignment?._id
  );

  // Earliest submission first — matches backend; re-apply if a local update reorders.
  const students = useMemo(
    () => sortStudentsBySubmittedAt(studentsPage),
    [studentsPage]
  );

  const summaryMap = studentExtra?.summaryMap || {};
  // Backend computes this over the full (unpaginated) roster alongside the
  // page fetch, so no separate full-roster fetch is needed just to count PDFs.
  const actualPdfCount = studentExtra?.pdfCount ?? 0;

  // Batch polling runs on a setInterval that outlives the render it was created
  // in, so anything it reads directly would be frozen at that moment. Keep the
  // values it needs live here: fetchStudentPage is keyed on the assignment URL,
  // so a stale one would overwrite the current list with another assignment's
  // students. Updated every render on purpose (no dep array).
  const pollCtxRef = useRef({ assignmentId: null, page: 1, fetchPage: null });
  useEffect(() => {
    pollCtxRef.current = {
      assignmentId: selectedAssignment?._id ?? null,
      page: studentPage,
      fetchPage: fetchStudentPage,
    };
  });

  useEffect(() => {
    if (!selectedAssignment?._id || loadingStudents) return;
    if (studentFetchError) {
      // Restored assignment couldn't load (e.g. deleted) — forget the saved
      // selection so a later tab-return doesn't re-restore this broken one.
      // The current view is left intact; use Back to go up a level.
      removePersisted(`subviewer:${scope}:assignment`);
      toast.error(`Could not load students: ${studentFetchError}`);
    } else if (studentExtra.googleUnavailable) {
      toast.warn("Google Classroom is unavailable — showing saved students without live submission status.");
    }
  }, [selectedAssignment?._id, loadingStudents, studentFetchError, studentExtra.googleUnavailable]);

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
  const [savedResults, setSavedResults] = useState({});
  const correctedPdfCount = useMemo(
    () => Object.values(savedResults).filter((entry) => entry?.result).length,
    [savedResults]
  );

  useEffect(() => {
    if (!selectedAssignment?._id) {
      setBatchJob(null);
      return undefined;
    }
    return subscribeBatchJob(selectedAssignment._id, setBatchJob);
  }, [selectedAssignment?._id]);

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

  const markingSelection = useMarkingStudentSelection();
  const [selectingMarkingAll, setSelectingMarkingAll] = useState(false);

  const studentsMarkingUrl = selectedAssignment?._id
    ? `/manager-assignments/${selectedAssignment._id}/full`
    : null;

  useEffect(() => {
    markingSelection.clear();
  }, [selectedAssignment?._id]);

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
      assignmentId: selectedAssignment._id,
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


  // Small helper so every marking path builds the same page-check args.
  const pageCheckArgs = (students) => ({
    assignmentId: selectedAssignment?._id,
    classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
    students,
    onReport: applyPageCountReport,
  });

  const orientationCheckArgs = (students) => ({
    assignmentId: selectedAssignment?._id,
    classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
    students,
    onReport: applyOrientationReport,
  });

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


  // Results modal
  const [singleProgress, setSingleProgress] = useState({});
  const [resultModal,      setResultModal]      = useState(null);
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
    const aid = selectedAssignment?._id;
    if (!aid || !msInfo?.fileId) {
      setMarkSchemePreviewUrl(null);
      setMarkSchemeError(null);
      return;
    }
    if (msPreviewRef.current.assignmentId === aid && msPreviewRef.current.url) {
      setMarkSchemePreviewUrl(msPreviewRef.current.url);
      return;
    }
    // AbortController (not just an ignore-flag) so a re-render mid-fetch — e.g. the
    // auto-save-on-open flow replacing `resultModal` with a new object right after the
    // modal mounts — cancels the in-flight 6MB request instead of leaving it running
    // alongside a fresh duplicate. Two concurrent blob GETs for the same large file was
    // producing net::ERR_FAILED on one or both in Chrome.
    const controller = new AbortController();
    setMarkSchemeLoading(true);
    setMarkSchemeError(null);
    api.get(`/manager-assignments/${aid}/markscheme-file`, {
      responseType: "blob",
      signal: controller.signal,
    })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
        if (msPreviewRef.current.url && msPreviewRef.current.assignmentId !== aid) {
          URL.revokeObjectURL(msPreviewRef.current.url);
        }
        msPreviewRef.current = { assignmentId: aid, url };
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
  }, [resultModalOpen, selectedAssignment?._id, msInfo?.fileId]);

  // Revoke the cached mark scheme object URL on unmount.
  useEffect(() => () => {
    if (msPreviewRef.current.url) URL.revokeObjectURL(msPreviewRef.current.url);
  }, []);
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [editingCriteriaGrade, setEditingCriteriaGrade] = useState(null);
  const [editingAnnotations, setEditingAnnotations] = useState([]);
  const [editingSummary, setEditingSummary] = useState("");
  const [summaryTouched, setSummaryTouched] = useState(false);
  const [downloading,      setDownloading]      = useState(false);
  const [returning,        setReturning]        = useState(false);
  const [editingTotal, setEditingTotal] = useState(null); // null means use effectiveTotal
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);
  const [pendingRemovedIndices, setPendingRemovedIndices] = useState(() => new Set());
  // Which submission the editing state above belongs to.
  const [editorSubmissionId, setEditorSubmissionId] = useState(null);
  // "Not included in your assignment" markers are stamped on the PDF but are not
  // question rows, so they need their own editable copy to be removable.
  const [editingOutOfScopeNotes, setEditingOutOfScopeNotes] = useState(() =>
    resultModal?.result ? getOutOfScopeNotes(resultModal.result) : []
  );

  const editHistory = useMarkingEditHistory({
    questions: editingQuestions,
    summary: editingSummary,
    setQuestions: setEditingQuestions,
    setSummary: setEditingSummary,
    resetKey: resultModal
      ? resultModal.student?.submissionId || resultModal.submissionId || "open"
      : null,
  });

  const [studentErrors, setStudentErrors] = useState({});

  const [markingProvider, setMarkingProvider] = useState("gemini");
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
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

  // Advisory pre-grading page-count check (shared hook + modal)
  const { pageCheckModal, confirmPageCounts, resolvePageCheck } = usePageCountCheck();
  const { orientationCheckModal, confirmOrientations, resolveOrientationCheck } = useOrientationCheck();
  // Per-submission page-count flags, populated as soon as the check runs so the
  // row warnings update without waiting for grading.
  const [pageCountFlags, setPageCountFlags] = useState({});
  const applyPageCountReport = (report) =>
    setPageCountFlags((prev) => ({ ...prev, ...buildPageCountFlagMap(report) }));
  const [orientationFlags, setOrientationFlags] = useState({});
  const applyOrientationReport = (report) =>
    setOrientationFlags((prev) => ({ ...prev, ...buildOrientationFlagMap(report) }));

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
    assignmentId: selectedAssignment?._id,
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
    return sortQuestionsByPlacement(filtered);
  }, [editingQuestions, pendingRemovedIndices]);

  const placementQuestions = useMemo(
    () => buildPlacementQuestions(editingQuestions, pendingRemovedIndices),
    [editingQuestions, pendingRemovedIndices]
  );

const fetchSavedResults = useCallback(async () => {
  if (!selectedAssignment?._id) return;
  try {
    const res = await api.get(`/submission-files/save-results/${selectedAssignment._id}`);
    const map = {};
    const synced = {};
    res.data.data.forEach(r => {
      const result = maybeStripMoney(r.result);
      map[r.submissionId] = {
        status: "done",
        result,
        studentFile: r.studentFileMeta,
        totalMarks: resolveSavedMarkingGrade(r),
        classroomAssignedGrade: r.classroomAssignedGrade ?? null,
        provider: r.provider,
        mode: r.mode,
        summary: r.summary || "",
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
}, [selectedAssignment?._id]);

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
    try {
      await assignmentPrompt.reload();
    } catch {
      // prompt reload optional
    }
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
    const classroomName = selectedClassroom?.section
      ? `${selectedClassroom.name} (${selectedClassroom.section})`
      : selectedClassroom?.name;
    await exportAssignmentGradesExcel({
      students: mergedStudents,
      targetMax,
      assignmentMaxPoints,
      savedResults,
      percentOverrides,
      gradeOverrides,
      classroomSyncedGrades,
      filename,
      assignmentTitle: selectedAssignment.title,
      classroomName,
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
    const stored = getStoredUser();
    if (!stored) {
      navigate("/login");
      return;
    }
    setUser(stored);
  }, [navigate]);

  useEffect(() => {
    if (isTeacherScope) return;
    if (isDirectorScope) {
      api
        .get("/people/teachers")
        .then((r) => setAllTeachers(r.data || []))
        .catch(() => {});
      return;
    }
    if (!user?.id) return;
    api
      .get("/google-classroom/filter-teachers", { params: { personId: user.id } })
      .then((r) => setAllTeachers(r.data || []))
      .catch(() => {});
  }, [isDirectorScope, isTeacherScope, user?.id]);

  useEffect(() => {
    if (teacherFilter === "all" || !selectedClassroom) return;
    const classroomTeacherId = String(
      selectedClassroom?.teacherId?._id || selectedClassroom?.teacherId?.id || ""
    );
    if (classroomTeacherId && classroomTeacherId !== teacherFilter) {
      setSelectedClassroom(null);
      setSelectedAssignment(null);
    }
  }, [teacherFilter, selectedClassroom]);

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

  useEffect(() => {
    if (!user) return;

    const classroomId = searchParams.get("classroomId");
    const assignmentId = searchParams.get("assignmentId");
    if (!classroomId || !assignmentId) return;

    const linkKey = `${classroomId}:${assignmentId}`;
    if (deepLinkHandledRef.current === linkKey) return;

    let cancelled = false;

    (async () => {
      try {
        const classroomRes = await api.get(`/classrooms/${classroomId}`);
        if (cancelled) return;

        const classroom = classroomRes.data;
        if (!classroom?._id) {
          toast.warn("Classroom not found in submission viewer");
          return;
        }

        const assignmentsRes = await api.get(
          `/manager-assignments/classroom/${classroomId}/assignments`,
          { params: { limit: 500, page: 1 } }
        );
        if (cancelled) return;

        const assignment = (assignmentsRes.data?.data || []).find(
          (item) => String(item._id) === String(assignmentId)
        );

        if (!assignment) {
          toast.warn("Assignment not found in submission viewer");
          return;
        }

        deepLinkHandledRef.current = linkKey;
        setSelectedClassroom(classroom);
        setSelectedAssignment(assignment);
        setMsInfo(null);
        setBulkProgress({});
        setExpectedPages(assignment.expectedPages ?? null);
        setExpectedPagesInput(
          assignment.expectedPages != null ? String(assignment.expectedPages) : ""
        );
        setShowExpectedPagesEdit(false);

        try {
          const msRes = await api.get(`/manager-assignments/${assignment._id}/markscheme`);
          if (!cancelled) {
            setMsInfo(msRes.data.fileId ? msRes.data : null);
          }
        } catch {
          if (!cancelled) setMsInfo(null);
        }
      } catch {
        if (!cancelled) {
          toast.error("Could not open this assignment in submission viewer");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, searchParams]);

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
    navigate(dashboardPath);
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
        : intent === "v2"
        ? { v2: true, student }
        : intent === "batchV2"
        ? { batch: true, engine: "v2" }
        : isBatch
        ? { batch: true }
        : student
        ? { student }
        : { bulk: true }
    );

    setGuidance(resolveMarkingGuidanceText("", assignmentPrompt.content));
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
    const assignId = selectedAssignment?._id;
    if (!assignId) return;
    setBatchStopped(assignId, true);

    const job = batchJob;
    const jobId = job?.jobId;
    if (jobId) clearBatchPoll(jobId);

    patchBatchJob(assignId, null);

    if (jobId) {
      try {
        await api.delete(`${engineBasePath(job?.engine)}/mark-batch/cancel/${jobId}`);
        toast.info("Batch marking cancelled");
      } catch (err) {
        toast.warning(extractHumanError(err) || "Batch stop requested — server cancel failed");
      }
    }
  };

  // Confirms a capped first batch (see backend firstBatchGate.js) and waits
  // for the server's auto-triggered "mark the rest" run to create its batch
  // job, then hands off to the normal poll — reuses the same active-job
  // discovery this page already runs on mount.
  const followRemainingRun = async (assignId, engine = "v1") => {
    const base = engineBasePath(engine);
    const result = await watchRemainingRun({
      statusUrl: `${base}/first-batch/status/${assignId}`,
      onStatus: (run, firstBatch) => {
        patchBatchJob(assignId, (prev) => ({
          ...prev,
          firstBatch: {
            ...(prev?.firstBatch || firstBatch || {}),
            status: run?.status === "failed" ? "remaining_failed" : "confirming",
            remainingRun: run || prev?.firstBatch?.remainingRun || firstBatch?.remainingRun,
          },
        }));
      },
    });

    if (result.state === "processing") {
      await checkForActiveJob();
      return;
    }
    if (result.state === "done") {
      patchBatchJob(assignId, (prev) => ({
        ...prev,
        firstBatch: {
          ...(prev?.firstBatch || {}),
          status: "confirmed",
          remainingRun: result.run,
        },
      }));
      toast.success("Remaining submissions marked");
      fetchStudentPage(studentPage);
      return;
    }
    if (result.state === "failed") {
      patchBatchJob(assignId, (prev) => ({
        ...prev,
        firstBatch: {
          ...(prev?.firstBatch || {}),
          status: "remaining_failed",
          remainingRun: {
            ...(result.run || prev?.firstBatch?.remainingRun || {}),
            status: "failed",
            error: result.error || result.run?.error || "Marking the rest failed",
          },
        },
      }));
      toast.error(result.error || "Marking the rest failed");
    }
  };

  const confirmFirstBatch = async () => {
    const assignId = selectedAssignment?._id;
    if (!assignId || !batchJob?.firstBatch) return;
    const ok = await confirmToast(
      "This will mark the remaining submissions for this assignment now. Continue?",
      { title: "Confirm & Mark Rest", confirmLabel: "Confirm & Mark Rest" }
    );
    if (!ok) return;

    const engine = batchJob.engine || "v1";
    try {
      await api.post(`${engineBasePath(engine)}/first-batch/confirm/${assignId}`);
    } catch (err) {
      toast.error(extractHumanError(err) || "Failed to confirm first batch");
      return;
    }

    toast.info("Confirmed — marking the remaining submissions…");
    patchBatchJob(assignId, (prev) => ({
      ...prev,
      firstBatch: { ...(prev?.firstBatch || {}), status: "confirming" },
    }));
    await followRemainingRun(assignId, engine);
  };

  const retryFirstBatchRemaining = async () => {
    const assignId = selectedAssignment?._id;
    if (!assignId) return;
    const engine = batchJob?.engine || "v1";
    try {
      await retryRemainingRun(`${engineBasePath(engine)}/first-batch/retry-remaining/${assignId}`);
    } catch (err) {
      toast.error(extractHumanError(err) || "Could not retry remaining marking");
      return;
    }
    patchBatchJob(assignId, (prev) => ({
      ...prev,
      firstBatch: { ...(prev?.firstBatch || {}), status: "confirming" },
    }));
    toast.info("Retrying remaining submissions…");
    await followRemainingRun(assignId, engine);
  };

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
    return "Sahahly";
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
    // Advisory page-count check before spending AI tokens on a possibly-wrong file.
    if (!(await confirmPreGradingChecks([student]))) return;

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
      examBoardGuidance.appendExamBoardFields(fd);
      if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
      appendMarkingContext(fd, {
        assignmentId: selectedAssignment._id,
        classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      });
      appendMarkingChunkSize(fd, selectedModel);

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

      
      openResultsModal({ student, result: res.data, studentFile });
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
            // toast.error(await getApiErrorMessage(err));
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runMarkStudentPriority = async (student, guidanceText, mode = "normal") => {
    // Advisory page-count check before spending AI tokens on a possibly-wrong file.
    if (!(await confirmPreGradingChecks([student]))) return;

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
      examBoardGuidance.appendExamBoardFields(fd);
      if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
      appendMarkingContext(fd, {
        assignmentId: selectedAssignment._id,
        classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      });
      appendMarkingChunkSize(fd, selectedModel);
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

      openResultsModal({ student, result: enrichedResult, studentFile });
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
        const cost = canViewMoneyCostsFromStorage()
          ? resolveMarkingCost(enrichedResult)
          : null;
        const costText = cost ? ` · ${formatCostPair(cost)}` : "";
        toast.success(
          `Priority mark complete — ${Number(tokenTotal).toLocaleString()} tokens${costText}`
        );
      }

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

  // ── Single-student marking on gradingv2 ────────────────────────────────────
  // Uses the live v2 endpoint rather than a one-student batch job, so a re-mark
  // comes back immediately. The server fetches its own copies from Drive; the
  // student PDF is pulled here only so the result modal can render annotations.
  const runMarkStudentV2 = async (student, guidanceText, mode = "normal") => {
    if (!canMarkV2) {
      toast.error("You are not allowed to use v2 marking.");
      return;
    }
    setMarkingStudentId(student.submissionId);
    setSingleProgress((prev) => ({
      ...prev,
      [student.submissionId]: { status: "marking" },
    }));

    try {
      const selectedModel = pickValidGeminiModel(geminiModels, geminiModel);
      if (selectedModel !== geminiModel) setGeminiModel(selectedModel);

      const studentPdfRes = await api.get("/submission-files/pdf", {
        params: { assignmentId: selectedAssignment._id, submissionId: student.submissionId },
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
          assignmentId: selectedAssignment._id,
          submissionId: student.submissionId,
          markingMode: mode,
          guidance: guidanceForForm(guidanceText),
          ...examBoardGuidance.getExamBoardFields(),
          geminiModel: selectedModel,
          subjectId: selectedAssignment.subjectId,
          ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
          classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
          chunkSize: resolveMarkingChunkSize(selectedModel),
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
        [student.submissionId]: { status: "done", result: enrichedResult, studentFile },
      }));

      await api.post("/submission-files/save-results", {
        assignmentId: selectedAssignment._id,
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
        const tokenTotal = enrichedResult?.tokenUsage?.totalTokens;
        const cost = canViewMoneyCostsFromStorage()
          ? resolveMarkingCost(enrichedResult)
          : null;
        const costText = cost ? ` · ${formatCostPair(cost)}` : "";
        toast.success(
          `v2 mark complete — ${diag.windowCount ?? "?"} windows` +
            (tokenTotal ? ` · ${Number(tokenTotal).toLocaleString()} tokens` : "") +
            costText
        );
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
      recordStudentMarkingError(
        student.submissionId,
        message,
        err.response?.data,
        `v2 Marking Failed - ${student.name}`
      );
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

    // Advisory page-count check before spending AI tokens on possibly-wrong files.
    // The orientation review can drop the flagged papers, so the list it hands
    // back — not `loaded.eligible` — is what gets marked.
    const eligible = await confirmPreGradingChecks(loaded.eligible);
    if (!eligible) return;

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

        const fd = new FormData();
        fd.append("studentPdf",    studentFile);
        fd.append("markingMode",   mode);

        if (guidanceValue) fd.append("guidance", guidanceValue);
        examBoardGuidance.appendExamBoardFields(fd);

        if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
    
        appendMarkingContext(fd, {
          assignmentId: selectedAssignment._id,
          classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
        });
        appendMarkingChunkSize(fd, selectedModel);
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

          try {
            await api.post("/submission-files/save-results", {
              assignmentId: selectedAssignment._id,
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
  fetchStudentPage(studentPage);
  } catch (err) {
    setBulkMarking(false);
    toast.error(await getApiErrorMessage(err));
  }
  };

  const checkForActiveJob = async () => {
    const assignId = selectedAssignment?._id;
    if (!assignId) return;

    // A job could belong to either engine, and they use separate collections,
    // so ask both. v1 is checked first because it is still the default.
    const engines = canMarkV2 ? ["v1", "v2"] : ["v1"];

    for (const engine of engines) {
      let data;
      try {
        ({ data } = await api.get(`${engineBasePath(engine)}/mark-batch/active/${assignId}`));
      } catch (err) {
        console.error(`checkForActiveJob (${engine}):`, err.message);
        continue;
      }
      if (!data?.active) continue;

      // v1 returns the job under `active`; v2 returns it flat.
      const job = typeof data.active === "object" ? data.active : data;
      const { jobId, studentOrder, submittedAt, geminiModel: jobModel } = job;
      const restoredModel = pickValidGeminiModel(geminiModels, jobModel || geminiModel);
      // Preserve the mode the job was submitted with — hardcoding "normal" here
      // made a resumed criteria batch save its results as normal marking.
      const restoredMode = job.markingMode || job.mode || "normal";

      setBatchStopped(assignId, false);
      patchBatchJob(assignId, {
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
        assignmentId: assignId,
        mode: restoredMode,
        engine,
        geminiModel: restoredModel,
        batchStudents: studentOrder || [],
      });
      return;
    }

    const existing = batchJob;
    if (existing?.phase === "processing") {
      patchBatchJob(assignId, null);
    }
  };

  useEffect(() => {
    if (!selectedAssignment?._id) return;
    checkForActiveJob();
    const assignId = selectedAssignment._id;
    (async () => {
      try {
        const { data } = await api.get(`/marking/first-batch/status/${assignId}`);
        const fb = data?.firstBatch || { status: "none" };
        const run = fb.remainingRun;
        const engine = fb.engine === "v2" ? "v2" : "v1";
        patchBatchJob(assignId, (prev) => ({
          ...prev,
          // Don't leave phase undefined — an empty phase blanks the Mark (Batch) button.
          phase: prev?.phase || "done",
          engine: prev?.engine || engine,
          firstBatch: {
            ...(prev?.firstBatch || {}),
            ...fb,
          },
        }));
        if (run?.status === "failed" || remainingRunIsStale(run)) {
          patchBatchJob(assignId, (prev) => ({
            ...prev,
            phase: prev?.phase || "done",
            engine: prev?.engine || engine,
            firstBatch: {
              ...(prev?.firstBatch || fb || {}),
              status: "remaining_failed",
              remainingRun: run,
            },
          }));
        } else if (remainingRunInProgress(run) && !getBatchJob(assignId)?.jobId) {
          patchBatchJob(assignId, (prev) => ({
            ...prev,
            engine: prev?.engine || engine,
            firstBatch: {
              ...(prev?.firstBatch || fb || {}),
              status: "confirming",
              remainingRun: run,
            },
          }));
          await followRemainingRun(assignId, engine);
        }
      } catch {
        // Status endpoint is best-effort; active-job check above still runs.
      }
    })();
  }, [selectedAssignment?._id]); // runs whenever selected assignment changes



  const pollBatchJob = async (jobId, jobMeta = {}) => {
    const assignId = jobMeta.assignmentId || selectedAssignment?._id;
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
                        assignedGrade: resolveTotalMarksFromResult(enrichedResult),
                        aiGrade: resolveTotalMarksFromResult(enrichedResult),
                      }
                    : s
                )
              );
              setSavedResults((prev) => ({
                ...prev,
                [student.submissionId]: {
                  status: "done",
                  result: enrichedResult,
                  aiOriginalResult: originalAiResult,
                  totalMarks: resolveTotalMarksFromResult(enrichedResult),
                },
              }));
            }

            await api.post("/submission-files/save-results", {
              assignmentId: assignId,
              submissionId: student.submissionId,
              studentId: student.studentId,
              // v2 returns studentName; v1 returns name.
              studentName: student.name || student.studentName,
              mode: saveMode,
              provider: isV2(jobEngine) ? "gemini-v2-batch" : "gemini-batch",
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
            /* list still has in-memory savedResults from above */
          }
          const { fetchPage, page } = pollCtxRef.current;
          fetchPage?.(page);
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


// ── Submit batch — memory setup + upload + submit, then hand off to pollBatchJob
const runBatchMark = async (guidanceText, mode = "normal", modelOverride = null, engine = "v1") => {
  const base = engineBasePath(engine);
  const selectedModel = pickValidGeminiModel(
    geminiModels,
    modelOverride || geminiModel
  );

  // 00b30c1: sync model state if it changed
  if (selectedModel !== geminiModel) {
    setGeminiModel(selectedModel);
  }

  // 00b30c1: fetch students (all or selected) across pages
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
  // Papers the orientation review excluded are dropped from `eligible` here, so
  // every step below (upload, batch, progress) sees only what will be marked.
  const toGrade = await confirmPreGradingChecks(eligible);
  if (!toGrade) return;
  eligible = toGrade;

  // Same gate as the old toolbar button: compare mark scheme to sample papers
  // before uploading the batch. User can continue anyway if it fails.
  const msOk = await confirmBatchMarkScheme(selectedAssignment._id);
  if (!msOk) {
    toast.info("Batch marking stopped — mark scheme was not accepted");
    return;
  }

  const guidanceValue = guidanceForForm(guidanceText);
  const assignId = selectedAssignment._id;

  setBatchStopped(assignId, false);

  patchBatchJob(assignId, {
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

  // Step 1 — upload student PDFs + mark scheme.
  // v2 additionally indexes the mark scheme, windows each script, and uploads
  // every mark-scheme page separately, so this step takes longer and returns
  // msPageUris alongside the whole-scheme msUri.
  let msUri, msPageUris, succeeded, failed, zeroed;
  try {
    const res = await api.post(`${base}/mark-batch/upload`, {
      assignmentId: selectedAssignment._id,
      markingMode: mode,          // HEAD: included for zeroed detection
      chunkSize: resolveMarkingChunkSize(selectedModel),
      students: eligible.map(s => ({
        submissionId: s.submissionId,
        studentId:    s.studentId,
        name:         s.name,
        studentName:  s.name,     // v2 reads studentName; v1 ignores it
        state:        s.state,   // HEAD: included for zeroed detection
      })),
    }, { timeout: 900_000 });
    ({ msUri, msPageUris, succeeded, failed, zeroed } = res.data);
  } catch (err) {
    const message = recordMarkingErrorsForStudents(
      eligible,
      err,
      "Upload failed"
    );
    toast.error(`Upload failed: ${message}`);
    patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
    return;
  }

  if (isBatchStopped(assignId)) {
    patchBatchJob(assignId, null);
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
    patchBatchJob(assignId, (prev) => ({
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
    patchBatchJob(assignId, (prev) => ({ ...prev, skipped }));
  }

  if (!succeeded?.length) {
    if (zeroed?.length) {
      patchBatchJob(assignId, (prev) => ({ ...prev, phase: "done" }));
      toast.success(`Batch complete — ${zeroed.length} student(s) awarded 0 (no submission PDF).`);
      return;
    }
    const message = "No valid submissions to mark.";
    recordMarkingErrorsForStudents(eligible, null, message);
    toast.error(message);
    patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
    return;
  }

  if (isBatchStopped(assignId)) {
    patchBatchJob(assignId, null);
    toast.info("Batch marking stopped");
    return;
  }

  // Step 2 — submit job (with overload retries)
  patchBatchJob(assignId, (prev) => ({ ...prev, phase: "submitting" }));

  const submitPayload = {
    assignmentId:  selectedAssignment._id,
    msUri,
    succeeded,
    markingMode:   mode,
    guidance:      guidanceValue,
    ...examBoardGuidance.getExamBoardFields(),
    geminiModel:   selectedModel,
    subjectId:     selectedAssignment.subjectId,
    ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
    classroomId:   selectedClassroom?._id ?? selectedAssignment?.classroomId,
    chunkSize: resolveMarkingChunkSize(selectedModel),
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
        return { jobId: res.data.jobId, resumed: false, firstBatch: res.data.firstBatch };
      } catch (err) {
        if (err.response?.data?.reason === "first_batch_pending") {
          return { firstBatchBlocked: true, firstBatch: err.response.data.firstBatch };
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
    patchBatchJob(assignId, (prev) => ({ ...prev, phase: "error" }));
    return;
  }

  if (submitResult.result.firstBatchBlocked) {
    toast.info("This assignment's first batch is awaiting confirmation.");
    patchBatchJob(assignId, (prev) => ({
      ...prev,
      phase: "done",
      firstBatch: submitResult.result.firstBatch,
    }));
    return;
  }

  const { jobId, resumed, firstBatch } = submitResult.result;
  if (resumed) {
    toast.info("Resuming existing batch job...");
  }

  patchBatchJob(assignId, (prev) => ({
    ...prev,
    phase: "processing",
    jobId,
    firstBatch,
    batchStudents: succeeded.map((r) => r.student),
  }));

  // Step 3 — hand off to standalone poller
  pollBatchJob(jobId, {
    assignmentId: assignId,
    mode,
    engine,
    geminiModel: selectedModel,
    batchStudents: succeeded.map((r) => r.student),
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
  try {
    const loaded = await resolveEligibleForMarking(true);
    if (!loaded) return;
    eligible = loaded.eligible;
  } catch (err) {
    toast.error(extractHumanError(err) || "Failed to check eligible students");
    return;
  }

  // Advisory page-count check before spending AI tokens on possibly-wrong files.
  // Papers the orientation review excluded are dropped from `eligible` here.
  const toGrade = await confirmPreGradingChecks(eligible);
  if (!toGrade) return;
  eligible = toGrade;

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
      ...examBoardGuidance.getExamBoardFields(),
      geminiModel: selectedModel,
      subjectId:   selectedAssignment.subjectId,
      ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
      classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      chunkSize: resolveMarkingChunkSize(selectedModel),
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
    const aggregateCost = canViewMoneyCostsFromStorage()
      ? data.aggregateEstimatedCost
      : null;
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


// Resume polling is handled by checkForActiveJob when the assignment is selected.

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
        maxTotalMarks: effectiveMaxTotal,
        summary: resolvePdfSummary(submissionId, resultModal.result),
        outOfScopeNotes: getOutOfScopeNotes(resultModal.result),
        teacherAnnotations: getTeacherAnnotations(resultModal.result),
        criteriaGrade: editingCriteriaGrade || resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
      });

      downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `${resultModal.student.name || "student"}_graded.pdf`);
      toast.success("Downloaded");
    } catch (err) {
      toast.error(await getApiErrorMessage(err) || "Failed to download PDF");
    } finally { setDownloading(false); }
  };

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
    setEditingTotal(null);
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
    setEditorSubmissionId(sid);
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

      const assignmentKey = selectedAssignment?._id;
      if (getBatchJob(assignmentKey)?.results?.[submissionId]) {
        patchBatchJob(assignmentKey, (job) => ({
          ...job,
          results: {
            ...job.results,
            [submissionId]: { ...job.results[submissionId], result: finalResult },
          },
        }));
      }
    },
    [selectedAssignment?._id]
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
      assignmentId: selectedAssignment._id,
      submissionId,
      studentId: studentId ?? resultModal?.student?.studentId,
      studentName: studentName ?? resultModal?.student?.name,
      mode: mode || finalResult.markingMode || markingModeModal,
      provider: provider || markingProvider,
      result: finalResult,
      ...(origin ? { origin } : {}),
    });
    // Backend returns the canonical FINAL RESULT — use it everywhere after save.
    const canonical = data?.finalResult || data?.data?.result || finalResult;
    const summary = canonical.summary?.trim();
    // MarkedMeta only caches this string; re-posting the one already stored is
    // a round trip that changes nothing.
    if (summary && summary !== savedResults[submissionId]?.summary?.trim()) {
      await api.post("/submission-files/save-summary", {
        assignmentId: selectedAssignment._id,
        submissionId,
        summary: canonical.summary,
      });
    }
    return { canonical, saved: data?.data || null };
  };

  const handleConfirmEdits = async () => {
    if (!resultModal || !selectedAssignment?._id) return;
    const appliedQuestions = questionsForConfirmEdits(
      editingQuestions,
      pendingRemovedIndices
    ).map((q) => ({ ...q }));
    const startedFor = resultModalSubmissionId;
    try {
      const finalResult = await confirmEdits(async ({ finalResult, submissionId }) => {
        const sid = resultModal.student.submissionId || submissionId;
        const { canonical, saved } = await persistMarkingResult(finalResult, sid);
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
      const db = savedResults[resultModal.student?.submissionId];
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;

      const googleUserId = studentGoogleUserId(resultModal.student);

      // A paper auto-marked 0 for a missing submission has nothing to annotate.
      // It still has to go back — the grade IS the result.
      let gradeOnly = Boolean(resultModal.result?.noSubmission);
      let studentFile = resultModal.studentFile;

      if (!gradeOnly && !studentFile && submissionId) {
        try {
          const pdfRes = await api.get("/submission-files/pdf", {
            params: {
              assignmentId: selectedAssignment._id,
              submissionId,
              googleUserId: googleUserId || undefined,
            },
            responseType: "blob",
          });
          studentFile = new File(
            [pdfRes.data],
            `${resultModal.student?.name || "student"}.pdf`,
            { type: "application/pdf" }
          );
        } catch (err) {
          if (await isNoAttachmentError(err)) gradeOnly = true;
          else throw err;
        }
      }

      const totalMarks = resolveAnnotatePdfTotalMarks({
        questions: editingQuestions,
        criteriaGrade: editingCriteriaGrade || resultModal.result?.criteriaGrade,
        markingMode: resultModal.result?.markingMode || "normal",
      });
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
        fd.append("annotatedPdf", new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      } else {
        fd.append("gradeOnly", "1");
      }
      fd.append("assignmentId", selectedAssignment._id);
      fd.append("submissionId", resultModal.student.submissionId || submissionId);
      fd.append("totalMarks", totalMarks);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName", resultModal.student.name || "Student");
      if (googleUserId) {
        fd.append("googleUserId", String(googleUserId));
      }
      appendClassroomGradeToFormData(fd, {
        submissionId: resultModal.student.submissionId || submissionId,
        student: resultModal.student,
        gradeOverrides,
        savedResults,
        classroomSyncedGrades,
        fallbackTotal: totalMarks,
        maxPoints: selectedAssignment?.maxPoints ?? effectiveMaxTotal,
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
        timeout: 600000,
      });

      const submissionKey = resultModal.student.submissionId || submissionId;
      // Returning attaches (or rewrites) a marked PDF on the submission, so the
      // cached download is no longer necessarily what /pdf would hand back.
      invalidateStudentPdf(selectedAssignment._id, submissionKey);
      const returnedAt = new Date().toISOString();
      setSavedResults((prev) => ({
        ...prev,
        [submissionKey]: {
          ...(prev[submissionKey] || {}),
          returnedAt,
        },
      }));
      setBulkProgress((prev) => {
        if (!prev[submissionKey]) return prev;
        return {
          ...prev,
          [submissionKey]: { ...prev[submissionKey], returned: true },
        };
      });

      toast.success("Marked paper returned to student");
      setResultModal(null);
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to return paper");
    } finally {
      setReturning(false);
    }
  };

  const handleReturnAll = async () => {
    if (!studentsMarkingUrl || !selectedAssignment?._id) {
      toast.error("Select an assignment first");
      return;
    }

    if (hasPendingEdits) {
      toast.warn("Save & regenerate PDF first so returned PDFs match the preview");
      return;
    }

    const assignmentId = selectedAssignment._id;

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

  const getScoreColor = (awarded, max) => {
    if (!max) return "var(--primary)";
    const pct = awarded / max;
    if (pct >= 0.75) return "var(--success)";
    if (pct >= 0.5)  return "var(--warning)";
    return "var(--danger)";
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
      downloadBlob(new Blob([res.data], { type: "application/pdf" }), `${student.name || "submission"}.pdf`);
    }).catch(() => toast.error("Failed to download PDF"));
  };

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

  const statusBadge = (student) => <SubmissionStatusBadge student={student} />;


  const resolveBatchStudentForReturn = (submissionId) => {
    const fromPage = students.find(s => s.submissionId === submissionId);
    if (fromPage) return fromPage;
    const fromBatch = batchJob?.batchStudents?.find(s => s.submissionId === submissionId);
    if (fromBatch) return fromBatch;
    return { submissionId, name: "Student" };
  };

  const returnAllToStudents = async (prebuiltQueue, freshSavedResults = null) => {
    if (!selectedAssignment?._id) {
      toast.error("Assignment not loaded");
      return { successCount: 0, failures: [{ reason: "Assignment not loaded" }] };
    }

    const assignmentId = selectedAssignment._id;
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
      maxGradeFallback: selectedAssignment?.maxPoints,
      gradeContext: {
        gradeOverrides,
        savedResults: mergedSaved,
        classroomSyncedGrades,
        maxPoints: selectedAssignment?.maxPoints ?? null,
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
            if (next[key]) next[key] = { ...next[key], returned: true };
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

  if (!user) {
    return (
      <div className="ma-root" style={{ alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
        <p className="ma-loading-msg">Loading submission viewer…</p>
      </div>
    );
  }

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
  const total =
    editingTotal !== null && Number.isFinite(Number(editingTotal))
      ? Number(editingTotal)
      : isCriteria && editingCriteriaGrade
        ? summedTotal
        : !hasPendingEdits && storedFinal != null
          ? storedFinal
          : summedTotal;
  const coverTotal =
    isCriteria && editingCriteriaGrade
      ? Number(editingCriteriaGrade.totalMarks) || 0
      : Number(resultModal?.result?.criteriaGrade?.totalMarks ?? resultModal?.result?.totalMarks);
  const paperTotal =
    isCriteria && editingCriteriaGrade
      ? Number(editingCriteriaGrade.totalMarks) || 0
      : sumQuestionMarks(questionsForDisplay);
  const totalMismatch =
    !hasPendingEdits &&
    !previewLoading &&
    questionsForDisplay.length > 0 &&
    Number.isFinite(coverTotal) &&
    Number.isFinite(paperTotal) &&
    coverTotal !== paperTotal
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
            <h1 className="ma-topbar-title">
              {isDirectorScope
                ? "All Classrooms Submission Viewer"
                : isTeacherScope
                  ? "My Classrooms Submission Viewer"
                  : "Submission Viewer"}
            </h1>
            <span className="ma-topbar-sub">
              {selectedClassroom
                ? selectedAssignment
                  ? `${selectedClassroom.name} — ${selectedAssignment.title}`
                  : `Select assignment from ${selectedClassroom.name}`
                : isDirectorScope
                  ? "Browse submissions across all classrooms"
                  : isTeacherScope
                    ? "Browse submissions for your classrooms"
                    : `Welcome back, ${user.name}`}
            </span>
          </div>
          <div className="ma-topbar-right">
            {selectedAssignment && showMarkingTools && (
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
                {!isTeacherScope && (isDirectorScope || teacherOptions.length > 0) && (
                  <ReportTeacherFilterSelect
                    show
                    value={teacherFilter}
                    onChange={setTeacherFilter}
                    teachers={teacherOptions}
                  />
                )}
                <div className="ma-scroll-list">
                  {loadingClassrooms && !classrooms.length ? (
                    <p className="ma-empty-msg">Loading classrooms…</p>
                  ) : !classrooms.length ? (
                    <p className="ma-empty-msg">No classrooms found</p>
                  ) : null}
                  {classrooms.map(c => (
                    <div key={c._id} className={`ma-classroom-card ${selectedClassroom?._id === c._id ? "ma-classroom-card--active" : ""}`} onClick={() => selectClassroom(c)}>
                      <div className="ma-classroom-icon"><FiUsers size={15} /></div>
                      <div className="ma-classroom-info">
                        <span className="ma-classroom-name">{c.name}</span>
                        {c.section && <span className="ma-classroom-section">{c.section}</span>}
                        {c.teacherId?.name && (
                          <span className="msv-classroom-teacher">Teacher: {c.teacherId.name}</span>
                        )}
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
                  {isTeacherScope ? (
                  <div className="msv-ms-bar">
                    <div className="msv-ms-info">
                      <div className="msv-ms-title">📋 Student submissions</div>
                      <div className="msv-ms-status msv-ms-status--ok">
                        View results and return graded papers to students
                      </div>
                    </div>
                    {!bulkMarking && (
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
                  </div>
                  ) : (
                  <div className="msv-ms-bar">
                    <div className="msv-ms-info">
                      <div className="msv-ms-title">📋 Mark Scheme</div>
                      <div className={`msv-ms-status ${msInfo ? "msv-ms-status--ok" : ""}`}>
                        {msInfo ? "✅ Uploaded — ready for AI marking" : "No mark scheme uploaded yet"}
                      </div>
                    </div>
                    <input
                      ref={msInputRef}
                      type="file"
                      accept=".pdf,.kami,.kmi"
                      style={{ display: "none" }}
                      onChange={(e) => handleMsUpload(e.target.files[0])}
                    />
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
                        }}
                      >
                        View Mark Scheme
                      </button>
                    )}

                    {/* Non-batch "Mark All Students" removed — keep only batch marking */}
                 {/* Return All */}
                  {!bulkMarking && (isTeacherScope || msInfo || hasGradedWork) && (
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
                      {canPickChunkSizeIndependently ? (
                        <select
                          className="msv-gemini-select"
                          value={directorChunkSize}
                          onChange={(e) => setDirectorChunkSize(Number(e.target.value))}
                          disabled={bulkMarking || batchStarting}
                          title="Pages per AI request (batch, single, and bulk marking)"
                          style={{ minWidth: 120 }}
                        >
                          {pickableChunkSizes().map((n) => (
                            <option key={n} value={n}>
                              {n === 0 ? "Full PDF (1 request)" : `${n} page${n !== 1 ? "s" : ""} / request`}
                            </option>
                          ))}
                        </select>
                      ) : (
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
                      )}
                      <select
                        className="msv-gemini-select"
                        value={pickValidGeminiModel(geminiModels, geminiModel)}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        disabled={bulkMarking || batchStarting}
                        title="Sahahly model for batch marking"
                        style={{ minWidth: 250, maxWidth: 420 }}
                      >
                        {(geminiModels.length
                          ? geminiModels
                          : [{ id: geminiModel, label: geminiModel }]
                        ).map((m) => (
                          <option key={m.id} value={m.id} title={sahahlyModelLabel(m)}>
                            {geminiDropdownLabel(m)}
                          </option>
                        ))}
                      </select>
                        <button
                          type="button"
                          className="msv-btn-ai"
                          onClick={() => {
                            if (batchJob?.phase === "processing") {
                              toast.info("Checking status…");
                              pollBatchJob(batchJob.jobId, {
                                assignmentId: selectedAssignment._id,
                                mode: batchJob.mode,
                                engine: batchJob.engine,
                                geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
                                batchStudents: batchJob.batchStudents,
                              }); // "Check now" behaviour
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

                  {/* PRIORITY MARKING (whole class, synchronous) */}
                  {msInfo && PRIORITY_ALLOWED_IDS.includes(currentUserId()) && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 10 }}>
                      <button
                        className="msv-btn-ai"
                        onClick={() => openGuidanceModal(null, false,"priorityBulk")}
                        disabled={bulkMarking || priorityBulkRunning}
                        title="Mark whole class on Sahahly priority tier (fastest, premium)"
                        style={{ background: "var(--warning)", borderColor: "var(--warning)", color: "#fff" }}
                      >
                        {priorityBulkRunning
                          ? <><span className="pm-spinner" /> Priority marking…</>
                          : <><FiSend size={13} /> {markingActionLabel("Mark All (Priority)", "Mark Selected (Priority)", markingSelection.selectedCount)}</>}
                      </button>
                      {priorityBulkRunning && (
                        <button
                          className="msv-btn-ai"
                          onClick={stopPriorityBulk}
                          style={{
                            background: "var(--danger)",
                            borderColor: "var(--danger)",
                            color: "#fff",
                          }}
                        >
                          <FiX size={13} /> Stop
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
    {/* Manual re-poll button in case user is impatient */}
    {/* {batchJob.phase === "processing" && (
      <button
        onClick={() => pollBatchJob(batchJob.jobId)}
        style={{ marginLeft: "auto", fontSize: 11, color: "var(--primary)",
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
                                    assignmentId: selectedAssignment._id,
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

                                </div> )}
                                {batchJob?.phase === "done" &&
                                  (batchJob?.firstBatch?.status === "pending_confirmation" ||
                                    batchJob?.firstBatch?.status === "confirming") && (
                                  <div style={{
                                    marginTop: 8, padding: "10px 14px", borderRadius: 10,
                                    background: "color-mix(in srgb, var(--success, #16a34a) 10%, transparent)",
                                    border: "1px solid color-mix(in srgb, var(--success, #16a34a) 30%, transparent)",
                                    fontSize: 12, color: "var(--text-secondary)",
                                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
                                  }}>
                                    {batchJob.firstBatch.status === "confirming" ? (
                                      <span>{remainingRunLabel(batchJob.firstBatch.remainingRun, "confirming")}</span>
                                    ) : (
                                      <>
                                    <span>
                                      ✅ {batchJob.firstBatch.limit ?? 3} paper{(batchJob.firstBatch.limit ?? 3) === 1 ? "" : "s"} marked as a safety
                                      check on this new assignment. Review them, then confirm to mark the remaining{" "}
                                      {batchJob.firstBatch.remainingCount ?? "the rest"}.
                                    </span>
                                    <button
                                      onClick={confirmFirstBatch}
                                      disabled={batchJob.firstBatch.status === "confirming"}
                                      style={{
                                        marginLeft: "auto", fontSize: 11, fontWeight: 600,
                                        color: "#fff", background: "var(--success, #16a34a)",
                                        border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                                        opacity: batchJob.firstBatch.status === "confirming" ? 0.6 : 1,
                                      }}
                                    >
                                      {batchJob.firstBatch.status === "confirming" ? "Confirming…" : "Confirm & Mark Rest"}
                                    </button>
                                      </>
                                    )}
                                  </div>
                                )}
                                {(batchJob?.firstBatch?.status === "confirmed_pending" ||
                                  batchJob?.firstBatch?.status === "remaining_failed") && (
                                  <div style={{
                                    marginTop: 8, padding: "10px 14px", borderRadius: 10,
                                    background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                                    border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                                    fontSize: 12, color: "var(--text-secondary)",
                                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                                  }}>
                                    <span>
                                      {remainingRunLabel(
                                        batchJob.firstBatch.remainingRun,
                                        batchJob.firstBatch.status
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={retryFirstBatchRemaining}
                                      style={{
                                        marginLeft: "auto", fontSize: 11, fontWeight: 600,
                                        color: "#fff", background: "var(--primary)",
                                        border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                                      }}
                                    >
                                      Retry remaining
                                    </button>
                                  </div>
                                )}
                                          </div>
                  )}

                  {/* Expected Pages */}
                  {showMarkingTools && (
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
                  )}

                  {/* Board / paper code / paper — recorded on every corrected
                      question for this assignment. Self-contained component so
                      this page and the assistant viewer cannot drift apart. */}
                  {showMarkingTools && (
                    <ClassroomPaperMetadataBar
                      assignmentId={selectedAssignment._id}
                      assignment={selectedAssignment}
                      onSaved={(values) =>
                        setSelectedAssignment((prev) => (prev ? { ...prev, ...values } : prev))
                      }
                    />
                  )}

                  <div className="ma-panel-header">
                    <div className="ma-panel-title-wrap">
                      <div className="ma-panel-dot" />
                      <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                      <span className="ma-panel-count">{studentTotal} students</span>
                      <span className="ma-panel-count">
                        {loadingStudents ? "Counting PDFs…" : `Corrected ${correctedPdfCount} / ${actualPdfCount} PDFs`}
                      </span>
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
                        <span className="msv-refresh-btn-label">{refreshing ? "Refreshing…" : "Refresh"}</span>
                      </button>
                    </div>
                  </div>

                  {showMarkingTools && (
                  <MarkingSelectionBar
                    selectedCount={markingSelection.selectedCount}
                    pageSelectableCount={pageSelectableIds.length}
                    pageAllSelected={pageAllMarkingSelected}
                    onTogglePage={toggleMarkingSelectPage}
                    onSelectAll={selectAllStudentsForMarking}
                    onClear={markingSelection.clear}
                    selectingAll={selectingMarkingAll}
                  />
                  )}

                  {loadingStudents && <p className="ma-loading-msg">Loading students…</p>}
                  {!loadingStudents && students.length === 0 && (
                    <p className="ma-empty-msg">
                      {studentSearch
                        ? `No students match "${studentSearch}".`
                        : studentFetchError
                          ? "Could not load students. Check your Google Classroom connection."
                          : studentTotal === 0
                            ? "No students synced for this classroom. Open Students Data and run Sync."
                            : "No students found."}
                    </p>
                  )}

                  {!loadingStudents && students.length > 0 && (
                    <div className="ma-table-wrap">
                      <div className="ma-table-scroll">
                        <table className="ma-table ma-table--cards">
                          <thead>
                            <tr>
                              {showMarkingTools && (
                                <th style={{ width: 44 }} aria-label="Select for marking" />
                              )}
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
                                                  // only show as queued if this student was in the batch
                                                  batchJob?.total > 0;


                              const hasResult = !!(single?.status === "done" || db?.result);
                              const isMarking = single?.status === "marking" || markingStudentId === s.submissionId;
                              const hasError = single?.status === "error" || studentErrors[s.submissionId];

                              const markingLoading = isMarking || rowIsBulkMarking || bulkRetrying ||markingStudentId === s.submissionId || batchQueued;
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
                                <tr key={`${s.submissionId || s.googleUserId || s._id || "row"}-${i}`} className="ma-row" style={{ animationDelay: `${i * 0.025}s` }}>
                                  {showMarkingTools && (
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
                                  )}
                                  <td>
                                    <div className="ma-avatar-cell">
                                      <div className="ma-avatar">{(s.name || "?").charAt(0).toUpperCase()}</div>
                                      <span className="ma-cell-name">{s.name || "—"}</span>
                                      {(() => {
                                        const savedWarn = savedResults[s.submissionId]?.result?.fileWarning;
                                        const pageFlagText = pageCountWarningText(pageCountFlags[s.submissionId]);
                                        const orientationFlagText = orientationWarningText(orientationFlags[s.submissionId]);
                                        const totalMismatchText = totalMarksMismatchInfo(savedResults[s.submissionId]?.result)?.message;
                                        if (!savedWarn && !pageFlagText && !orientationFlagText && !totalMismatchText) return null;
                                        const title = pageFlagText
                                          || orientationFlagText
                                          || totalMismatchText
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
                                  <td data-label="Submitted"><span className="ma-cell-muted">{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}</span></td>
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
                                        
                                        {/* Results — teachers and managers when any source has marks */}
                                        {(bulkDone || batchDone || single?.status === "done" || db?.result) && (
                                          <button
                                            className="msv-action-btn msv-action-btn--ai msv-action-btn--done"
                                            title="View Results"
                                            onClick={() => {
                                              const savedCanonical =
                                                savedResults[s.submissionId]?.result ?? db?.result;
                                              const result =
                                                savedCanonical ??
                                                (batchDone ? batch.result :
                                                bulkDone ? bulk.result :
                                                single?.status === "done" ? single.result :
                                                null);
                                              const studentFile =
                                                bulkDone ? bulk.studentFile :
                                                single?.status === "done" ? single.studentFile :
                                                null;
                                              // Only a marking run made this
                                              // session holds a distinct AI
                                              // baseline. A paper loaded from the
                                              // DB has none: the list response no
                                              // longer ships one, because a second
                                              // full copy of every paper was the
                                              // single biggest thing on it.
                                              const originalAiResult =
                                                (batchDone ? batch?.originalAiResult : null) ??
                                                (bulkDone ? bulk?.originalAiResult : null) ??
                                                (single?.status === "done" ? single?.originalAiResult : null) ??
                                                null;
                                              openResultsModal({
                                                student: s,
                                                result,
                                                studentFile,
                                                originalAiResult,
                                                submissionId: s.submissionId,
                                              });
                                            }}
                                          >
                                            ✅ Results
                                          </button>
                                        )}

                                        {showMarkingTools && db?.result && (
                                          <button
                                            className="msv-action-btn msv-action-btn--delete"
                                            title="Delete Correction"
                                            onClick={() => deleteCorrection(s)}
                                            disabled={deletingCorrection[s.submissionId] || markingLoading}
                                          >
                                            {deletingCorrection[s.submissionId] ? <span className="pm-spinner" /> : "🗑 Delete"}
                                          </button>
                                        )}

                                        {showMarkingTools && msInfo && (
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
                                        {/* Priority single mark */}
                                        {PRIORITY_ALLOWED_IDS.includes(currentUserId()) && (
                                          <button
                                            className="msv-action-btn msv-action-btn--ai"
                                            title="Mark on Sahahly priority tier (fastest, premium)"
                                            onClick={() => openGuidanceModal(s,false, "priority")}
                                            disabled={markingLoading || priorityBulkRunning}
                                            style={{ background: "var(--warning)", borderColor: "var(--warning)", color: "#fff" }}
                                          >

                                            <FiSend size={12} /> Mark (Priority)
                                            </button>
                                            )}
                                        {/* Single mark on gradingv2 — returns immediately,
                                            so this is the way to compare engines on one student. */}
                                        {canMarkV2 && (
                                          <button
                                            className="msv-action-btn msv-action-btn--ai"
                                            title="Mark with gradingv2 (overlapping windows, paired mark-scheme pages)"
                                            onClick={() => openGuidanceModal(s, false, "v2")}
                                            disabled={markingLoading || priorityBulkRunning}
                                            style={{ background: "var(--accent, #7c3aed)", borderColor: "var(--accent, #7c3aed)", color: "#fff" }}
                                          >
                                            <FiLayers size={12} /> Mark v2
                                          </button>
                                        )}
                                        {showAiReview && (
                                          <button
                                            className="msv-action-btn"
                                            title="AI Review"
                                            onClick={() => runAiReview(s, rowMarkingCtx)}
                                            disabled={aiReviewing || markingLoading}
                                            style={{
                                              background: "var(--warning)",
                                              borderColor: "var(--warning)",
                                              color: "#fff",
                                              opacity: aiReviewing ? 0.7 : 1,
                                            }}
                                          >
                                            {aiReviewing ? "Reviewing…" : "AI Review"}
                                          </button>
                                        )}

                                        {inlineMarkResult?.tokenUsage && (
                                          <TokenUsageStats result={inlineMarkResult} compact />
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
                      </div>
                    </div>
                  )}
                  {!loadingStudents && students.length > 0 && (
                    <Pagination
                      page={studentPage}
                      totalPages={studentTotalPages}
                      onPageChange={fetchStudentPage}
                      showAllPages
                    />
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
                            {guidanceModal.priorityBulk ? "🚀 Mark All Students (Priority)" :
                            guidanceModal.priority     ? `🚀 Mark (Priority) — ${guidanceModal.student?.name}` :
                            guidanceModal.v2           ? `🧪 Mark (v2) — ${guidanceModal.student?.name}` :
                            guidanceModal.engine === "v2" ? "🧪 Mark All Students (Batch v2)" :
                            guidanceModal.batch        ? "⚡ Mark All Students (Batch)"  :
                            guidanceModal.bulk         ? "🤖 Mark All Students"           :
                                                          `🤖 Mark — ${guidanceModal.student?.name}`}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                            {guidanceModal.priorityBulk
                              ? `Marks all ${students.filter(s => s.submissionId).length} students on Sahahly priority tier — fastest, premium (~+${Math.round((PRIORITY_RATE_FACTOR - 1) * 100)}%)`
                              : guidanceModal.priority
                              ? `Priority tier — fastest/most reliable, premium (~+${Math.round((PRIORITY_RATE_FACTOR - 1) * 100)}%)`
                              : guidanceModal.v2
                              ? "Experimental engine — marks in overlapping 2-page windows, each sent only the mark-scheme pages it needs. Returns immediately."
                              : guidanceModal.engine === "v2"
                              ? `Experimental engine — overlapping 2-page windows, paired mark-scheme pages, on the batch API (~50% cheaper). Preparation takes longer than v1: ${studentTotal} students in class`
                              : guidanceModal.batch
                              ? `Submits all eligible students in this assignment to Sahahly batch (~50% cheaper) — ${studentTotal} students in class`
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
                    <option key={m.id} value={m.id} title={sahahlyModelLabel(m)}>
                      {geminiDropdownLabel(m)}
                    </option>
                  ))}
                </select>
                <p style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                  {guidanceModal.batch
                    ? "Used for the Sahahly batch job (~50% cheaper than sequential marking)."
                    : "Used when you start marking with Sahahly. Flash Lite models are cheaper and faster."}
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
                    onClick={e => { e.stopPropagation(); setPromptDropdownOpen(v => !v); }}
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
                      {guidanceModal.bulk ? "Start Marking All with Sahahly" : "Start Marking with Sahahly"}
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
                      background: "var(--warning)", borderColor: "var(--warning)", color: "#fff",
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
                    background: isCriteria ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "color-mix(in srgb, var(--primary) 15%, transparent)",
                    color: isCriteria ? "var(--accent)" : "var(--primary)",
                    border: `1px solid ${isCriteria ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "color-mix(in srgb, var(--primary) 30%, transparent)"}`
                  }}>
                    {isCriteria ? "🎯 Criteria Marking" : "📋 Normal Marking"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Final Grade:</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
                  {/*
                    Save sits beside Reset because this is where the edit is
                    made and where "Unsaved edits" appears. The full button in
                    the toolbar is the same action — offering only Reset next to
                    the warning meant the nearest control to an unsaved change
                    was the one that discards it.
                  */}
                  {hasPendingEdits && (
                    <button
                      onClick={handleConfirmEdits}
                      disabled={confirmingEdits || previewLoading}
                      title="Save these marks and rebuild the annotated PDF"
                      style={{
                        fontSize: 11,
                        padding: "2px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--success)",
                        background: "var(--success)",
                        color: "#fff",
                        fontWeight: 600,
                        cursor: confirmingEdits || previewLoading ? "default" : "pointer",
                        opacity: confirmingEdits || previewLoading ? 0.6 : 1,
                      }}
                    >
                      {confirmingEdits ? "Saving…" : "Save"}
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
                {showMarkingTools && (
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
                )}
                {showMarkingTools && (
                  <>
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
                  </>
                )}
                {/*
                  NOT gated on showMarkingTools, unlike the undo/redo/annotate
                  buttons above.

                  It used to be, and teacher scope (scope="teacher", the
                  /teacher/submissions route) sets showMarkingTools false — so a
                  teacher could edit the grade, was told "Unsaved edits", and was
                  offered Reset to throw the work away, while the only control
                  that would KEEP it was hidden. Every other control in that row
                  is ungated, so hiding this one alone made editing a dead end.

                  Saving is not gated server-side either: POST
                  /api/submission-files/save-results carries no role check, so
                  this was never a permission boundary — only a missing button.
                */}
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

              {/* ── TOKEN USAGE ── */}
              {/* {resultModal.result.tokenUsage && (
                <div style={{ display: "flex", gap: 16, marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginRight: 4, alignSelf: "center" }}>🔢 Tokens:</div>
                  {[
                    { label: "Input",  value: resultModal.result.tokenUsage.inputTokens  },
                    { label: "Output", value: resultModal.result.tokenUsage.outputTokens },
                    { label: "Total",  value: resultModal.result.tokenUsage.totalTokens  },
                  ].map(t => (
                    <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{t.value?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )} */}

                {/* AI TOKEN USAGE*/}
              <TokenUsageStats result={resultModal.result} />

              {selectedAssignment?._id && (
                <MarkingCorrectionChat
                  assignmentId={selectedAssignment._id}
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

              {/* Edits every paper in the assignment, so it is gated on the
                  marking tools like the rest of the editor. Applying rewrites
                  the paper on screen too — close the modal rather than leave
                  stale marks that Confirm Edits would write back over it. */}
              {showMarkingTools && selectedAssignment?._id && (
                <BulkQuestionEditChat
                  source="classroom"
                  assignmentId={selectedAssignment._id}
                  assignmentName={selectedAssignment.title}
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
                  toast.success(`Added Q${q.questionNumber}`);
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {questionsForDisplay.map((q) => (
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
                            openExternalLabel="Open in Kami"
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

      {/* ── AI REVIEW COMPARISON MODAL ── */}
      {aiReviewModal && (
        <div className="msv-overlay" style={{ zIndex: 1100 }} onClick={closeAiReviewModal}>
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
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {aiReviewModal.flagged.length} question{aiReviewModal.flagged.length !== 1 ? "s" : ""} with grade discrepancies
                </div>
              </div>
              <button className="msv-icon-btn" onClick={closeAiReviewModal}><FiX size={16} /></button>
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
                          <QuestionNumberBadge question={item} guidance={assignmentPrompt.content} allQuestions={questionsForDisplay} />
                          {item.resolution == null && (
                            <span style={{ fontSize: 11, color: "var(--warning)" }}>Unresolved</span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                              {providerDisplayLabel(aiReviewModal.provider)}
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>
                              {item.existingMarks ?? "—"}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                              AI Review
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--warning)" }}>
                              {item.qwenMarks ?? "—"}
                            </span>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
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
                              borderColor: item.resolution === "keep" ? "var(--primary)" : undefined,
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
                              background: "var(--warning)",
                              borderColor: "var(--warning)",
                              color: "#fff",
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
                              background: `color-mix(in srgb, ${color} 15%, transparent)`,
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
                    color: "var(--text-secondary)",
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
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>
                    Loading PDF…
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--border)",
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