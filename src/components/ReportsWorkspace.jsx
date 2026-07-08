import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import { toast } from "react-toastify";
import "../pages/manager/ManagerAssignments.css";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import {
  FiClipboard, FiUsers, FiSend,
  FiCheckSquare, FiMessageSquare,   FiCalendar,
  FiBarChart2,
} from "react-icons/fi";

import { SubmissionStatusBadge } from "../utils/submissionStatusBadge";
import { parseAttendanceNamesFromFile, buildInitialAttendanceMap, countPresentInMap } from "../utils/attendanceExcel";
import ReportAttendanceSelect from "./ReportAttendanceSelect";
import ReportGradesRefreshButton from "./ReportGradesRefreshButton";
import MonthlyParentReportWorkspace from "./MonthlyParentReportWorkspace";
import TeacherExecutiveAnalysisWorkspace from "./TeacherExecutiveAnalysisWorkspace";
import AssignmentReportPreviewModal from "./AssignmentReportPreviewModal";
import {
  refreshAssignmentGrades,
  applyReportCartGradeSync,
} from "../utils/refreshAssignmentFromClassroom";
import { computeGradePercent, parsePercentInput, displayPercent } from "../utils/reportGradePercent";
import { usePagination } from "../hooks/usePagination";
import { fetchAllPaginated } from "../utils/fetchAllStudents";
import Pagination from "./Pagination";
import ReportTeacherFilterSelect from "./ReportTeacherFilterSelect";
import {
  useReportTeacherFilter,
  useReportTeacherOptions,
  useClearClassroomOnTeacherFilter,
} from "../hooks/useReportTeacherFilter";


export default function ReportsWorkspace({ variant = "manager" }) {
  const isTeacher = variant === "teacher";
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [summaryMap, setSummaryMap] = useState({});
  const [reportCart, setReportCart] = useState({});
  const [sending, setSending] = useState(false);
  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [customPhone, setCustomPhone] = useState("");
  const [summaryViewer, setSummaryViewer] = useState({ open: false, title: "", message: "" });
  const [assignmentAttendance, setAssignmentAttendance] = useState({});
  const [parsingAttendanceForAssignment, setParsingAttendanceForAssignment] = useState(null);
  const [refreshingGrades, setRefreshingGrades] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [reportView, setReportView] = useState("assignment");
  const [preview, setPreview] = useState({ open: false, loading: false, error: null, previews: [] });

  const {
    teacherFilter,
    setTeacherFilter,
    allTeachers,
    classroomParams,
    showTeacherFilter,
  } = useReportTeacherFilter({
    isTeacher,
    userId: user?.id,
    classroomSearch,
  });

  const classroomsUrl = isTeacher
    ? user?.id
      ? `/google-classroom/teacher-courses/${user.id}`
      : "/google-classroom/teacher-courses/_"
    : "/students/my-classrooms";

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination(classroomsUrl, classroomParams, 20, "data", !!user?.id);

  const teacherOptions = useReportTeacherOptions(isTeacher, allTeachers, classrooms);

  const clearClassroomSelection = useCallback(() => {
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setReportCart({});
    setSummaryMap({});
  }, []);

  useClearClassroomOnTeacherFilter(teacherFilter, selectedClassroom, clearClassroomSelection);

  const assignmentParams = useMemo(() => ({
    search: assignmentSearch,
  }), [assignmentSearch]);

  const {
    data: assignments,
    page: assignmentPage,
    totalPages: assignmentTotalPages,
    fetchPage: fetchAssignmentPage,
    loading: loadingAssignmentsList,
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
    extra: studentExtra,
    error: studentFetchError,
  } = usePagination(
    selectedAssignment ? `/manager-assignments/${selectedAssignment._id}/full` : "/manager-assignments/_/full",
    {},
    10,
    "students",
    !!selectedAssignment?._id
  );

  useEffect(() => {
    if (studentExtra.summaryMap) {
      setSummaryMap(studentExtra.summaryMap);
    }
  }, [studentExtra]);

  useEffect(() => {
    if (!selectedAssignment?._id || loadingStudents) return;
    if (studentFetchError) {
      toast.error(`Could not load students: ${studentFetchError}`);
    } else if (studentExtra.googleUnavailable) {
      toast.warn("Google Classroom is unavailable — showing saved students without live submission status.");
    }
  }, [selectedAssignment?._id, loadingStudents, studentFetchError, studentExtra.googleUnavailable]);

  /* AUTH */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) { navigate("/login", { replace: true }); return; }
    const parsed = JSON.parse(storedUser);
    const role = parsed?.roleId?.name?.toLowerCase();
    if (isTeacher) {
      if (role !== "teacher") {
        navigate("/login", { replace: true });
        return;
      }
    } else if (role !== "manager" && role !== "quality manager") {
      navigate("/login", { replace: true });
      return;
    }
    setUser(parsed);
  }, [navigate, isTeacher]);

  /* SELECT CLASSROOM */
  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setReportCart({});
    setSummaryMap({});
    setIncludeAttendance(false);
    setAttendanceMap({});
    setAttendanceRoster([]);
    setAttendanceFileName("");
  };

  /* SELECT ASSIGNMENT */
  const selectAssignment = async (assignment) => {
    if (selectedAssignment?._id === assignment._id) {
      setSelectedAssignment(null);
      setSummaryMap({});
      return;
    }
    setSelectedAssignment(assignment);
    setSummaryMap({});
    setAttendanceMap({});
    setAttendanceRoster([]);
    setAttendanceFileName("");
  };

  const expandClassroomSection = () => {
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setReportCart({});
    setSummaryMap({});
    setIncludeAttendance(false);
    setAttendanceMap({});
    setAttendanceRoster([]);
    setAttendanceFileName("");
  };

  const expandAssignmentSection = () => {
    setSelectedAssignment(null);
    setSummaryMap({});
  };

  /* CART */
  const toggleStudent = (student) => {
    if (!selectedAssignment) return;
    const asgId = selectedAssignment._id;
    const stuId = String(student._id);
    setReportCart(prev => {
      const next = { ...prev };
      if (!next[stuId]) {
        next[stuId] = { studentMeta: student, items: { [asgId]: buildItem(student) } };
      } else if (next[stuId].items[asgId]) {
        const updatedItems = { ...next[stuId].items };
        delete updatedItems[asgId];
        if (Object.keys(updatedItems).length === 0) delete next[stuId];
        else next[stuId] = { ...next[stuId], items: updatedItems };
      } else {
        next[stuId] = { ...next[stuId], items: { ...next[stuId].items, [asgId]: buildItem(student) } };
      }
      return next;
    });
  };

  const selectAllStudentsForAssignment = async () => {
    if (!selectedAssignment) return;

    setSelectingAll(true);
    try {
      const allStudents = await fetchAllPaginated(
        api,
        `/manager-assignments/${selectedAssignment._id}/full`,
        {},
        "students",
        100
      );

      if (allStudents.length === 0) {
        toast.info("No students to select");
        return;
      }

      const asgId = selectedAssignment._id;

      setReportCart((prev) => {
        const next = { ...prev };

        allStudents.forEach((student) => {
          const stuId = String(student._id);

          if (!next[stuId]) {
            next[stuId] = {
              studentMeta: student,
              items: {
                [asgId]: buildItem(student),
              },
            };
          } else if (!next[stuId].items[asgId]) {
            next[stuId] = {
              ...next[stuId],
              items: {
                ...next[stuId].items,
                [asgId]: buildItem(student),
              },
            };
          }
        });

        return next;
      });

      toast.success(`Selected all ${allStudents.length} students`);
    } catch (err) {
      console.error("Select all students error:", err);
      toast.error("Failed to select all students");
    } finally {
      setSelectingAll(false);
    }
  };

  const buildItem = (student) => {
    const maxPoints =
      selectedAssignment?.maxPoints ?? studentExtra?.assignment?.maxPoints ?? null;
    return {
      assignmentTitle: selectedAssignment.title,
      assignmentId: selectedAssignment._id,
      submissionId: student.submissionId || null,
      state: student.state,
      submittedAt: student.submittedAt,
      isLate: student.isLate,
      isOnTime: student.isOnTime,
      assignedGrade: student.assignedGrade,
      percentage: computeGradePercent(student.assignedGrade, maxPoints) || null,
      comment: student.summary || summaryMap[student.submissionId] || "",
    };
  };

  const isStudentSelected = (studentId) =>
    !!(reportCart[String(studentId)]?.items[selectedAssignment?._id]);

  const setComment = (studentId, assignmentId, comment) => {
    setReportCart(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        items: {
          ...prev[studentId].items,
          [assignmentId]: { ...prev[studentId].items[assignmentId], comment }
        }
      }
    }));
  };

  const setPercentage = (studentId, assignmentId, percentage) => {
    setReportCart((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        items: {
          ...prev[studentId].items,
          [assignmentId]: { ...prev[studentId].items[assignmentId], percentage },
        },
      },
    }));
  };

  const assignmentMaxPoints =
    selectedAssignment?.maxPoints ?? studentExtra?.assignment?.maxPoints ?? null;

  const currentAssignmentAttendance = useMemo(() => {
    const id = selectedAssignment?._id ? String(selectedAssignment._id) : null;
    if (!id) return { enabled: false, map: {}, roster: [], fileName: "", date: "" };
    return (
      assignmentAttendance[id] || { enabled: false, map: {}, roster: [], fileName: "", date: "" }
    );
  }, [assignmentAttendance, selectedAssignment?._id]);

  const handleAttendanceToggle = (assignmentId, checked) => {
    const key = String(assignmentId);
    setAssignmentAttendance((prev) => {
      const current = prev[key] || { enabled: false, map: {}, roster: [], fileName: "", date: "" };
      return {
        ...prev,
        [key]: checked
          ? { ...current, enabled: true }
          : { enabled: false, map: {}, roster: [], fileName: "", date: "" },
      };
    });
  };

  const handleAttendanceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!selectedAssignment?._id) {
      toast.warn("Select an assignment first to match attendance to students");
      return;
    }

    const assignmentId = String(selectedAssignment._id);
    setParsingAttendanceForAssignment(assignmentId);
    try {
      const { names, date } = await parseAttendanceNamesFromFile(file);
      if (!names.length) {
        toast.warn("No student names found in that file");
        setAssignmentAttendance((prev) => ({
          ...prev,
          [assignmentId]: { enabled: true, map: {}, roster: [], fileName: "", date: date || "" },
        }));
        return;
      }

      const roster = await fetchAllPaginated(
        api,
        `/manager-assignments/${selectedAssignment._id}/full`,
        {},
        "students",
        100
      );

      const map = buildInitialAttendanceMap(roster, names, (s) => s._id);
      setAssignmentAttendance((prev) => ({
        ...prev,
        [assignmentId]: { enabled: true, map, roster, fileName: file.name, date: date || "" },
      }));
      const present = countPresentInMap(map);
      toast.success(
        `Matched ${roster.length} student(s) — ${present} present, ${roster.length - present} absent (editable in table)`
      );
    } catch (err) {
      toast.error(err?.message || "Failed to read attendance file");
      setAssignmentAttendance((prev) => ({
        ...prev,
        [assignmentId]: { enabled: true, map: {}, roster: [], fileName: "", date: "" },
      }));
    } finally {
      setParsingAttendanceForAssignment(null);
    }
  };

  const setStudentAttendance = (assignmentId, studentId, present) => {
    const key = String(assignmentId);
    setAssignmentAttendance((prev) => {
      const current = prev[key] || { enabled: true, map: {}, roster: [], fileName: "", date: "" };
      return {
        ...prev,
        [key]: {
          ...current,
          map: {
            ...(current.map || {}),
            [String(studentId)]: present,
          },
        },
      };
    });
  };

  const setAttendanceDate = (assignmentId, date) => {
    const key = String(assignmentId);
    setAssignmentAttendance((prev) => {
      const current = prev[key] || { enabled: true, map: {}, roster: [], fileName: "", date: "" };
      return {
        ...prev,
        [key]: {
          ...current,
          date,
        },
      };
    });
  };

  const showAttendanceColumn =
    currentAssignmentAttendance.enabled;

  const refreshGrades = async () => {
    if (!selectedAssignment?._id) return;
    setRefreshingGrades(true);
    try {
      const { students: freshList, summaryMap: freshSummary, maxPoints } =
        await refreshAssignmentGrades(api, selectedAssignment._id, "manager");

      if (freshSummary && Object.keys(freshSummary).length) {
        setSummaryMap((prev) => ({ ...prev, ...freshSummary }));
      }
      if (maxPoints != null) {
        setSelectedAssignment((prev) => (prev ? { ...prev, maxPoints } : prev));
      }
      setReportCart((prev) =>
        applyReportCartGradeSync(prev, freshList, maxPoints, (m) => m._id)
      );
      await fetchStudentPage(studentPage);
      toast.success(`Synced grades, max points, and percentages for ${freshList.length} student(s)`);
    } catch {
      toast.error("Failed to refresh grades");
    } finally {
      setRefreshingGrades(false);
    }
  };

  /* BUILD PAYLOAD — shared by preview and send so both produce the identical body */
  const resolveReports = async () => {
    const cartEntries = Object.entries(reportCart);
    if (cartEntries.length === 0) return null;

    let freshSummaryMap = summaryMap;
    let freshStudents = students;
    try {
      const fresh = await api.get(`/manager-assignments/${selectedAssignment._id}/full`, {
        params: { page: 1, limit: 5000 },
      });
      freshSummaryMap = fresh.data.summaryMap || summaryMap;
      freshStudents = fresh.data.students || students;
      setSummaryMap(freshSummaryMap);
    } catch {
      // use cached summaries if refresh fails
    }

    const studentById = Object.fromEntries(
      freshStudents.map((s) => [String(s._id), s])
    );

    const maxPointsForAssignment =
      selectedAssignment?.maxPoints ?? studentExtra?.assignment?.maxPoints ?? null;

    return cartEntries.map(([, entry]) => ({
      studentId: entry.studentMeta._id,
      name: entry.studentMeta.name,
      phone: entry.studentMeta.phone,
      parentPhone: entry.studentMeta.parentPhone,
      items: Object.values(entry.items).map((item) => {
        const liveStudent = studentById[String(entry.studentMeta._id)] || entry.studentMeta;
        const submissionId = item.submissionId || liveStudent?.submissionId;
        const assignedGrade = liveStudent?.assignedGrade ?? item.assignedGrade;
        const maxPoints = item.maxPoints ?? maxPointsForAssignment;
        const savedSummary =
          liveStudent?.summary ||
          (submissionId ? freshSummaryMap[submissionId] : "");
        const attendanceCfg =
          assignmentAttendance[String(item.assignmentId || selectedAssignment?._id)] ||
          { enabled: false, map: {}, date: "" };
        return {
          ...item,
          assignmentId: item.assignmentId || selectedAssignment._id,
          submissionId,
          state: liveStudent?.state ?? item.state,
          submittedAt: liveStudent?.submittedAt ?? item.submittedAt,
          isLate: liveStudent?.isLate ?? item.isLate,
          isOnTime: liveStudent?.isOnTime ?? item.isOnTime,
          assignedGrade,
          percentage:
            item.percentage ??
            (computeGradePercent(assignedGrade, maxPoints) || null),
          comment: (item.comment || savedSummary || "").trim(),
          includeAttendance: Boolean(attendanceCfg.enabled),
          attendancePresent: attendanceCfg.enabled
            ? Boolean(attendanceCfg.map?.[String(entry.studentMeta._id)])
            : null,
          attendanceDate: attendanceCfg.enabled ? (attendanceCfg.date || null) : null,
        };
      }),
    }));
  };

  /* PREVIEW — returns the exact WhatsApp text per student without sending */
  const previewReport = async () => {
    if (Object.keys(reportCart).length === 0) { toast.warn("No students selected"); return; }
    setPreview({ open: true, loading: true, error: null, previews: [] });
    try {
      const reports = await resolveReports();
      const res = await api.post("/manager-assignments/report-preview", {
        reports,
        classroomId: selectedClassroom?._id,
      });
      setPreview({ open: true, loading: false, error: null, previews: res.data.previews || [] });
    } catch {
      setPreview({ open: true, loading: false, error: "Failed to generate preview", previews: [] });
    }
  };

  const closePreview = () => setPreview({ open: false, loading: false, error: null, previews: [] });

  /* SEND */
  const sendReport = async () => {
    const reports = await resolveReports();
    if (!reports) { toast.warn("No students selected"); return; }
    setSending(true);
    try {
      const res = await api.post("/manager-assignments/send-report", {
        reports,
        classroomId: selectedClassroom?._id,
      });
      const summary = res.data.summary || [];
      const succeeded = summary.filter(r => r.status === "fulfilled").length;
      const failed = summary.filter(r => r.status === "rejected").length;
      toast.success(`✅ Sent to ${succeeded} student(s)${failed ? `, ${failed} failed` : ""}`);
      setReportCart({});
      closePreview();
    } catch {
      toast.error("Failed to send reports");
    } finally {
      setSending(false);
    }
  };

  const clearAllSelections = () => {
    setReportCart({});
  };

  const cartCount = Object.keys(reportCart).length;
  const reportCount = Object.values(reportCart).reduce(
    (acc, e) => acc + Object.keys(e.items || {}).length,
    0
  );
  const assignmentCount = new Set(
    Object.values(reportCart).flatMap((e) => Object.keys(e.items || {}))
  ).size;
  const cartSummary = `${assignmentCount} assignment${assignmentCount !== 1 ? "s" : ""} and ${reportCount} report${reportCount !== 1 ? "s" : ""}`;

  const statusBadge = (student) => <SubmissionStatusBadge student={student} />;

  const filteredClassrooms = classrooms;

  const filteredAssignments = assignments;


  const sendTeacherCollectiveReport = async () => {
    const cartEntries = Object.entries(reportCart);

    if (cartEntries.length === 0) {
      toast.warn("No students selected");
      return;
    }

    const reports = cartEntries.map(([, entry]) => ({
      name: entry.studentMeta.name,
      items: Object.values(entry.items)
    }));

    setSending(true);

    try {
      await api.post(
        "/manager-assignments/send-teacher-collective-report",
        {
          reports,
          classroomId: selectedClassroom?._id
        }
      );

      toast.success("Teacher collective PDF report sent");
    } catch {
      toast.error("Failed to send teacher report");
    } finally {
      setSending(false);
    }
  };

  const sendCustomCollectiveReport = async () => {
    const cartEntries = Object.entries(reportCart);

    if (cartEntries.length === 0) {
      toast.warn("No students selected");
      return;
    }

    if (!customPhone.trim()) {
      toast.warn("Enter phone number");
      return;
    }

    const reports = cartEntries.map(([, entry]) => ({
      name: entry.studentMeta.name,
      items: Object.values(entry.items)
    }));

    setSending(true);

    try {
      await api.post(
        "/manager-assignments/send-custom-collective-report",
        {
          reports,
          classroomId: selectedClassroom?._id,
          phone: customPhone
        }
      );

      toast.success("Custom PDF report sent");
    } catch {
      toast.error("Failed to send custom report");
    } finally {
      setSending(false);
    }
  };

  const pageTitle = isTeacher ? "Reports" : "Assignments";

  if (!user) return null;

  if (reportView === "monthly") {
    return (
      <MonthlyParentReportWorkspace
        variant={variant}
        onBack={() => setReportView("assignment")}
        onNavigate={setReportView}
      />
    );
  }

  if (reportView === "executive") {
    return (
      <TeacherExecutiveAnalysisWorkspace
        variant={variant}
        onBack={() => setReportView("assignment")}
        onNavigate={setReportView}
      />
    );
  }

  const mainContent = (
      <main className="ma-main">

        {/* TOPBAR */}
        <header className="ma-topbar">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">{pageTitle}</h1>
            <span className="ma-topbar-sub">
              {selectedClassroom
                ? selectedAssignment
                  ? `${selectedClassroom.name} — ${selectedAssignment.title}`
                  : `Select an assignment from ${selectedClassroom.name}`
                : `Welcome back, ${user.name}`}
            </span>
            <div className="ma-report-tabs">
              <button
                type="button"
                className="ma-report-tab ma-report-tab--active"
              >
                Assignment Reports
              </button>
              <button
                type="button"
                className="ma-report-tab"
                onClick={() => setReportView("monthly")}
              >
                <FiCalendar size={12} /> Monthly Parent Reports
              </button>
              {!isTeacher && (
                <button
                  type="button"
                  className="ma-report-tab"
                  onClick={() => setReportView("executive")}
                >
                  <FiBarChart2 size={12} /> Teacher Executive Analysis
                </button>
              )}
            </div>
          </div>
          {reportCount > 0 && (
            <div className="ma-topbar-right">
              <div className="ma-cart-pill">
                <FiCheckSquare size={13} />
                <span>{cartSummary}</span>
              </div>
              <button
                className="ma-send-btn"
                onClick={previewReport}
                disabled={sending || preview.loading}
              >
                <FiMessageSquare size={13} />
                {preview.loading ? "Loading…" : "Preview Report"}
              </button>
              <button className="ma-send-btn" onClick={sendReport} disabled={sending}>
                <FiSend size={13} />
                {sending ? "Sending…" : `Send Report`}
              </button>
              {!isTeacher && (
                <button
                  className="ma-send-btn"
                  onClick={sendTeacherCollectiveReport}
                  disabled={sending}
                >
                  <FiSend size={13} />
                  {sending ? "Sending…" : "Send Teacher Collective PDF"}
                </button>
              )}
              <div style={{ minWidth: "260px" }}>
                <PhoneInput
                  defaultCountry="eg"
                  value={`+${customPhone}`}
                  onChange={(value) =>
                    setCustomPhone(value.replace(/\D/g, ""))
                  }
                  className="tm-phone-input"
                  countrySelectorStyleProps={{
                    dropdownStyleProps: {
                      style: {
                        maxHeight: "350px",
                        zIndex: 9999
                      }
                    }
                  }}
                />
              </div>
              <button
                className="ma-send-btn"
                onClick={sendCustomCollectiveReport}
                disabled={sending}
              >
                <FiSend size={13} />
                {sending ? "Sending…" : "Send Custom Collective PDF"}
              </button>
            </div>
          )}
        </header>

        <div className="ma-content">
          <div className="ma-layout msv-collapsible-layout">
          {/* COLUMN 1 — CLASSROOMS */}
          {!selectedClassroom ? (
          <div className="ma-column">
            <p className="ma-section-label msv-section-header-expanded">▼ Select Classroom</p>

            <input
              className="ma-search-input"
              placeholder="Search classrooms..."
              value={classroomSearch}
              onChange={(e) => setClassroomSearch(e.target.value)}
            />

            <ReportTeacherFilterSelect
              show={showTeacherFilter}
              value={teacherFilter}
              onChange={setTeacherFilter}
              teachers={teacherOptions}
            />

            <div className="ma-scroll-list">
              {filteredClassrooms.map(c => (
                <div
                  key={c._id}
                  className={`ma-classroom-card ${
                    selectedClassroom?._id === c._id
                      ? "ma-classroom-card--active"
                      : ""
                  }`}
                  onClick={() => selectClassroom(c)}
                >
                  <div className="ma-classroom-icon">
                    <FiUsers size={15} />
                  </div>
                  <div className="ma-classroom-info">
                    <span className="ma-classroom-name">{c.name}</span>
                    {c.section && (
                      <span className="ma-classroom-section">{c.section}</span>
                    )}
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

          {/* COLUMN 2 — ASSIGNMENTS */}
          {selectedClassroom && (
            !selectedAssignment ? (
          <div className="ma-column">
            <p className="ma-section-label msv-section-header-expanded">▼ Select Assignment</p>

            <input
              className="ma-search-input"
              placeholder="Search assignments..."
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
            />

            <div className="ma-scroll-list">
              {filteredAssignments.map(a => (
                  <div
                    key={a._id}
                    className={`ma-assignment-card ${
                      selectedAssignment?._id === a._id
                        ? "ma-assignment-card--active"
                        : ""
                    }`}
                    onClick={() => selectAssignment(a)}
                  >
                    <div className="ma-assignment-icon">
                      <FiClipboard size={14} />
                    </div>
                    <div className="ma-assignment-info">
                      <span className="ma-assignment-title">{a.title}</span>
                      {a.dueDate && (
                        <span className="ma-assignment-due">
                          <FiCalendar size={10} />
                          {new Date(a.dueDate).toLocaleDateString()}
                        </span>
                      )}
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

          {/* COLUMN 3 — STUDENTS */}
          {selectedAssignment && (
          <div className="ma-right-panel msv-right-panel-full">
              <div className="ma-panel">
                <div className="ma-panel-header">
                  <div className="ma-panel-title-wrap">
                    <div className="ma-panel-dot" />
                    <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                    <span className="ma-panel-count">{studentTotal ?? students.length} students</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <ReportGradesRefreshButton
                    onClick={refreshGrades}
                    loading={refreshingGrades}
                    disabled={!selectedAssignment}
                  />
                  <button
                    className="ma-send-btn"
                    onClick={selectAllStudentsForAssignment}
                    disabled={selectingAll || loadingStudents || !selectedAssignment}
                  >
                    {selectingAll ? "Selecting…" : "Select All"}
                  </button>

                  <button
                    className="ma-send-btn"
                    onClick={clearAllSelections}
                    disabled={cartCount === 0}
                  >
                    Clear All
                  </button>
                </div>
                  {reportCount > 0 && (
                    <span className="ma-panel-hint">
                      <FiCheckSquare size={12} /> {reportCount} report{reportCount !== 1 ? "s" : ""} ready
                    </span>
                  )}
                </div>

                {selectedAssignment && (
                  <div className="ma-attendance-bar">
                    <label className="ma-attendance-check">
                      <input
                        type="checkbox"
                        checked={Boolean(currentAssignmentAttendance.enabled)}
                        onChange={(e) =>
                          handleAttendanceToggle(selectedAssignment._id, e.target.checked)
                        }
                      />
                      <span>Add attendance for this assignment</span>
                    </label>
                    {currentAssignmentAttendance.enabled && (
                      <div className="ma-attendance-upload">
                        <label className="ma-attendance-file-btn">
                          {parsingAttendanceForAssignment === String(selectedAssignment._id)
                            ? "Reading file…"
                            : "Upload Excel"}
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleAttendanceFile}
                            disabled={
                              parsingAttendanceForAssignment === String(selectedAssignment._id)
                            }
                            hidden
                          />
                        </label>
                        {currentAssignmentAttendance.fileName && (
                          <span className="ma-attendance-meta">
                            {currentAssignmentAttendance.fileName} ·{" "}
                            {countPresentInMap(currentAssignmentAttendance.map)} present /{" "}
                            {Object.keys(currentAssignmentAttendance.map || {}).length} students
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {loadingStudents && <p className="ma-loading-msg">Loading students…</p>}

                {!loadingStudents && students.length === 0 && (
                  <p className="ma-empty-msg">
                    {studentFetchError
                      ? "Could not load students. Check your Google Classroom connection."
                      : studentTotal === 0
                        ? "No students synced for this classroom. Open Students Data and run Sync."
                        : "No students found."}
                  </p>
                )}

                {!loadingStudents && students.length > 0 && (
                  <div className="ma-table-wrap">
                    <div className="ma-table-scroll">
                      <table className="ma-table">
                        <thead>
                          <tr>
                            <th style={{ width: 44 }}></th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            {showAttendanceColumn && <th>Attendance</th>}
                            {showAttendanceColumn && <th>Date</th>}
                            <th>Submitted At</th>
                            <th>Grade</th>
                            <th>%</th>
                            <th>Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((s, i) => {
                            const selected = isStudentSelected(s._id);
                            const stuId = String(s._id);
                            const asgId = selectedAssignment._id;
                            return (
                              <tr
                                key={s._id}
                                className={`ma-row ${selected ? "ma-row--selected" : ""}`}
                                style={{ animationDelay: `${i * 0.025}s` }}
                                onClick={() => toggleStudent(s)}
                              >
                                <td>
                                  <div className={`ma-check ${selected ? "ma-check--on" : ""}`}>
                                    {selected && "✓"}
                                  </div>
                                </td>
                                <td>
                                  <div className="ma-avatar-cell">
                                    <div className="ma-avatar">
                                      {(s.name || s.email || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <span className="ma-cell-name">{s.name || <span className="ma-cell-empty">—</span>}</span>
                                  </div>
                                </td>
                                <td><span className="ma-cell-muted">{s.email || "—"}</span></td>
                                <td>{statusBadge(s)}</td>
                                {showAttendanceColumn && (
                                  <td onClick={(e) => e.stopPropagation()}>
                                    <ReportAttendanceSelect
                                      present={!!currentAssignmentAttendance.map?.[stuId]}
                                      onChange={(present) =>
                                        setStudentAttendance(asgId, stuId, present)
                                      }
                                    />
                                  </td>
                                )}
                                {showAttendanceColumn && (
                                  <td onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="date"
                                      className="ma-attendance-date"
                                      value={currentAssignmentAttendance.date || ""}
                                      onChange={(e) =>
                                        setAttendanceDate(asgId, e.target.value)
                                      }
                                    />
                                  </td>
                                )}
                                <td>
                                  <span className="ma-cell-muted">
                                    {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                                  </span>
                                </td>
                                <td>
                                  {s.assignedGrade != null
                                    ? <span className="ma-grade-pill">{s.assignedGrade}</span>
                                    : <span className="ma-cell-empty">—</span>}
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                  {s.assignedGrade != null && assignmentMaxPoints ? (
                                    selected ? (
                                      <div className="ma-percent-wrap">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          className="ma-percent-input"
                                          value={
                                            reportCart[stuId]?.items[asgId]?.percentage ??
                                            computeGradePercent(s.assignedGrade, assignmentMaxPoints)
                                          }
                                          onChange={(e) =>
                                            setPercentage(
                                              stuId,
                                              asgId,
                                              parsePercentInput(e.target.value)
                                            )
                                          }
                                        />
                                        <span className="ma-percent-suffix">%</span>
                                      </div>
                                    ) : (
                                      <span className="ma-percent-readonly">
                                        {displayPercent(
                                          s.assignedGrade,
                                          assignmentMaxPoints,
                                          null
                                        ) || "—"}
                                        {displayPercent(s.assignedGrade, assignmentMaxPoints, null)
                                          ? "%"
                                          : ""}
                                      </span>
                                    )
                                  ) : (
                                    <span className="ma-cell-empty">—</span>
                                  )}
                                </td>
                                <td onClick={e => e.stopPropagation()}>
                                  {selected ? (
                                    <div className="ma-comment-wrap">
                                      <FiMessageSquare size={12} className="ma-comment-icon" />
                                      <input
                                        className="ma-comment-input"
                                        placeholder="Add comment…"
                                        value={reportCart[stuId]?.items[asgId]?.comment || ""}
                                        onChange={e => setComment(stuId, asgId, e.target.value)}
                                      />
                                    </div>
                                  ) : (s.summary || summaryMap[s.submissionId]) ? (
                                    <button
                                      className="msv-action-btn msv-action-btn--view"
                                      title="View Summary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSummaryViewer({
                                          open: true,
                                          title: `Summary – ${s.name}`,
                                          message: s.summary || summaryMap[s.submissionId]
                                        });
                                      }}
                                    >
                                      View Summary
                                    </button>
                                  ) : null}
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

        {/* CART BAR */}
        {reportCount > 0 && (
          <div className="ma-cart-bar">
            <div className="ma-cart-bar-left">
              <div className="ma-cart-icon-wrap" aria-hidden="true">
                <FiClipboard size={26} />
              </div>
              <div className="ma-cart-bar-info">
                <span className="ma-cart-label">Report Ready</span>
                <div className="ma-cart-stats-row">
                  <span className="ma-cart-stat">
                    <strong>{assignmentCount}</strong>
                    <em>assignment{assignmentCount !== 1 ? "s" : ""}</em>
                  </span>
                  <span className="ma-cart-stat-divider" aria-hidden="true">·</span>
                  <span className="ma-cart-stat">
                    <strong>{reportCount}</strong>
                    <em>report{reportCount !== 1 ? "s" : ""}</em>
                  </span>
                </div>
              </div>
            </div>
            <div className="ma-cart-bar-actions">
              <button
                className="ma-send-btn"
                onClick={previewReport}
                disabled={sending || preview.loading}
              >
                <FiMessageSquare size={16} />
                {preview.loading ? "Loading…" : "Preview"}
              </button>
              <button className="ma-cart-send-btn" onClick={sendReport} disabled={sending}>
                <FiSend size={18} />
                {sending ? "Sending…" : `Send ${reportCount} Report${reportCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        <AssignmentReportPreviewModal
          open={preview.open}
          loading={preview.loading}
          error={preview.error}
          previews={preview.previews}
          sending={sending}
          onClose={closePreview}
          onConfirm={sendReport}
        />

        {summaryViewer.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onClick={() =>
              setSummaryViewer({
                open: false,
                title: "",
                message: ""
              })
            }
          >
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 14,
                padding: 24,
                width: "min(520px, 90vw)",
                border: "1px solid rgba(139,92,246,0.3)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: "#fff",
                    fontSize: 15
                  }}
                >
                  {summaryViewer.title}
                </span>

                <button
                  onClick={() =>
                    setSummaryViewer({
                      open: false,
                      title: "",
                      message: ""
                    })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    fontSize: 18
                  }}
                >
                  ✕
                </button>
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.7,
                  margin: 0
                }}
              >
                {summaryViewer.message}
              </p>
            </div>
          </div>
)}

      </main>
  );

  if (isTeacher) {
    return <div className="ma-root ma-root--embedded">{mainContent}</div>;
  }

  return mainContent;
}