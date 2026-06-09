import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { annotatePdf } from "../../utils/annotatePdf";
import {setSummary} from "../../utils/sharedSummary";

import {
  FiEye,
  FiDownload,
  FiRefreshCw,
  FiUsers,
  FiCpu,
  FiSend,
  FiX
} from "react-icons/fi";

import "../manager/ManagerSubmissionViewer.css";
import "./AssistantReports.jsx"
import {
  appendMarkingContext,
  assertPdfBlob,
  currentUserId,
  getApiErrorMessage,
  guidanceForForm,
  normalizeGuidance,
} from "../../utils/markingFormData";

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

  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);

  const [dueDateTime, setDueDateTime] = useState(null);
  const [maxGrade, setMaxGrade] = useState(null);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [classroomId, setClassroomId] = useState(null);

  const [msInfo, setMsInfo] = useState(null);
  const [uploadingMs, setUploadingMs] = useState(false);

  const [markingModeModal,   setMarkingModeModal]   = useState("normal");
  
  const [markingStudentId, setMarkingStudentId] = useState(null);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkProgress,     setBulkProgress]     = useState({});
  const [bulkErrors, setBulkErrors] = useState({});
 
  const [guidanceModal,      setGuidanceModal]      = useState(null);
  const [guidance,           setGuidance]           = useState("");
  const [savedPrompts,       setSavedPrompts]       = useState([]);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);

  const [resultModal, setResultModal] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [returning,        setReturning]        = useState(false);
  const [editingTotal, setEditingTotal] = useState(null); // null means use effectiveTotal
  const [editingMaxTotal, setEditingMaxTotal] = useState(null);

  // const [cachedMsFile, setCachedMsFile] = useState(null);
  const [annotatedPreviewUrl, setAnnotatedPreviewUrl] = useState(null);

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
    if (!assignmentId) return;
    fetchStudents();
  }, [assignmentId]);

  useEffect(() => {
    if (!promptDropdownOpen) return;
    const close = () => setPromptDropdownOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [promptDropdownOpen]);

    useEffect(() => {
      const generatePreview = async () => {
        if (!resultModal) return;

        try {
          const pdfBytes = await annotatePdf({
            studentFile: resultModal.studentFile,
            questions: editingQuestions,
            totalMarks: editingQuestions.reduce((s, q) => s + q.marksAwarded, 0),
            maxTotalMarks: effectiveMaxTotal,
            summary: resultModal.result.summary || ""
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
    }, [resultModal]);

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

  // const fetchStudents = async () => 
  //   { setLoading(true); 
  //     try { 
  //       const res = await api.get( `/assignment-submissions/${assignmentId}/students` ); 
  //       setStudents(res.data.students || []); 
  //     } 
  //     catch { 
  //       toast.error("Failed to load students"); 
  //     } finally { setLoading(false); } };
  
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/assignment-submissions/${assignmentId}/students`);
      setStudents(res.data.students || []);
      setDueDateTime(res.data.dueDateTime || null);
      setMaxGrade(res.data.maxGrade || null);
      setAssignmentTitle(res.data.assignmentTitle || "Assignment");
      setClassroomId(res.data.classroomId || null);
      
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
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
const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${student.name || "submission"}.pdf`;
      a.click();
    } catch {
      toast.error("Download failed");
    }
  };

  const openGuidanceModal = (student = null) => {
    setGuidanceModal(student ? { student } : { bulk: true });
    setGuidance("");
    setMarkingModeModal("normal");
    setPromptDropdownOpen(false);
  };

  const runMarkStudent = async (student, guidanceText, mode = "normal") => {
    setMarkingStudentId(student.submissionId);

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
      // const studentPdfRes = await api.get("/submission-files/pdf", {
      //   params: { assignmentId, submissionId: student.submissionId },
      //   responseType: "blob"
      // });

      // const msFile =
        // cachedMsFile ||
        // new File(
        //   [await (await api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
        //     responseType: "blob"
        //   })).data],
        //   "markscheme.pdf",
        //   { type: "application/pdf" }
        // );


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
      fd.append("markSchemePdf", msFile);
      if (maxGrade) fd.append("totalGrade", maxGrade);
      fd.append("markingMode", mode);
      const guidanceValue = guidanceForForm(guidanceText);
      if (guidanceValue) fd.append("guidance", guidanceValue);
      appendMarkingContext(fd, { personId: currentUserId(), assignmentId, classroomId });

      const res = await api.post("/marking/mark", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000
      });

      setResultModal({
        student,
        result: res.data,
        studentFile
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

      setEditingQuestions((res.data.questions || []).map(q => ({ ...q })));

    } catch (err) {
      toast.error(await getApiErrorMessage(err));
    } finally {
      setMarkingStudentId(null);
    }
  };

  const runBulkMark = async (guidanceText, mode = "normal") => {
      const eligible = students.filter(s => s.submissionId);
      if (!eligible.length) return toast.warn("No students with submissions");
  
      setBulkMarking(true);
      const progress = {};
      eligible.forEach(s => { progress[s.submissionId] = "pending"; });
      setBulkProgress({ ...progress });
  
      for (const student of eligible) {
        setBulkProgress(p => ({ ...p, [student.submissionId]: "marking" }));
        try {
          const [studentPdfRes, msPdfRes] = await Promise.all([
            api.get("/submission-files/pdf", {
              params: { assignmentId: assignmentId, submissionId: student.submissionId },
              responseType: "blob"
            }),
            api.get(`/manager-assignments/${assignmentId}/markscheme-file`, {
              responseType: "blob"
            })
          ]);
  
          // await assertPdfBlob(studentPdfRes.data, `${student.name || "Student"} submission`);
          // await assertPdfBlob(msPdfRes.data, "Mark scheme");

          const studentFile = new File([studentPdfRes.data], `${student.name || "student"}.pdf`, { type: "application/pdf" });
          const msFile      = new File([msPdfRes.data], "markscheme.pdf", { type: "application/pdf" });
  
          const fd = new FormData();
          fd.append("studentPdf",    studentFile);
          fd.append("markSchemePdf", msFile);
          fd.append("markingMode",   mode);
          if (guidanceText?.trim())         fd.append("guidance",   guidanceText.trim());
          // if (assignmentId.maxPoints) fd.append("totalGrade", assignmentId.maxPoints);
          if (assignmentId.maxPoints) fd.append("totalGrade", assignmentId.maxPoints);
  // if (maxGrade) fd.append("totalGrade", maxGrade);
  
          const res = await api.post("/marking/mark", fd, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 600000
          });
  
          setBulkProgress(p => ({ ...p, [student.submissionId]: { status: "done", result: res.data, studentFile } }));
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

        } 
        

        catch (err) {
          console.error(`Bulk mark failed for ${student.name}:`, err.message);
          setBulkProgress(p => ({ ...p, [student.submissionId]: "error" }));
          
          setBulkErrors(e => ({
          ...e,
            [student.submissionId]: 
            {
              message: extractHumanError(err),
              raw: err.response?.data
            }
            }));
        }
      }
      setBulkMarking(false);
      toast.success("Bulk marking complete");
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
      const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
      // const total = editingQuestions.reduce(
      //   (s, q) => s + (typeof q.marksAwarded === "number" ? q.marksAwarded : 0),0);
      
      const isUngraded =
        maxGrade == null ||
        resultModal?.result?.totalMarks == null;

      const pdfBytes = await annotatePdf({
        studentFile: resultModal.studentFile,
        questions: editingQuestions,
        totalMarks: isUngraded ? "Ungraded" : total,
        maxTotalMarks: isUngraded ? "" : maxGrade,
        summary:       resultModal.result.summary || ""
      });

      const url = URL.createObjectURL(new Blob([pdfBytes]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resultModal.student.name}_graded.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");      
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const getScoreColor = (awarded, max) => {
    if (!max) return "#399cf2";
    const pct = awarded / max;
    if (pct >= 0.75) return "#22c55e";
    if (pct >= 0.5)  return "#f59e0b";
    return "#ef4444";
  };

  const returnToStudent = async () => {
    if (!resultModal) return;

    setReturning(true);
    try {
      const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);

      const pdfBytes = await annotatePdf({
        studentFile: resultModal.studentFile,
        questions: editingQuestions,
        totalMarks: total,
        maxTotalMarks: maxGrade,
        summary:       resultModal.result.summary || ""
      });


      const fd = new FormData();
      fd.append("annotatedPdf",  new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId",  assignmentId);
      fd.append("submissionId",  resultModal.student.submissionId);
      fd.append("totalMarks",    effectiveTotal);
      fd.append("maxTotalMarks", effectiveMaxTotal);
      fd.append("studentName",   resultModal.student.name || "Student");
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

//   const returnAllToStudents = async () => {
//     const doneStudents = students.filter(s => {
//       const bulk = bulkProgress[s.submissionId];
//       return bulk?.status === "done" && bulk?.result && bulk?.studentFile;
//     });

//     if (!doneStudents.length) {
//       toast.warn("No graded students to return");
//       return;
//     }

//     setReturning(true);

//     try {
//       for (const student of doneStudents) {
//         const bulk = bulkProgress[student.submissionId];

//         const editingQs = bulk.result.questions || [];

// const total =
//   bulk.result?.criteriaGrade?.totalMarks ??
//   bulk.result?.totalMarks ??       // ← already there, good
//   editingQs.reduce((s, q) => s + (q.marksAwarded || 0), 0);
// const max =
//   bulk.result?.criteriaGrade?.maxTotalMarks ??
//   bulk.result?.maxTotalMarks ??   // ← add this line
//   maxGrade ??
//   0;


//         const pdfBytes = await annotatePdf({
//           studentFile: bulk.studentFile,
//           questions: editingQs,
//           totalMarks: total,
//           maxTotalMarks: max,
//           summary: bulk.result.summary || ""
//         });

//         const fd = new FormData();
//         fd.append( "annotatedPdf",new Blob([pdfBytes], { type: "application/pdf" }),"graded.pdf");
//         fd.append("assignmentId", assignmentId);
//         fd.append("submissionId", student.submissionId);
//         fd.append("totalMarks",    total);
//         fd.append("maxTotalMarks", max);
//         fd.append("studentName", student.name || "Student");

//         await api.post("/submission-files/return-marked", fd, {
//           headers: { "Content-Type": "multipart/form-data" },
//           timeout: 120000
//         });
//   //       setStudents(prev =>
//   //   prev.map(s =>
//   //     s.submissionId === student.submissionId
//   //       ? {
//   //           ...s,
//   //           assignedGrade: total
//   //         }
//   //       : s
//   //   )
//   // );

//       }

//       toast.success("All graded papers returned");
//     } catch (err) {
      
//   console.error("RETURN ALL ERROR", err);
//   console.error("STATUS", err.response?.status);
//   console.error("DATA", err.response?.data);

//   toast.error(
//     err.response?.data?.message ||
//     `Bulk return failed (${err.response?.status})`
//   );
//     } finally {
//       setReturning(false);
//     }
//   };

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
      const editingQs = bulk.result.questions || [];

      const total =
        bulk.result?.criteriaGrade?.totalMarks ??
        bulk.result?.totalMarks ??
        editingQs.reduce((s, q) => s + (q.marksAwarded || 0), 0);

      const max =
        bulk.result?.criteriaGrade?.maxTotalMarks ??
        bulk.result?.maxTotalMarks ??   // ← your fix from before
        maxGrade ??
        0;

      const pdfBytes = await annotatePdf({
        studentFile: bulk.studentFile,
        questions: editingQs,
        totalMarks: total,
        maxTotalMarks: max,
        summary: bulk.result.summary || ""
      });

      const fd = new FormData();
      fd.append("annotatedPdf", new Blob([pdfBytes], { type: "application/pdf" }), "graded.pdf");
      fd.append("assignmentId", assignmentId);
      fd.append("submissionId", student.submissionId);
      fd.append("totalMarks", total);
      fd.append("maxTotalMarks", max);
      fd.append("studentName", student.name || "Student");

      await api.post("/submission-files/return-marked", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });

      // ← mark as returned so re-clicking Return All skips them
      setBulkProgress(p => ({
        ...p,
        [student.submissionId]: { ...bulk, returned: true }
      }));
    }

    toast.success("All graded papers returned");
  } catch (err) {
    console.error("RETURN ALL ERROR", err);
    toast.error(
      err.response?.data?.message ||
      `Bulk return failed (${err.response?.status})`
    );
  } finally {
    setReturning(false);
  }
};

  const getStatusBadge = (s) => {
      if (s.state === "TURNED_IN" || s.state === "RETURNED") {
      if (s.isLate)   return <span className="ma-badge ma-badge--orange">Late</span>;
      if (s.isOnTime) return <span className="ma-badge ma-badge--green">On Time</span>;
      return <span className="ma-badge ma-badge--green">Submitted</span>;
    }
    if (s.state === "NEW" || s.state === "CREATED")
      return <span className="ma-badge ma-badge--red">Not Submitted</span>;
    return <span className="ma-badge ma-badge--gray">{s.state}</span>;
  };
  
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

const isCriteria = resultModal?.result?.markingMode === "criteria";

const total = editingQuestions.reduce((s, q) => s + q.marksAwarded, 0);
const max   = effectiveMaxTotal;
const pct   = max > 0 ? Math.round((total / max) * 100) : 0;
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
                <button onClick={fetchStudents} className="ma-send-btn">
                  <FiRefreshCw /> Refresh
                </button>

                <button onClick={() => navigate(-1)} className="msv-cancel-btn">
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

        <button
          className="ma-send-btn"
          onClick={() => document.getElementById("ms-upload").click()}
        >
          {uploadingMs ? "Uploading…" : msInfo ? "Replace MS" : "Upload MS"}
        </button>

        {msInfo && (
          <button
            className="msv-btn-ai"
            // onClick={runBulkMark}
            onClick={() => openGuidanceModal()}
            disabled={bulkMarking}
          >
            {bulkMarking ? "Marking all…" : "Mark All"}
          </button>
        )}
            {msInfo && !bulkMarking && (
      <button
        className="msv-btn-ai"
        onClick={returnAllToStudents}
        disabled={returning}
        style={{ marginLeft: 10, background: "rgba(34,197,94,0.15)" }}
      >
        {returning ? "Returning…" : "Return All"}
      </button>
    )}
      </div>

        {/* TABLE */}
          {loading ? <p className="ma-loading-msg">Loading...</p> : (
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
                    
                    
                    return (
                      <tr
                        key={s.submissionId}
                        className="ma-row"
                        style={{ animationDelay: `${i * 0.025}s` }}
                      >

                        {/* NAME */}
                        <td>
                          <div className="ma-avatar-cell">
                            <div className="ma-avatar">
                              {(s.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <span className="ma-cell-name">{s.name || "—"}</span>
                          </div>
                        </td>

                        {/* STATUS */}
                        <td>{getStatusBadge(s)}</td>

                        {/* SUBMITTED AT */}
                        <td>
                          <span className="ma-cell-muted">
                            {s.submittedAt
                              ? new Date(s.submittedAt).toLocaleString()
                              : "—"}
                          </span>
                        </td>

                        {/* GRADE */}
                        <td>
                          {s.assignedGrade != null ? (
                            <span className="ma-grade-pill">
                              {s.assignedGrade}
                            </span>
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
          {msInfo && (
            <>
              <button
                className={`msv-action-btn msv-action-btn--ai ${
                  bulkDone
                    ? "msv-action-btn--done"
                    : bulk === "error"
                    ? "msv-action-btn--error"
                    : ""
                }`}
                title="Mark with AI"
                onClick={() => {
                  if (bulkDone) {
                    setResultModal({
                      student: s,
                      result: bulk.result,
                      studentFile: bulk.studentFile
                    });
                    setEditingQuestions(bulk.result.questions.map(q => ({ ...q })));
                    setEditingMaxTotal(null);
                  } else {
                    openGuidanceModal(s);
                  }
                }}
                disabled={
                  markingStudentId === s.submissionId || bulk === "marking"
                }
              >
                {markingStudentId === s.submissionId || bulk === "marking"
                  ? <span className="pm-spinner" />
                  : bulkDone
                  ? "✅ Results"
                  : bulk === "error"
                  ? "❌ Retry"
                  : <><FiCpu size={12} /> Mark</>
                }
              </button>

              {bulk === "error" && (
                <button
                  className="msv-action-btn msv-action-btn--view"
                  title="View Error"
            //       onClick={() =>
            // setErrorViewer({
            //   open: true,
            //   title: `Marking Failed - ${s.name}`,
            //   message:
            //     bulkErrors[s.submissionId].message
            // })
            onClick={() =>
  openErrorViewer(`Marking Failed - ${s.name}`, bulkErrors[s.submissionId].message)
          }
                >
                  View Error
                </button>
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
                        onClick={e => {
                           e.stopPropagation(); 
                           setPromptDropdownOpen(v => !v); }}
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
                            // <div
                            //   key={p._id}
                            //   onMouseDown={(e) => { 
                            //     e.preventDefault(); // prevents blur/close race
                            //     e.stopPropagation(); 
                            //     setGuidance(p.content); 
                            //     setPromptDropdownOpen(false); }}
                            //   style={{ padding: "10px 14px", cursor: "pointer", borderBottom: i < savedPrompts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", background: guidance === p.content ? "rgba(57,156,242,0.12)" : "transparent" }}
                            //   onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                            //   onMouseLeave={e => e.currentTarget.style.background = guidance === p.content ? "rgba(57,156,242,0.12)" : "transparent"}
                            // >
                            //   <div style={{ fontSize: 13, fontWeight: 600, color: guidance === p.content ? "#399cf2" : "#e2e8f0", marginBottom: 3 }}>{guidance === p.content && "✓ "}{p.name}</div>
                            //   <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content.slice(0, 80)}{p.content.length > 80 ? "…" : ""}</div>
                            // </div>
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
                      onClick={handleGuidanceConfirm}
                      disabled={markingModeModal === "criteria" && !guidance.trim()}
                      style={{ flex: 1, justifyContent: "center", opacity: markingModeModal === "criteria" && !guidance.trim() ? 0.4 : 1 }}
                    >
                      <FiCpu size={14} />
                      {guidanceModal.bulk ? "Start Marking All" : "Start Marking"}
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
                              readOnly
                              type="number"
                              min={0}
                              max={effectiveMaxTotal}
                              value={total}
                              // value={editingTotal !== null ? editingTotal : effectiveTotal}
                              // onChange={e => setEditingTotal(Math.min(effectiveMaxTotal, Math.max(0, Number(e.target.value))))}
                              style={{
                                width: 56, padding: "3px 8px", borderRadius: 6,
                                border: `1px solid ${getScoreColor(effectiveTotal, effectiveMaxTotal)}`,
                                background: `${getScoreColor(effectiveTotal, effectiveMaxTotal)}15`,
                                color: getScoreColor(effectiveTotal, effectiveMaxTotal),
                                fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none",
                                // readonly: true,
                                cursor: "not-allowed"  // optional: makes it visually clear
                              }}
                            />
                            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>/</span>
                            <input
                              type="number"
                              min={1}
                              readOnly
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