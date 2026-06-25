import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { annotatePdf } from "../../utils/annotatePdf";
import {
  FiUsers, FiClipboard, FiDownload, FiEye, FiCpu,
  FiUploadCloud, FiX, FiCalendar, FiSend,FiLayers, FiAlertCircle,FiCheck
} from "react-icons/fi";
import ManagerSidebar from "../../components/ManagerSidebar";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";
import {
  appendMarkingContext,
  assertPdfBlob,
  buildFinalMarkingResult,
  buildBatchMarkingResult,
  buildPriorityMarkingResult,
  buildNoSubmissionMarkingResult,
  currentUserId,
  getApiErrorMessage,
  guidanceForForm,
  hasTeacherEdits,
  isStudentSubmitted,
  normalizeGuidance,
} from "../../utils/markingFormData";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import TokenUsageStats from "../../components/TokenUsageStats";
import {
  geminiModelLabel,
  parseGeminiModelsResponse,
  pickValidGeminiModel,
  PRIORITY_RATE_FACTOR,
} from "../../utils/markingCost";
import "./ManagerSubmissionViewer.css";

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",         passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

export default function ManagerSubmissionViewer() {
  const BATCH_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];
  const PRIORITY_ALLOWED_IDS = ["69ce5f2a2e58ca2f4062ae15"];
  const navigate   = useNavigate();
  const msInputRef = useRef();

  const [user,               setUser]               = useState(null);
  const [selectedClassroom,  setSelectedClassroom]  = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [classroomSearch,    setClassroomSearch]    = useState("");
  const [assignmentSearch,   setAssignmentSearch]   = useState("");
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
    {},
    10,
    "students",
    !!selectedAssignment?._id
  );

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

  const [batchProgress, setBatchProgress] = useState(null);
  const [batchJob, setBatchJob] = useState(null);
  const batchStopRef = useRef(false);
  const batchPollRef = useRef(null);


  // Results modal
  const [singleProgress, setSingleProgress] = useState({});
  const [resultModal,      setResultModal]      = useState(null);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [downloading,      setDownloading]      = useState(false);
  const [returning,        setReturning]        = useState(false);
  const [editingTotal, setEditingTotal] = useState(null); // null means use effectiveTotal
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);

  const [studentErrors, setStudentErrors] = useState({});

  const [markingProvider, setMarkingProvider] = useState("gemini");
  const [geminiModels, setGeminiModels] = useState([]);
  const [geminiModel, setGeminiModel] = useState("gemini-3.1-flash-lite");
  const [savedResults, setSavedResults] = useState({});

  // const [cachedMsFile, setCachedMsFile] = useState(null);
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);

  const [errorViewer, setErrorViewer] = useState({
  open: false,
  title: "",
  message: null,
});

useEffect(() => {
  const fetchSavedResults = async () => {
    try {
      const res = await api.get(
        `/submission-files/save-results/${selectedAssignment._id}`
      );

      const map = {};

      res.data.data.forEach(r => {
        map[r.submissionId] = {
          status: "done",
          result: r.result,
          aiOriginalResult: r.aiOriginalResult || r.result,
          studentFile: r.studentFileMeta,
          totalMarks: r.totalMarks
        };
      });

      setSavedResults(map);

      setSingleProgress(prev => ({
        ...prev,
        ...map
      }));

    } catch (err) {
      console.error("Failed to load saved results", err);
    }
  };

  if (selectedAssignment?._id) {
    fetchSavedResults();
  }
}, [selectedAssignment?._id]);

useEffect(() => {
  if (!students.length || !Object.keys(savedResults).length) return;
  let changed = false;
  const updated = students.map(s => {
    const sr = savedResults[s.submissionId];
    if (!sr) return s;
    const newGrade =
      sr.totalMarks ??
      sr.result?.criteriaGrade?.totalMarks ??
      sr.result?.totalMarks ??
      null;
    if (s.assignedGrade === newGrade) return s;
    changed = true;
    return { ...s, assignedGrade: newGrade };
  });
  if (changed) setStudents(updated);
}, [savedResults, students]);


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

  // Compute effective max total
  const effectiveMaxTotal = editingMaxTotal !== null
    ? editingMaxTotal
    : resultModal
      ? (resultModal.result.markingMode === "criteria"
          ? (resultModal.result.criteriaGrade?.maxTotalMarks || 10)
          : resultModal.result.maxTotalMarks)
      : 0;

  // Replace effectiveTotal computed value with:
  const effectiveTotal = resultModal
    ? (editingTotal !== null
        ? editingTotal
        : resultModal.result.markingMode === "criteria"
          ? (resultModal.result.criteriaGrade?.totalMarks || 0)
          : editingQuestions.reduce((s, q) => s + q.marksAwarded, 0))
    : 0;

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


  useEffect(() => {
    const generatePreview = async () => {
      if (!resultModal) return;
      if (!selectedAssignment?._id) return;
      const db = savedResults[students.submissionId];
      
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;

      try {
        const pdfRes = await api.get("/submission-files/pdf", {
          params: {
            assignmentId: selectedAssignment._id,
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
        });

        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        setAnnotatedPreviewUrl(url);
      } catch (err) {
        console.error("Failed to generate preview", err);
      }
    };

    generatePreview();

    return () => {
      if (annotatedPreviewUrl) URL.revokeObjectURL(annotatedPreviewUrl);
    };
  }, [resultModal, editingQuestions, effectiveMaxTotal]);


  const openGuidanceModal = (student = null, intent = false) => {
    // `intent` keeps backward-compat: false/true map to single/batch; or pass
    // a string: "batch" | "priority" | "priorityBulk".
    let modal;
    if (intent === "priority") modal = { priority: true, student };
    else if (intent === "priorityBulk") modal = { priorityBulk: true };
    else if (intent === true || intent === "batch") modal = { batch: true };
    else if (student) modal = { student };
    else modal = { bulk: true };

    setGuidanceModal(modal);
    setGuidance("");
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
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
      return;
    }

    toast.info("Batch marking stopped");
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
        personId: currentUserId(),
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
              totalMarks: res.data?.criteriaGrade?.totalMarks ?? res.data?.totalMarks ?? null,
            }
          }));

          setStudents(prev =>
        prev.map(s =>
          s.submissionId === student.submissionId
            ? {
                ...s,
                assignedGrade:
                  res.data?.criteriaGrade?.totalMarks ??
                  res.data?.totalMarks ??
                  null
              }
            : s
        )
      );

      setEditingQuestions(res.data.questions.map(q => ({ ...q })));
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
        personId: currentUserId(),
        assignmentId: selectedAssignment._id,
        classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      });
      fd.append("geminiModel", selectedModel);
      fd.append("markSchemePdf", msFile);

      const res = await api.post("/marking/mark-priority", fd, {
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
        assignmentId: selectedAssignment._id,
        submissionId: student.submissionId,
        studentId: student.studentId,
        studentName: student.name,
        mode,
        provider: "gemini-priority",
        result: res.data
      });
      setSavedResults(prev => ({
        ...prev,
        [student.submissionId]: {
          status: "done",
          result: res.data,
          aiOriginalResult: JSON.parse(JSON.stringify(res.data)),
          totalMarks: res.data?.criteriaGrade?.totalMarks ?? res.data?.totalMarks ?? null,
        }
      }));

      setStudents(prev =>
        prev.map(s =>
          s.submissionId === student.submissionId
            ? {
                ...s,
                assignedGrade:
                  res.data?.criteriaGrade?.totalMarks ??
                  res.data?.totalMarks ??
                  null
              }
            : s
        )
      );

      if (res.data?.servedServiceTier === "standard") {
        toast.info("Priority unavailable — ran at standard speed.");
      }

      setEditingQuestions(res.data.questions.map(q => ({ ...q })));
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
    const res = await api.post(
      "/submission-files/eligible-for-bulk-marking",
      {
        assignmentId: selectedAssignment._id,
        submissions: students
      }
    );

    const backendEligible = new Set(
      res.data.map(s => s.submissionId)
    );

    const eligible = students.filter(
      s =>
        s.submissionId &&
        backendEligible.has(s.submissionId) &&
        isStudentSubmitted(s.state)
    );
    
    if (!eligible.length) {
      const submitted = students.filter((s) => isStudentSubmitted(s.state));
      if (!submitted.length) {
        return toast.warn("No students have submitted this assignment yet");
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

    for (const student of eligible) {
      if (bulkStopRef.current) break;

      setBulkProgress(p => ({ 
        ...p, 
        [student.submissionId]:{
          status: "marking",
          attempt: 0,
          maxAttempts: 20
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

      continue;
    }

        const fd = new FormData();
        fd.append("studentPdf",    studentFile);
        fd.append("markingMode",   mode);

        if (guidanceValue) fd.append("guidance", guidanceValue);

        if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
    
        appendMarkingContext(fd, {
          personId: currentUserId(),
          assignmentId: selectedAssignment._id,
          classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
        });
        if (provider !== "claude") {
          fd.append("geminiModel", selectedModel);
        }
        if (msFile) {
          fd.append("markSchemePdf", msFile);
        }

        let attempt = 0;
        const maxAttempts = 20;
        let success = false;

while (
      !success &&
      !bulkStopRef.current &&
      attempt < maxAttempts
    ) {
      attempt++;

      try {
        const endpoint =
          provider === "claude"
            ? "/markingClaude/mark-claude"
            : "/marking/mark";

        const res = await api.post(endpoint, fd, {
          headers: {
            "Content-Type": "multipart/form-data"
          },
          timeout: 600000
        });

        setBulkProgress(p => ({
          ...p,
          [student.submissionId]: {
            status: "done",
            result: res.data,
            studentFile
          }
        }));

        setStudents(prev =>
          prev.map(s =>
            s.submissionId === student.submissionId
              ? {
                  ...s,
                  assignedGrade:
                    res.data?.criteriaGrade?.totalMarks ??
                    res.data?.totalMarks ??
                    null
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
          result: res.data
        });
        setSavedResults(prev => ({
          ...prev,
          [student.submissionId]: {
            status: "done",
            result: res.data,
            aiOriginalResult: JSON.parse(JSON.stringify(res.data)),
            totalMarks: res.data?.criteriaGrade?.totalMarks ?? res.data?.totalMarks ?? null,
          }
        }));

        success = true;

      } catch (err) {
        const data = err?.response?.data;
        const parsedMessage = safeParse(data?.message);

        const httpStatus = err?.response?.status;
        const innerCode =
          parsedMessage?.error?.code ||
          data?.error?.code ||
          parsedMessage?.error?.status;

        const retryable =
          httpStatus === 503 ||
          innerCode === 503 ||
          !httpStatus;

        if (retryable) {
          const delay = 2000;

          setBulkProgress(p => ({
            ...p,
            [student.submissionId]: {
              status: "retrying",
              attempt,
              maxAttempts,
              delaySeconds: Math.round(delay / 1000)
            }
          }));

          await new Promise(r => setTimeout(r, delay));

          setBulkProgress(p => ({
            ...p,
            [student.submissionId]: {
              status: "marking",
              attempt,
              maxAttempts
            }
          }));

          continue;
        }

        setBulkProgress(p => ({
          ...p,
          [student.submissionId]: {
            status: "error"
          }
        }));

        recordStudentMarkingError(
          student.submissionId,
          extractHumanError(err),
          err.response?.data
        );

        break;
      }
    }

    if (!success && !bulkStopRef.current) {
      setBulkProgress(p => ({
        ...p,
        [student.submissionId]: {
          status: "error"
        }
      }));

      recordStudentMarkingError(
        student.submissionId,
        "Failed after maximum retries. The server may be overloaded — please try again later."
      );
    }
  }

  setBulkMarking(false);
  if (bulkStopRef.current) {
    toast.info("Bulk marking stopped");
  } else {
    toast.success("Bulk marking complete");
  }
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
      for (const { student, result, success, error, tokenUsage } of data.results) {
        const enrichedResult = success
          ? buildBatchMarkingResult(result, tokenUsage, modelForResult)
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
                  assignedGrade:
                    result?.criteriaGrade?.totalMarks ??
                    result?.totalMarks ??
                    null
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
          setSavedResults(prev => ({
            ...prev,
            [student.submissionId]: {
              status: "done",
              result: enrichedResult,
              aiOriginalResult: originalAiResult,
              totalMarks: enrichedResult?.criteriaGrade?.totalMarks ?? enrichedResult?.totalMarks ?? null,
            }
          }));
        }
      }

      setBatchJob(prev => ({
        ...prev,
        phase: "done",
        results: { ...prev?.results, ...resultMap },
      }));
      toast.success(`Batch complete — ${data.results.filter(r => r.success).length} students marked.`);

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


// ── Submit batch — upload + submit, then hand off to pollBatchJob
const runBatchMark = async (guidanceText, mode = "normal", modelOverride = null) => {
  if (!BATCH_ALLOWED_IDS.includes(currentUserId())) {
    toast.error("You are not allowed to do batch marking. ");
    return;
  }

  const selectedModel = pickValidGeminiModel(
    geminiModels,
    modelOverride || geminiModel
  );
  if (selectedModel !== geminiModel) {
    setGeminiModel(selectedModel);
  }

  let eligible;
  try {
    const res = await api.post(
      "/submission-files/eligible-for-bulk-marking",
      {
        assignmentId: selectedAssignment._id,
        submissions: students,
      }
    );
    const backendEligible = new Set(res.data.map((s) => s.submissionId));
    eligible = students.filter(
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
    const submitted = students.filter((s) => isStudentSubmitted(s.state));
    if (!submitted.length) {
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
      markingMode: mode,
      students: eligible.map(s => ({
        submissionId: s.submissionId,
        studentId:    s.studentId,
        name:         s.name,
        state:        s.state,
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

  // Step 2 — submit job
  setBatchJob(prev => ({ ...prev, phase: "submitting" }));

  if (batchStopRef.current) {
    setBatchJob(null);
    toast.info("Batch marking stopped");
    return;
  }

  let jobId;
  try {
    const res = await api.post("/marking/mark-batch/submit", {
      assignmentId:  selectedAssignment._id,
      msUri,
      succeeded,
      markingMode:   mode,
      guidance:      guidanceValue,
      geminiModel:   selectedModel,
      subjectId:     selectedAssignment.subjectId,
      ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
      personId:      currentUserId(),
      classroomId:   selectedClassroom?._id ?? selectedAssignment?.classroomId,
    });
    jobId = res.data.jobId;
  } catch (err) {
    if (err.response?.status === 409) {
    // Job already running — just resume polling it
    jobId = err.response.data.jobId;
    toast.info("Resuming existing batch job...");
    }else {
    const message = recordMarkingErrorsForStudents(
      succeeded.map(r => r.student),
      err,
      "Batch submission failed"
    );
    toast.error(`Batch submission failed: ${message}`);
    setBatchJob(prev => ({ ...prev, phase: "error" }));
    return;
  }}

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
  try {
    const res = await api.post("/submission-files/eligible-for-bulk-marking", {
      assignmentId: selectedAssignment._id,
      submissions: students,
    });
    const backendEligible = new Set(res.data.map((s) => s.submissionId));
    eligible = students.filter(
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
    const submitted = students.filter((s) => isStudentSubmitted(s.state));
    if (!submitted.length) {
      return toast.warn("No students have submitted this assignment yet");
    }
    return toast.warn("All submitted students are already marked for this assignment");
  }

  const guidanceValue = guidanceForForm(guidanceText);

  // Mark eligible rows as pending so the per-row UI shows progress.
  const progress = {};
  eligible.forEach((s) => { progress[s.submissionId] = { status: "marking" }; });
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
      personId:    currentUserId(),
      classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
    });

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
                assignedGrade:
                  result?.criteriaGrade?.totalMarks ??
                  result?.totalMarks ??
                  null,
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
          totalMarks: enrichedResult?.criteriaGrade?.totalMarks ?? enrichedResult?.totalMarks ?? null,
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
    toast.success(
      `Priority complete — ${ok} marked` +
      (zeroed ? `, ${zeroed} zeroed` : "") +
      (failed ? `, ${failed} failed` : "")
    );
    if (downgradedCount) {
      toast.info(`${downgradedCount} student(s) ran at standard speed (priority unavailable).`);
    }
  } catch (err) {
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
      geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
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
    setDownloading(true);
    try {
      const totalMarks = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);

      const db = savedResults[students.submissionId];
    
      const submissionId =
        resultModal?.submissionId ||
        resultModal?.student?.submissionId ||
        db?.submissionId;


      // const pdfBytes = await annotatePdf({
      //   studentFile:   resultModal.studentFile,
      //   questions:     editingQuestions,
      //   totalMarks:    effectiveTotal,
      //   maxTotalMarks: effectiveMaxTotal,
      //   summary:       resultModal.result.summary || ""
      // });

      const pdfRes = await api.get("/submission-files/pdf", {
        params: {
          assignmentId: selectedAssignment._id,
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

  const returnToStudent = async () => {
    if (!resultModal) return;
    setReturning(true);
    try {
      const originalQuestions = getOriginalQuestions(resultModal);
      if (hasTeacherEdits(originalQuestions, editingQuestions)) {
        const finalResult = buildFinalMarkingResult(resultModal.result, editingQuestions);
        await api.post("/submission-files/save-results", {
          assignmentId: selectedAssignment._id,
          submissionId: resultModal.student.submissionId,
          studentId: resultModal.student.studentId,
          studentName: resultModal.student.name,
          mode: resultModal.result.markingMode || markingModeModal,
          provider: markingProvider,
          result: finalResult,
        });
        setResultModal((prev) => ({
          ...prev,
          result: finalResult,
          originalAiResult: JSON.parse(JSON.stringify(finalResult)),
        }));
      }

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

      const pdfBytes = await annotatePdf({
        studentFile,
        questions: editingQuestions,
        totalMarks: editingQuestions.reduce(
          (s, q) => s + q.marksAwarded,
          0
        ),
        maxTotalMarks: effectiveMaxTotal,
        summary: resultModal.result.summary || "",
      });
      const fd = new FormData();
      fd.append("annotatedPdf",  new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId",  selectedAssignment._id);
      fd.append("submissionId",  resultModal.student.submissionId || submissionId);
      fd.append("totalMarks",    effectiveTotal);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName",   resultModal.student.name || "Student" );
      
      if (resultModal.result?.summary) {
        await api.post("/submission-files/save-summary", {
          assignmentId: selectedAssignment._id,
          submissionId: resultModal.student.submissionId,
          summary: resultModal.result.summary,
        });
      }
      
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

  const handleReturnAll = async () => {
    try {
      setReturning(true);

      const saveRequests = Object.entries(bulkProgress)
        .filter(([_, bulk]) =>
          bulk?.status === "done" &&
          bulk?.result?.summary
        )
        .map(([submissionId, bulk]) =>
          api.post("/submission-files/save-summary", {
            assignmentId: selectedAssignment._id,
            submissionId,
            summary: bulk.result.summary,
          })
        );

      await Promise.all(saveRequests);

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


  const returnAllToStudents = async () => {
    const doneStudents = students.filter(s => {
      const bulk = bulkProgress[s.submissionId];
      return bulk?.status === "done" && bulk?.result && !bulk?.returned;
    });

    if (!doneStudents.length) {
      toast.warn("No new graded students to return");
      return;
    }

    setReturning(true);

    try {
      for (const student of doneStudents) {
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

        const total =
          bulk.result?.criteriaGrade?.totalMarks ??
          bulk.result?.totalMarks ??
          editingQs.reduce((s, q) => s + (q.marksAwarded || 0), 0);

        const max =
          bulk.result?.criteriaGrade?.maxTotalMarks ??
          bulk.result?.maxTotalMarks ??
          selectedAssignment?.maxPoints ??
          0;

        let pdfBytes;
        try {
          pdfBytes = await annotatePdf({
            studentFile,
            questions: editingQs,
            totalMarks: total,
            maxTotalMarks: max,
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

      toast.success("All graded papers returned");
    } finally {
      setReturning(false);
    }
  };

  if (!user) return null;

  const isCriteria = resultModal?.result?.markingMode === "criteria";

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
                  {msInfo && BATCH_ALLOWED_IDS.includes(currentUserId()) && (
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
          pollBatchJob(batchJob.jobId, {
            mode: batchJob.mode,
            geminiModel: pickValidGeminiModel(geminiModels, batchJob.geminiModel || geminiModel),
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
                    <button
                      className="msv-btn-ai"
                      onClick={() => openGuidanceModal(null, "priorityBulk")}
                      disabled={bulkMarking || priorityBulkRunning || batchJob?.phase === "processing"}
                      title="Mark whole class on Gemini priority tier (fastest, premium)"
                      style={{ marginLeft: 10, background: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.4)" }}
                    >
                      {priorityBulkRunning
                        ? <><span className="pm-spinner" /> Priority marking…</>
                        : <><FiSend size={13} /> Mark All (Priority)</>}
                    </button>
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



                  <div className="ma-panel-header">
                    <div className="ma-panel-title-wrap">
                      <div className="ma-panel-dot" />
                      <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                      <span className="ma-panel-count">{studentTotal} students</span>
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
                                              setEditingMaxTotal(null);
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
                                            onClick={() => openGuidanceModal(s, "priority")}
                                            disabled={markingLoading || priorityBulkRunning}
                                            style={{ borderColor: "rgba(251,191,36,0.4)" }}
                                          >
                                            <FiSend size={12} /> Mark (Priority)
                                          </button>
                                        )}

                                          {/* {bulkRetrying && (
                                            <button onClick={stopBulkMark}>Stop</button>
                                          )} */}

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
              <div>
                {/* <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {guidanceModal.bulk ? "🤖 Mark All Students" : `🤖 Mark — ${guidanceModal.student?.name}`}
                </div> */}

                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {guidanceModal.batch        ? "⚡ Mark All Students (Batch)"  :
                  guidanceModal.priorityBulk  ? "🚀 Mark All Students (Priority)" :
                  guidanceModal.priority      ? `🚀 Mark (Priority) — ${guidanceModal.student?.name}` :
                  guidanceModal.bulk          ? "🤖 Mark All Students"          :
                                                `🤖 Mark — ${guidanceModal.student?.name}`}
                </div>

                {/* <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                  {guidanceModal.bulk
                    ? `Marking ${students.filter(s => s.submissionId).length} students with AI`
                    : "AI will mark against the uploaded mark scheme"}
                </div> */}
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
  {guidanceModal.batch
    ? `Submits all ${students.filter(s => s.submissionId).length} students to Gemini batch API — ~50% cheaper`
    : guidanceModal.priorityBulk
    ? `Marks all ${students.filter(s => s.submissionId).length} students on Gemini priority tier — fastest, premium (~+${Math.round((PRIORITY_RATE_FACTOR - 1) * 100)}%)`
    : guidanceModal.priority
    ? `Priority tier — fastest/most reliable, premium (~+${Math.round((PRIORITY_RATE_FACTOR - 1) * 100)}%)`
    : guidanceModal.bulk
    ? `Marking ${students.filter(s => s.submissionId).length} students sequentially`
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
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={effectiveMaxTotal}
                    value={editingTotal !== null ? editingTotal : effectiveTotal}
                    onChange={e => setEditingTotal(Math.min(effectiveMaxTotal, Math.max(0, Number(e.target.value))))}
                    style={{
                      width: 56, padding: "3px 8px", borderRadius: 6,
                      border: `1px solid ${getScoreColor(effectiveTotal, effectiveMaxTotal)}`,
                      background: `${getScoreColor(effectiveTotal, effectiveMaxTotal)}15`,
                      color: getScoreColor(effectiveTotal, effectiveMaxTotal),
                      fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none"
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
                      // clamp total if it now exceeds new max
                      if (editingTotal !== null && editingTotal > newMax) setEditingTotal(newMax);
                      else if (editingTotal === null && effectiveTotal > newMax) setEditingTotal(newMax);
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
                    ({effectiveMaxTotal > 0 ? Math.round((effectiveTotal / effectiveMaxTotal) * 100) : 0}%)
                  </span>
                  {(editingTotal !== null || editingMaxTotal !== null) && (
                    <button
                      onClick={() => { setEditingTotal(null); setEditingMaxTotal(null); }}
                      style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
                    >
                      Reset
                    </button>
                  )}
                </div>
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

              {/* ── NORMAL MODE: summary + score bar ── */}
              {!isCriteria && (
                <>
                  {resultModal.result.summary && (
                    <div className="msv-summary-box">
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Summary</div>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>{resultModal.result.summary}</p>
                    </div>
                  )}
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

                </>
              )}

              {/* ── QUESTIONS (both modes) ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {editingQuestions.map((q, idx) => {
                  const color = getScoreColor(q.marksAwarded, q.maxMarks);
                  const pct   = q.maxMarks > 0 ? Math.round((q.marksAwarded / q.maxMarks) * 100) : 0;
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
                              value={q.marksAwarded}
                              onChange={e => setEditingQuestions(prev => prev.map((x, i) => i === idx ? { ...x, marksAwarded: Math.min(q.maxMarks, Math.max(0, Number(e.target.value))) } : x))}
                              style={{ width: 52, padding: "4px 8px", borderRadius: 6, border: `1px solid ${color}`, background: `${color}15`, color, fontWeight: 700, fontSize: 14, textAlign: "center", outline: "none" }}
                            />
                            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>/ {q.maxMarks}</span>
                          </div>
                        )}
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
                        textTransform: "uppercase"
                      }}>
                        📄 Annotated PDF Preview
                      </div>

                      {annotatedPreviewUrl ? (

                        <div
                          style={{
                            flex: 1,
                            minHeight: 0
                          }}
                        >
                          <iframe
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
                          Generating preview...
                        </div>
                      )}
                    </div> 
                </div>
          </div>
        </div>
      )}
    </div>
  );
};