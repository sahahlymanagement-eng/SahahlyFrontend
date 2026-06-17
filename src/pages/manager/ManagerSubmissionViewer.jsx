import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { annotatePdf } from "../../utils/annotatePdf";
import {
  FiUsers, FiClipboard, FiDownload, FiEye, FiCpu,
  FiUploadCloud, FiX, FiCalendar, FiSend
} from "react-icons/fi";
import ManagerSidebar from "../../components/ManagerSidebar";
import {
  appendMarkingContext,
  assertPdfBlob,
  currentUserId,
  getApiErrorMessage,
  guidanceForForm,
  normalizeGuidance,
} from "../../utils/markingFormData";
import PdfCompressionStats from "../../components/PdfCompressionStats";
import "./ManagerSubmissionViewer.css";

const CHECKLIST_CONFIG = [
  { key: "scanningClarity",            label: "Scanning Clarity",         passIsGood: true  },
  { key: "handwritingClarity",         label: "Handwriting Clarity",       passIsGood: true  },
  { key: "markSchemeUnderstanding",    label: "Mark Scheme Understanding", passIsGood: true  },
  { key: "studentAnswerUnderstanding", label: "Student Answer Understood", passIsGood: true  },
  { key: "answerIsBlank",              label: "Answer is Blank",           passIsGood: false },
];

export default function ManagerSubmissionViewer() {
  const navigate   = useNavigate();
  const msInputRef = useRef();

  const [user,               setUser]               = useState(null);
  const [classrooms,         setClassrooms]         = useState([]);
  const [selectedClassroom,  setSelectedClassroom]  = useState(null);
  const [assignments,        setAssignments]        = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [students,           setStudents]           = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingStudents,    setLoadingStudents]    = useState(false);
  const [classroomSearch,    setClassroomSearch]    = useState("");
  const [assignmentSearch,   setAssignmentSearch]   = useState("");
  const [markingModeModal,   setMarkingModeModal]   = useState("normal");

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
  const [bulkErrors, setBulkErrors] = useState({});
  const [bulkLocked, setBulkLocked] = useState(false);
  const bulkStopRef = useRef(false);

  const [batchProgress, setBatchProgress] = useState(null);
// {
//   phase: "validating" | "submitting" | "processing" | "done" | "error"
//   jobId: string | null
//   total: number           -- how many valid students were submitted
//   skipped: number         -- how many were skipped (bad PDF)
//   results: {              -- filled in after SUCCEEDED
//     [submissionId]: { status: "done"|"error", result?, error? }
//   }
// }


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
  const [savedResults, setSavedResults] = useState({});

  // const [cachedMsFile, setCachedMsFile] = useState(null);
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);

  const [errorViewer, setErrorViewer] = useState({
  open: false,
  title: "",
  message: null,
});

const selectedGeminiModel = "gemini-3-flash-preview"

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
          studentFile: r.studentFileMeta,
          totalMarks: r.totalMarks
        };
      });

      setSavedResults(map);

      // sync into UI progress state (same idea as assistant)
      setSingleProgress(prev => ({
        ...prev,
        ...map
      }));

      // optional: also sync student list grades (manager usually needs this)
      setStudents(prev =>
        prev.map(s =>
          map[s.submissionId]
            ? {
                ...s,
                assignedGrade:
                  map[s.submissionId]?.totalMarks ??
                  map[s.submissionId]?.result?.totalMarks ??
                  null
              }
            : s
        )
      );

    } catch (err) {
      console.error("Failed to load saved results", err);
    }
  };

  if (selectedAssignment?._id) {
    fetchSavedResults();
  }
}, [selectedAssignment?._id]);


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
    console.log("RAW ERROR:", err?.response?.data);
    console.log("MESSAGE TYPE:", typeof err?.response?.data?.message);
    const data = err?.response?.data;

    // 1. Normalize data.message
    const parsedMessage = safeParse(data?.message);

    // 2. If message itself contains error object, prefer it
    const errorObj =
      parsedMessage?.error ? parsedMessage : data?.error ? data : parsedMessage;

    if (
      errorObj?.error?.status === "UNAVAILABLE" ||
      errorObj?.error?.code === 503
    ) {
      return "The AI marking service is currently experiencing high demand. Please try again in a few minutes.";
    }

    if (err?.response?.status === 404) {
      return "The requested file or resource could not be found.";
    }

    return (
      errorObj?.error?.message ||
      data?.error?.message ||
      parsedMessage?.message ||
      err?.message ||
      "An unexpected error occurred."
    );
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
    api.get(`/students/my-classrooms?personId=${user.id}`)
      .then(r => setClassrooms(r.data || []))
      .catch(() => toast.error("Failed to load classrooms"));
    api.get("/marking/prompts")
      .then(r => setSavedPrompts(r.data || []))
      .catch(() => {});
  }, [user]);

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
    setStudents([]);
    setAssignments([]);
    setMsInfo(null);
    setLoadingAssignments(true);
    try {
      const res = await api.get(`/manager-assignments/classroom/${classroom._id}/assignments`);
      setAssignments(res.data || []);
    } catch { toast.error("Failed to load assignments"); }
    finally   { setLoadingAssignments(false); }
  };

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);
    setStudents([]);
    setMsInfo(null);
    setBulkProgress({});
    setLoadingStudents(true);
    try {
      const [studRes, msRes] = await Promise.all([
        api.get(`/manager-assignments/${assignment._id}/full`),
        api.get(`/manager-assignments/${assignment._id}/markscheme`)
      ]);
      setStudents(studRes.data.students || []);
      setMsInfo(msRes.data.fileId ? msRes.data : null);
    } catch { toast.error("Failed to load students"); }
    finally   { setLoadingStudents(false); }
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


  const openGuidanceModal = (student = null) => {
    setGuidanceModal(student ? { student } : { bulk: true });
    setGuidance("");
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
  };


  const runMarkStudent = async (student, guidanceText, mode = "normal") => {
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
      fd.append("markSchemePdf", msFile);
      fd.append("markingMode",   mode);
      const guidanceValue = guidanceForForm(guidanceText);
      if (guidanceValue) fd.append("guidance", guidanceValue);
      if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
      appendMarkingContext(fd, {
        personId: currentUserId(),
        assignmentId: selectedAssignment._id,
        classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
      });

      const endpoint =
      markingProvider === "claude"
        ? "/markingClaude/mark-claude"
        : "/marking/mark";

      const res = await api.post(endpoint, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      
      setResultModal({ student, result: res.data, studentFile, submissionId: student.submissionId});
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
            provider: markingProvider,
            result: res.data
          });
        
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
      
            setStudentErrors(prev => ({
              ...prev,
              [student.submissionId]: {
                message,
                raw: err.response?.data
              }
            }));
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

  const runBulkMark = async (guidanceText, mode = "normal") => {
    // const eligible = students.filter(s => s.submissionId);
    const res = await api.post(
      "/submission-files/eligible-for-bulk-marking",
      {
        assignmentId,
        submissions: students
      }
    );

    const backendEligible = new Set(
      res.data.map(s => s.submissionId)
    );

    const eligible = students.filter(
      s => s.submissionId && backendEligible.has(s.submissionId)
    );
    
    if (!eligible.length) return toast.warn("No students with submissions");

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
          })
        ]);

        await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
        await assertPdfBlob(msPdfRes.data, "Mark scheme");

        // const studentFile = new File([studentPdfRes.data], `${student.name || "student"}.pdf`, { type: "application/pdf" });
        // const msFile      = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });
        
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

      setBulkProgress(p => ({
        ...p,
        [student.submissionId]: { status: "error" }
      }));

      setBulkErrors(e => ({
        ...e,
        [student.submissionId]: {
          message:
            status === 404
              ? "Submission file not found"
              : "Failed to load files",
          raw: err.response?.data
        }
      }));

      continue;
    }

        const fd = new FormData();
        fd.append("studentPdf",    studentFile);
        fd.append("markSchemePdf", msFile);
        fd.append("markingMode",   mode);

        const guidanceValue = guidanceForForm(guidanceText);
        if (guidanceValue) fd.append("guidance", guidanceValue);

        if (selectedAssignment.maxPoints) fd.append("totalGrade", selectedAssignment.maxPoints);
    
        appendMarkingContext(fd, {
          personId: currentUserId(),
          assignmentId: selectedAssignment._id,
          classroomId: selectedClassroom?._id ?? selectedAssignment?.classroomId,
        });

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
          markingProvider === "claude"
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
          provider: markingProvider,
          result: res.data
        });

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

        setBulkErrors(e => ({
          ...e,
          [student.submissionId]: {
            message: extractHumanError(err),
            raw: err.response?.data
          }
        }));

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

      setBulkErrors(e => ({
        ...e,
        [student.submissionId]: {
          message:
            "Failed after maximum retries. The server may be overloaded — please try again later.",
          raw: null
        }
      }));
    }
  }

  setBulkMarking(false);
  toast.success("Bulk marking complete");
  };



const runBatchMark = async (guidanceText, mode = "normal") => {
  const eligible = students.filter(s => s.submissionId);
  if (!eligible.length) return toast.warn("No students with submissions");

  setBatchProgress({ phase: "uploading", total: eligible.length });

  // Step 1 — upload
  let msUri, succeeded, failed;
  try {
    const res = await api.post("/marking/mark-batch/upload", {
      assignmentId: selectedAssignment._id,
      students: eligible.map(s => ({
        submissionId: s.submissionId,
        studentId:    s.studentId,
        name:         s.name,
      })),
    });
    ({ msUri, succeeded, failed } = res.data);
  } catch (err) {
    toast.error(`Upload failed: ${extractHumanError(err)}`);
    setBatchProgress({ phase: "error" });
    return;
  }

  // Immediately surface failed uploads
  if (failed.length) {
    toast.warning(`${failed.length} student(s) could not be uploaded`);
    setBatchProgress(prev => ({
      ...prev,
      results: Object.fromEntries(
        failed.map(({ student, error }) => [student.submissionId, { status: "error", error }])
      ),
    }));
  }

  if (!succeeded.length) {
    toast.error("No valid submissions to mark.");
    setBatchProgress({ phase: "error" });
    return;
  }

  // Step 2 — submit
  setBatchProgress(prev => ({ ...prev, phase: "submitting" }));

  let jobId;
  try {
    const res = await api.post("/marking/mark-batch/submit", {
      assignmentId:  selectedAssignment._id,
      msUri,
      succeeded,
      markingMode:   mode,
      guidance:      guidanceForForm(guidanceText),
      geminiModel:   selectedGeminiModel,
      subjectId:     selectedAssignment.subjectId,
      ...(selectedAssignment.maxPoints && { totalGrade: selectedAssignment.maxPoints }),
      personId:      currentUserId(),
      classroomId:   selectedClassroom?._id ?? selectedAssignment?.classroomId,
    });
    jobId = res.data.jobId;
  } catch (err) {
    toast.error(`Batch submission failed: ${extractHumanError(err)}`);
    setBatchProgress({ phase: "error" });
    return;
  }

  // Step 3 — poll
  setBatchProgress(prev => ({ ...prev, phase: "processing", jobId }));

  try {
    const results = await new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const { data } = await api.get(`/marking/mark-batch/status/${jobId}`);
          if (data.state === "JOB_STATE_PENDING" || data.state === "JOB_STATE_RUNNING") return;
          clearInterval(interval);
          if (data.state === "JOB_STATE_FAILED") reject(new Error(data.message));
          else resolve(data.results);
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 15_000);
    });

    // Fan out
    const resultMap = {};
    for (const { student, result, success, error } of results) {
      resultMap[student.submissionId] = success ? { status: "done", result } : { status: "error", error };

      if (success) {
        setStudents(prev =>
          prev.map(s => s.submissionId === student.submissionId
            ? { ...s, assignedGrade: result?.criteriaGrade?.totalMarks ?? result?.totalMarks ?? null }
            : s
          )
        );
        await api.post("/submission-files/save-results", {
          assignmentId: selectedAssignment._id,
          submissionId: student.submissionId,
          studentId:    student.studentId,
          studentName:  student.name,
          mode,
          provider:     "gemini-batch",
          result,
        }).catch(e => console.error("save-results:", e.message));
      }
    }

    setBatchProgress(prev => ({
      ...prev,
      phase: "done",
      results: { ...prev?.results, ...resultMap },
    }));

    toast.success(`Batch complete — ${results.filter(r => r.success).length} marked.`);

  } catch (err) {
    toast.error(`Batch failed: ${extractHumanError(err)}`);
    setBatchProgress(prev => ({ ...prev, phase: "error" }));
  }
};




  const handleGuidanceConfirm = () => {
    if (!guidanceModal) return;
    if (markingModeModal === "criteria" && !normalizeGuidance(guidance)) {
      return toast.warn("Criteria marking requires guidance to be provided");
    }
    const g    = normalizeGuidance(guidance);
    const mode = markingModeModal;
    if (guidanceModal.bulk) {
      setGuidanceModal(null);
      runBulkMark(g, mode);
    } else {
      setGuidanceModal(null);
      runMarkStudent(guidanceModal.student, g, mode);
    }
  };

  const downloadGradedPdf = async () => {
    if (!resultModal) return;
    setDownloading(true);
    try {
      const totalMarks = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      const pdfBytes = await annotatePdf({
        studentFile:   resultModal.studentFile,
        questions:     editingQuestions,
        totalMarks:    effectiveTotal,
        maxTotalMarks: effectiveMaxTotal,
        summary:       resultModal.result.summary || ""
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
      const pdfBytes = await annotatePdf({
        studentFile:   resultModal.studentFile,
        questions:     editingQuestions,
        totalMarks:    effectiveTotal,
        maxTotalMarks: effectiveMaxTotal,
        summary:       resultModal.result.summary || ""
      });
      const fd = new FormData();
      fd.append("annotatedPdf",  new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId",  selectedAssignment._id);
      fd.append("submissionId",  resultModal.student.submissionId);
      fd.append("totalMarks",    effectiveTotal);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName",   resultModal.student.name || "Student");
      
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

  const filteredClassrooms  = classrooms.filter(c =>
    `${c.name} ${c.section || ""}`.toLowerCase().includes(classroomSearch.toLowerCase())
  );
  const filteredAssignments = assignments.filter(a =>
    a.title.toLowerCase().includes(assignmentSearch.toLowerCase())
  );
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
      return bulk?.status === "done" && bulk?.result && bulk?.studentFile && !bulk?.returned;
    });

    if (!doneStudents.length) {
      toast.warn("No new graded students to return");
      return;
    }

    setReturning(true);

    try {
      for (const student of doneStudents) {
        const bulk = bulkProgress[student.submissionId];

        if (!bulk?.result || !bulk?.studentFile) {
          toast.error(`Missing data for ${student.name}. Stopping return process.`);
          throw new Error("Missing bulk data");
        }

        const editingQs = bulk.result.questions || [];

        const total =
          bulk.result?.criteriaGrade?.totalMarks ??
          bulk.result?.totalMarks ??
          editingQs.reduce((s, q) => s + (q.marksAwarded || 0), 0);

        const max =
          bulk.result?.criteriaGrade?.maxTotalMarks ??
          bulk.result?.maxTotalMarks ??
          // maxGrade ??
          selectedAssignment?.maxPoints ??
          0;

        let pdfBytes;
        try {
          pdfBytes = await annotatePdf({
            studentFile: bulk.studentFile,
            questions: editingQs,
            totalMarks: total,
            maxTotalMarks: max,
          });
        } catch (err) {
          console.error("PDF annotation failed for:", student.name, err);
          toast.error(`Failed to generate PDF for ${student.name}. Stopping process.`);
          throw err; // ⛔ stops ALL remaining students
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
          throw err; // ⛔ STOP EVERYTHING
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
          <div className="ma-layout">

            {/* ── CLASSROOMS ── */}
            <div className="ma-column">
              <p className="ma-section-label">Classrooms</p>
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
            </div>

            {/* ── ASSIGNMENTS ── */}
            <div className="ma-column">
              <p className="ma-section-label">Assignments</p>
              <input className="ma-search-input" placeholder="Search assignments..." value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)} disabled={!selectedClassroom} />
              <div className="ma-scroll-list">
                {!selectedClassroom ? (
                  <p className="ma-empty-msg">Select classroom first</p>
                ) : loadingAssignments ? (
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
            </div>

            {/* ── STUDENTS ── */}
            <div className="ma-right-panel">
              {!selectedAssignment ? (
                <div className="ma-empty-state">
                  <FiClipboard size={40} />
                  <p>Select assignment to view students</p>
                </div>
              ) : (
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
                      <button 
                        className="msv-btn-ai" 
                        onClick={() => openGuidanceModal()} 
                        disabled={bulkMarking}
                      >
                        {bulkMarking ? <><span className="pm-spinner" /> Marking all…</> : <><FiCpu size={13} /> Mark All Students</>}
                      </button>
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
                  
                  {/* BATCH  MARKING */}
                  {/* {msInfo && !bulkMarking && (
                    <button
                      className="msv-btn-ai"
                      onClick={openGuidanceModal}
                      disabled={returning}
                      style={{ marginLeft: 10, background: "rgba(34,197,94,0.15)" }}
                    >
                      {returning ? "Returning…" : "batch"}
                    </button>
                    )} */}
                  </div>



                  <div className="ma-panel-header">
                    <div className="ma-panel-title-wrap">
                      <div className="ma-panel-dot" />
                      <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                      <span className="ma-panel-count">{students.length} students</span>
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
                              
                              const hasResult = !!(single?.status === "done" || db?.result);
                              const isMarking = single?.status === "marking" || markingStudentId === s.submissionId;
                              const hasError = single?.status === "error" || studentErrors[s.submissionId];

                              const markingLoading = isMarking || bulkMarking || bulkRetrying ||markingStudentId === s.submissionId;
                              const markingDone = bulkDone || hasResult;
                              const markingError = bulkError || hasError || studentErrors[s.submissionId];
                            

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
                                        
                                        {msInfo && (
                                         <>
                                          {/* <button
                                            className={`msv-action-btn msv-action-btn--ai ${bulkDone ? "msv-action-btn--done" : bulk === "error" ? "msv-action-btn--error" : ""}`}
                                            title="Mark with AI"
                                            onClick={() => {
                                              if (bulkDone) {
                                                setResultModal({ student: s, result: bulk.result, studentFile: bulk.studentFile });
                                                setEditingQuestions(bulk.result.questions.map(q => ({ ...q })));
                                                setEditingMaxTotal(null);
                                              } else {
                                                openGuidanceModal(s);
                                              }
                                            }}
                                            disabled={markingStudentId === s.submissionId || bulk === "marking"}
                                          >
                                            {markingStudentId === s.submissionId || bulk === "marking"
                                              ? <span className="pm-spinner" />
                                              : bulkDone        ? "✅ Results"
                                              : bulk === "error" ? "❌ Retry"
                                              : <><FiCpu size={12} /> Mark</>
                                            }
                                          </button> */}
                                        
                                        {/* Results button — show if any source has results */}
                                        {(bulkDone || single?.status === "done" || db?.result) && (
                                          <button
                                            className="msv-action-btn msv-action-btn--ai msv-action-btn--done"
                                            title="View Results"
                                            onClick={() => {
                                              const source = bulkDone ? bulk : single?.status === "done" ? single : null;
                                              const result = source?.result ?? db?.result;
                                              const studentFile = source?.studentFile ?? null;
                                              setResultModal({ student: s, result, studentFile,submissionId: s.submissionId });
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
                                            :
                                             <span className="pm-spinner" />
                                            : markingError
                                            ? <>❌ Retry</>
                                            : <><FiCpu size={12} /> Mark</>
                                          }
                                        </button>

                                          {/* {bulkRetrying && (
                                            <button onClick={stopBulkMark}>Stop</button>
                                          )} */}

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
                                        {bulkError && (
                                          <button
                                            className="msv-action-btn msv-action-btn--view"
                                            title="View Error"
                                            onClick={() =>
                                              openErrorViewer(`Marking Failed - ${s.name}`, bulkErrors[s.submissionId].message)
                                            }
                                          >
                                            View Error
                                          </button>
                                        )}

                                        {bulkDone && bulk?.result?.tokenUsage && (
                                            <div style={{
                                              marginTop: 6,
                                              fontSize: 11,
                                              display: "flex",
                                              gap: 10,
                                              color: "rgba(255,255,255,0.6)",
                                              flexWrap: "wrap"
                                            }}>
                                              <span>
                                                <span style={{ color: "#399cf2", fontWeight: 700 }}>In:</span>{" "}
                                                {bulk.result.tokenUsage.inputTokens}
                                              </span>

                                              <span>
                                                <span style={{ color: "#22c55e", fontWeight: 700 }}>Out:</span>{" "}
                                                {bulk.result.tokenUsage.outputTokens}
                                              </span>

                                              <span>
                                                <span style={{ color: "#f59e0b", fontWeight: 700 }}>Total:</span>{" "}
                                                {bulk.result.tokenUsage.totalTokens}
                                              </span>
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
                </div>
              )}
            </div>
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
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {guidanceModal.bulk ? "🤖 Mark All Students" : `🤖 Mark — ${guidanceModal.student?.name}`}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                  {guidanceModal.bulk
                    ? `Marking ${students.filter(s => s.submissionId).length} students with AI`
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

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  className="ma-send-btn"
                  onClick={() => {
                    setMarkingProvider("gemini");
                    handleGuidanceConfirm();
                  }}
                  disabled={markingModeModal === "criteria" && !normalizeGuidance(guidance)}
                  style={{ flex: 1, justifyContent: "center", opacity: markingModeModal === "criteria" && !normalizeGuidance(guidance) ? 0.4 : 1 }}
                >
                  <FiCpu size={14} />
                  {guidanceModal.bulk ? "Start Marking All with Gemini" : "Start Marking with Gemini"}
                </button>

                <button
                  className="ma-send-btn"
                  onClick={() => {
                    setMarkingProvider("claude");
                    handleGuidanceConfirm();
                  }}
                >
                <FiCpu size={14} />
                  {guidanceModal.bulk ? "Start Marking All with Claude" : "Start Marking with Claude"}
                </button>
                
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
              {resultModal.result.tokenUsage && (
                <div className="msv-summary-box" style={{ marginTop: 12 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.5)",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em"
                  }}>
                    AI Token Usage
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#399cf2", fontWeight: 700 }}>Input:</span>{" "}
                      {resultModal.result.tokenUsage.inputTokens}
                    </div>

                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#22c55e", fontWeight: 700 }}>Output:</span>{" "}
                      {resultModal.result.tokenUsage.outputTokens}
                    </div>

                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>Total:</span>{" "}
                      {resultModal.result.tokenUsage.totalTokens}
                    </div>
                  </div>
                </div>
              )}

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

                  {/* Confirm edits notice for normal mode */}
                  {editingQuestions.some((q, idx) => q.marksAwarded !== resultModal.result.questions[idx]?.marksAwarded) && (
                    <div style={{ padding: "10px 16px", marginBottom: 16, borderRadius: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 13, color: "#f59e0b" }}>⚠️ You have edited grades — download or return to apply them</span>
                      <button
                        className="ma-send-btn"
                        style={{ fontSize: 12, padding: "6px 14px", background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}
                        onClick={() => {
                          const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
                          setResultModal(prev => ({ ...prev, result: { ...prev.result, totalMarks: total } }));
                          toast.success(`Grades confirmed — total: ${total}/${effectiveMaxTotal}`);
                        }}
                      >
                        ✅ Confirm Edits
                      </button>
                    </div>
                  )}
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

                      {/* Correct answer — shown in criteria mode */}
                      {isCriteria && q.correctAnswer && (
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
                        // <iframe
                        //   src={annotatedPreviewUrl}
                        //   style={{
                        //     flex: 1,
                        //     border: "none",
                        //     borderRadius: 8,
                        //     background: "#111"
                        //   }}
                        //   title="Annotated PDF"
                        // />
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
}