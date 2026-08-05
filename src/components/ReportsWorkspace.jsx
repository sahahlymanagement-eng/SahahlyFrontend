import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import { toast } from "react-toastify";
import { downloadBlob } from "../utils/downloadBlob";
import "../pages/manager/ManagerAssignments.css";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import {
  FiClipboard, FiUsers, FiSend,
  FiCheckSquare, FiMessageSquare, FiCalendar,
  FiBarChart2, FiDownload, FiEye, FiChevronRight,
  FiInfo, FiX, FiClock,
} from "react-icons/fi";
import "./ReportsWorkspace.css";
import ReportAutomationRuleModal from "./ReportAutomationRuleModal";

import { SubmissionStatusBadge } from "../utils/submissionStatusBadge";
import { parseAttendanceNamesFromFile, buildInitialAttendanceMap, countPresentInMap } from "../utils/attendanceExcel";
import ReportAttendanceSelect from "./ReportAttendanceSelect";
import ReportGradesRefreshButton from "./ReportGradesRefreshButton";
import MonthlyParentReportWorkspace from "./MonthlyParentReportWorkspace";
import TeacherExecutiveAnalysisWorkspace from "./TeacherExecutiveAnalysisWorkspace";
import ReportsSentWorkspace from "./ReportsSentWorkspace";
import AssignmentReportPreviewModal from "./AssignmentReportPreviewModal";
import ReportPdfPreview from "./ReportPdfPreview";
import "./MonthlyParentReport.css";
import {
  refreshAssignmentGrades,
  applyReportCartGradeSync,
} from "../utils/refreshAssignmentFromClassroom";
import { computeGradePercent, parsePercentInput, displayPercent, resolveReportDisplayPercent } from "../utils/reportGradePercent";
import { usePagination } from "../hooks/usePagination";
import usePersistedState from "../hooks/usePersistedState";
import { fetchAllPaginated } from "../utils/fetchAllStudents";
import Pagination from "./Pagination";
import ReportTeacherFilterSelect from "./ReportTeacherFilterSelect";
import {
  useReportTeacherFilter,
  useReportTeacherOptions,
  useClearClassroomOnTeacherFilter,
} from "../hooks/useReportTeacherFilter";
import { isDirectorLikeRole, isDirectorLikeVariant } from "../utils/directorLikeAccess";
import { getRoleName } from "../utils/authRoutes";
import { useClassroomRosterSync } from "../hooks/useClassroomRosterSync";
import { confirmToast } from "../utils/confirmToast";


export default function ReportsWorkspace({ variant = "manager" }) {
  const isTeacher = variant === "teacher";
  const isAssistant = variant === "assistant";
  const isDirector = isDirectorLikeVariant(variant);
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  const [selectedClassroom, setSelectedClassroom] = usePersistedState(`reports:${variant}:classroom`, null);
  const [selectedAssignment, setSelectedAssignment] = usePersistedState(`reports:${variant}:assignment`, null);
  const [summaryMap, setSummaryMap] = useState({});
  const [reportCart, setReportCart] = useState({});
  const [sending, setSending] = useState(false);
  const activeSendIdRef = useRef(null);
  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [checkedAssignments, setCheckedAssignments] = useState({});
  const [customPhone, setCustomPhone] = useState("");
  const [showAutoSendModal, setShowAutoSendModal] = useState(false);
  const [summaryViewer, setSummaryViewer] = useState({ open: false, title: "", message: "" });
  const [assignmentAttendance, setAssignmentAttendance] = useState({});
  const [parsingAttendanceForAssignment, setParsingAttendanceForAssignment] = useState(null);
  const [refreshingGrades, setRefreshingGrades] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [reportView, setReportView] = usePersistedState(`reports:${variant}:view`, "assignment");
  const [preview, setPreview] = useState({ open: false, loading: false, error: null, previews: [] });
  const [previewClassroomId, setPreviewClassroomId] = useState(null);
  const [studentFilter, setStudentFilter] = useState("all");
  const [collectiveTab, setCollectiveTab] = useState("teacher");
  const [showCollectivePanel, setShowCollectivePanel] = useState(false);

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
    loadGlobalTeachers: isDirector,
    omitPersonId: isDirector,
  });

  const classroomsUrl = isTeacher
    ? user?.id
      ? `/google-classroom/teacher-courses/${user.id}`
      : "/google-classroom/teacher-courses/_"
    : isDirector
      ? "/google-classroom/courses"
      : "/students/my-classrooms";

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination(
    classroomsUrl,
    classroomParams,
    isDirector ? 50 : 20,
    "data",
    isDirector ? true : !!user?.id
  );

  const teacherOptions = useReportTeacherOptions(isTeacher, allTeachers, classrooms);

  const clearClassroomSelection = useCallback(() => {
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setReportCart({});
    setSummaryMap({});
    setCheckedAssignments({});
  }, []);

  useClearClassroomOnTeacherFilter(teacherFilter, selectedClassroom, clearClassroomSelection);

  useClassroomRosterSync(selectedClassroom?._id, {
    enabled: Boolean(selectedClassroom?._id),
    autoSync: Boolean(selectedClassroom?._id),
  });

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
    const role = getRoleName(parsed);
    if (isTeacher) {
      if (role !== "teacher") {
        navigate("/login", { replace: true });
        return;
      }
    } else if (isAssistant) {
      if (role !== "assistant") {
        navigate("/login", { replace: true });
        return;
      }
    } else if (isDirector) {
      if (!isDirectorLikeRole(role)) {
        navigate("/login", { replace: true });
        return;
      }
    } else if (role !== "manager" && role !== "quality manager") {
      navigate("/login", { replace: true });
      return;
    }
    setUser(parsed);
  }, [navigate, isTeacher, isAssistant, isDirector]);

  /* SELECT CLASSROOM */
  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setReportCart({});
    setSummaryMap({});
    setAssignmentAttendance({});
    setCheckedAssignments({});
    setStudentFilter("all");
    setShowCollectivePanel(false);
    closePreview();
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
    setStudentFilter("all");
  };

  const expandClassroomSection = () => {
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setReportCart({});
    setSummaryMap({});
    setAssignmentAttendance({});
    setCheckedAssignments({});
    setStudentFilter("all");
    setShowCollectivePanel(false);
    closePreview();
  };

  const toggleAssignmentChecked = (assignment, event) => {
    event?.stopPropagation();
    const id = String(assignment._id);
    setCheckedAssignments((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = assignment;
      return next;
    });
  };

  const toggleAllAssignmentsOnPage = (checked) => {
    setCheckedAssignments((prev) => {
      const next = { ...prev };
      assignments.forEach((assignment) => {
        const id = String(assignment._id);
        if (checked) next[id] = assignment;
        else delete next[id];
      });
      return next;
    });
  };

  const checkedAssignmentCount = Object.keys(checkedAssignments).length;

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

  const selectAllStudentsForCheckedAssignments = async () => {
    const assignmentsToAdd = Object.values(checkedAssignments);
    if (assignmentsToAdd.length === 0) {
      toast.warn("Check one or more assignments for the collective report");
      return;
    }

    setSelectingAll(true);
    try {
      let nextCart = { ...reportCart };

      for (const assignment of assignmentsToAdd) {
        const asgId = String(assignment._id);
        const allStudents = await fetchAllPaginated(
          api,
          `/manager-assignments/${assignment._id}/full`,
          {},
          "students",
          100
        );

        allStudents.forEach((student) => {
          const stuId = String(student._id);
          const item = buildItem(student, assignment);

          if (!nextCart[stuId]) {
            nextCart[stuId] = {
              studentMeta: student,
              items: { [asgId]: item },
            };
          } else if (!nextCart[stuId].items[asgId]) {
            nextCart[stuId] = {
              ...nextCart[stuId],
              items: {
                ...nextCart[stuId].items,
                [asgId]: item,
              },
            };
          }
        });
      }

      setReportCart(nextCart);
      toast.success(
        `Selected all students from ${assignmentsToAdd.length} assignment${
          assignmentsToAdd.length !== 1 ? "s" : ""
        }`
      );
    } catch (err) {
      console.error("Select all for checked assignments error:", err);
      toast.error("Failed to select students for checked assignments");
    } finally {
      setSelectingAll(false);
    }
  };

  /**
   * Adds only the students already picked in the cart (from any open
   * assignment's roster) to every checked assignment — so a collective
   * report can target specific students instead of the whole class.
   */
  const addSelectedStudentsToCheckedAssignments = async () => {
    const assignmentsToAdd = Object.values(checkedAssignments);
    if (assignmentsToAdd.length === 0) {
      toast.warn("Check one or more assignments first");
      return;
    }
    const selectedIds = new Set(Object.keys(reportCart));
    if (!selectedIds.size) {
      toast.warn("Open an assignment and tick the students you want first");
      return;
    }

    setSelectingAll(true);
    try {
      let nextCart = { ...reportCart };
      let added = 0;

      for (const assignment of assignmentsToAdd) {
        const asgId = String(assignment._id);
        const allStudents = await fetchAllPaginated(
          api,
          `/manager-assignments/${assignment._id}/full`,
          {},
          "students",
          100
        );

        allStudents.forEach((student) => {
          const stuId = String(student._id);
          if (!selectedIds.has(stuId)) return;
          if (nextCart[stuId]?.items[asgId]) return;
          nextCart[stuId] = {
            ...nextCart[stuId],
            items: {
              ...nextCart[stuId].items,
              [asgId]: buildItem(student, assignment),
            },
          };
          added += 1;
        });
      }

      setReportCart(nextCart);
      toast.success(
        `Added ${selectedIds.size} selected student${selectedIds.size !== 1 ? "s" : ""} across ${assignmentsToAdd.length} assignment${assignmentsToAdd.length !== 1 ? "s" : ""}` +
          (added === 0 ? " (already added)" : "")
      );
    } catch (err) {
      console.error("Add selected students to checked assignments error:", err);
      toast.error("Failed to add selected students to checked assignments");
    } finally {
      setSelectingAll(false);
    }
  };

  const buildItem = (student, assignment = selectedAssignment) => {
    const maxPoints =
      assignment?.maxPoints ?? studentExtra?.assignment?.maxPoints ?? null;
    return {
      assignmentTitle: assignment?.title,
      assignmentId: assignment?._id,
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

  const selectedStudentCount = useMemo(
    () => students.filter((s) => isStudentSelected(s._id)).length,
    [students, reportCart, selectedAssignment?._id]
  );

  const filteredStudents = useMemo(() => {
    if (studentFilter === "selected") {
      return students.filter((s) => isStudentSelected(s._id));
    }
    if (studentFilter === "not_sent") {
      return students.filter((s) => !s.reportSent);
    }
    return students;
  }, [students, studentFilter, reportCart, selectedAssignment?._id]);

  const setComment = (studentId, assignmentId, comment) => {
    setReportCart(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        items: {
          ...prev[studentId].items,
          // commentEdited makes the user's text (or deliberate clearing)
          // authoritative — no AI-summary fallback may overwrite it.
          [assignmentId]: { ...prev[studentId].items[assignmentId], comment, commentEdited: true }
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

  /* BUILD PAYLOAD — shared by preview and send so both produce the identical body.
   * IMPORTANT: refresh live Classroom data per assignment in the cart.
   * Never apply one assignment's student row (grade/status/time) onto other assignments. */
  const resolveReports = async () => {
    const cartEntries = Object.entries(reportCart);
    if (cartEntries.length === 0) return null;

    const assignmentIdsInCart = [
      ...new Set(
        cartEntries.flatMap(([, entry]) =>
          Object.keys(entry.items || {}).filter(Boolean)
        )
      ),
    ];

    const liveByAssignmentId = {};
    await Promise.all(
      assignmentIdsInCart.map(async (asgId) => {
        try {
          const fresh = await api.get(`/manager-assignments/${asgId}/full`, {
            params: { page: 1, limit: 5000 },
          });
          liveByAssignmentId[String(asgId)] = {
            studentsById: Object.fromEntries(
              (fresh.data.students || []).map((s) => [String(s._id), s])
            ),
            summaryMap: fresh.data.summaryMap || {},
            maxPoints: fresh.data.assignment?.maxPoints ?? null,
            classroomId: fresh.data.assignment?.classroomId ?? null,
          };
        } catch {
          liveByAssignmentId[String(asgId)] = {
            studentsById: {},
            summaryMap: {},
            maxPoints: null,
          };
        }
      })
    );

    // Keep UI summary map in sync for the currently open assignment (if any).
    if (selectedAssignment?._id && liveByAssignmentId[String(selectedAssignment._id)]) {
      const current = liveByAssignmentId[String(selectedAssignment._id)];
      if (current.summaryMap && Object.keys(current.summaryMap).length) {
        setSummaryMap((prev) => ({ ...prev, ...current.summaryMap }));
      }
    }

    return cartEntries.map(([, entry]) => ({
      studentId: entry.studentMeta._id,
      name: entry.studentMeta.name,
      phone: entry.studentMeta.phone,
      parentPhone: entry.studentMeta.parentPhone,
      items: Object.values(entry.items)
        .filter((item) => {
          const asgId = String(item.assignmentId || "");
          const liveClassroomId = liveByAssignmentId[asgId]?.classroomId;
          if (
            selectedClassroom?._id &&
            liveClassroomId &&
            String(liveClassroomId) !== String(selectedClassroom._id)
          ) {
            return false;
          }
          return true;
        })
        .map((item) => {
        const asgId = String(item.assignmentId || "");
        const liveBundle = liveByAssignmentId[asgId];
        const liveStudent =
          liveBundle?.studentsById?.[String(entry.studentMeta._id)] || null;

        // Prefer this assignment's live Classroom row; fall back to cart snapshot.
        const submissionId = liveStudent?.submissionId || item.submissionId || null;
        const assignedGrade =
          liveStudent?.assignedGrade ?? item.assignedGrade ?? null;
        const maxPoints =
          item.maxPoints ??
          liveBundle?.maxPoints ??
          (asgId === String(selectedAssignment?._id)
            ? studentExtra?.assignment?.maxPoints ?? selectedAssignment?.maxPoints
            : null) ??
          null;

        const savedSummary =
          (submissionId && liveBundle?.summaryMap?.[submissionId]) ||
          (submissionId && summaryMap[submissionId]) ||
          liveStudent?.summary ||
          "";

        const attendanceCfg =
          assignmentAttendance[asgId] ||
          { enabled: false, map: {}, date: "" };

        const percentageFromLive =
          assignedGrade != null && maxPoints != null
            ? computeGradePercent(assignedGrade, maxPoints) || null
            : null;

        return {
          ...item,
          assignmentId: item.assignmentId || asgId || selectedAssignment?._id,
          submissionId,
          state: liveStudent?.state ?? item.state,
          submittedAt: liveStudent?.submittedAt ?? item.submittedAt,
          isLate: liveStudent?.isLate ?? item.isLate,
          isOnTime: liveStudent?.isOnTime ?? item.isOnTime,
          assignedGrade,
          maxPoints,
          percentage: resolveReportDisplayPercent(
            assignedGrade,
            maxPoints,
            item.percentage ?? percentageFromLive
          ),
          comment: item.commentEdited
            ? (item.comment || "").trim()
            : (item.comment || savedSummary || "").trim(),
          commentEdited: Boolean(item.commentEdited),
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
      setPreviewClassroomId(selectedClassroom?._id || null);
    } catch {
      setPreview({ open: true, loading: false, error: "Failed to generate preview", previews: [] });
    }
  };

  const closePreview = () => {
    setPreview({ open: false, loading: false, error: null, previews: [] });
    setPreviewClassroomId(null);
  };

  const updatePreviewMessage = (index, message) => {
    setPreview((prev) => ({
      ...prev,
      previews: prev.previews.map((p, i) => (i === index ? { ...p, message } : p)),
    }));
  };

  const buildMessageOverrides = () => {
    const overrides = {};
    for (const p of preview.previews || []) {
      if (p?.error || !String(p?.message || "").trim()) continue;
      const text = String(p.message).trim();
      if (p.studentId != null) overrides[String(p.studentId)] = text;
      if (p.name) overrides[p.name] = text;
    }
    return overrides;
  };

  /* SEND — from cart bar (no preview edits) or from preview confirm (with edits) */
  const sendReport = async (options = {}) => {
    if (sending) return;
    const fromPreview = options.fromPreview === true;
    const forceResend = options.forceResend === true;
    const reports = await resolveReports();
    if (!reports) { toast.warn("No students selected"); return; }
    // Always mint a fresh clientSendId — reusing the first attempt's id would
    // hit the idempotent-batch cache and return the skipped result again.
    const clientSendId = crypto.randomUUID();
    activeSendIdRef.current = clientSendId;
    setSending(true);
    try {
      const payload = {
        reports,
        classroomId: selectedClassroom?._id,
        clientSendId,
        ...(forceResend ? { forceResend: true } : {}),
      };
      if (fromPreview) {
        if (
          previewClassroomId &&
          selectedClassroom?._id &&
          String(previewClassroomId) !== String(selectedClassroom._id)
        ) {
          toast.warn("Classroom changed since preview — sending freshly generated messages");
        } else {
          payload.messageOverrides = buildMessageOverrides();
          payload.previewClassroomId = previewClassroomId;
        }
      }
      const res = await api.post("/manager-assignments/send-report", payload);
      const summary = res.data.summary || [];
      const succeeded = summary.filter(r => r.status === "fulfilled").length;
      const failed = summary.filter(r => r.status === "rejected").length;
      const skipped = res.data.skippedCount || 0;
      const sent = res.data.sentCount ?? succeeded;

      if (skipped > 0 && !forceResend) {
        setSending(false);
        const confirmMsg =
          sent > 0
            ? `Sent to ${sent}. ${skipped} were skipped because they were already sent recently. Send those again too?`
            : `This report was already sent recently. Are you sure you want to send it again?`;
        const confirmed = await confirmToast(confirmMsg, {
          title: "Already sent recently",
          confirmLabel: "Send again",
          cancelLabel: sent > 0 ? "Keep as is" : "Cancel",
          toastId: "reports-force-resend",
        });
        if (confirmed) {
          return sendReport({ ...options, forceResend: true });
        }
        if (sent > 0) {
          let msg = `✅ Sent to ${sent} student(s)`;
          if (failed) msg += `, ${failed} failed`;
          toast.success(msg);
          setReportCart({});
          closePreview();
          activeSendIdRef.current = null;
          if (selectedAssignment?._id) fetchStudentPage(studentPage);
        } else {
          toast.info("Send cancelled — nothing was resent");
          activeSendIdRef.current = null;
        }
        return;
      }

      let msg = `✅ Sent to ${sent} student(s)`;
      if (failed) msg += `, ${failed} failed`;
      toast.success(msg);
      setReportCart({});
      closePreview();
      activeSendIdRef.current = null;
      if (selectedAssignment?._id) {
        fetchStudentPage(studentPage);
      }
    } catch {
      toast.error("Failed to send reports");
      activeSendIdRef.current = null;
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

  const collectiveReportsPayload = useMemo(() => {
    if (!selectedClassroom?._id || reportCount === 0) return null;
    return Object.values(reportCart).map((entry) => ({
      name: entry.studentMeta?.name,
      studentId: entry.studentMeta?._id || entry.studentMeta?.id,
      items: Object.values(entry.items || {}),
    }));
  }, [reportCart, selectedClassroom?._id, reportCount]);

  const teacherCollectivePdfConfig = useMemo(() => {
    if (!collectiveReportsPayload?.length || !selectedClassroom?._id) return null;
    return {
      url: "/manager-assignments/teacher-collective-pdf",
      method: "post",
      data: {
        reports: collectiveReportsPayload,
        classroomId: selectedClassroom._id,
      },
    };
  }, [collectiveReportsPayload, selectedClassroom?._id]);

  const customCollectivePdfConfig = useMemo(() => {
    if (!collectiveReportsPayload?.length || !selectedClassroom?._id) return null;
    return {
      url: "/manager-assignments/custom-collective-pdf",
      method: "post",
      data: {
        reports: collectiveReportsPayload,
        classroomId: selectedClassroom._id,
      },
    };
  }, [collectiveReportsPayload, selectedClassroom?._id]);

  const [downloadingCollective, setDownloadingCollective] = useState(null);

  const scrollToCollectivePreview = (kind = "teacher") => {
    const id =
      kind === "custom"
        ? "custom-collective-preview"
        : "teacher-collective-preview";
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const downloadCollectivePdf = async (kind) => {
    const config =
      kind === "teacher" ? teacherCollectivePdfConfig : customCollectivePdfConfig;
    if (!config) {
      toast.warn("Select students/assignments first");
      return;
    }
    setDownloadingCollective(kind);
    try {
      const res = await api.post(config.url, config.data, {
        responseType: "blob",
        timeout: 120_000,
      });
      const contentType = String(res.headers?.["content-type"] || "");
      if (contentType.includes("application/json")) {
        throw new Error("Server returned JSON instead of a PDF");
      }
      const fallback =
        kind === "teacher"
          ? "teacher_collective.pdf"
          : "collective_report.pdf";
      const disposition = String(res.headers?.["content-disposition"] || "");
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || fallback;
      downloadBlob(new Blob([res.data], { type: "application/pdf" }), filename);
      toast.success("PDF downloaded");
    } catch (err) {
      let message = "Failed to download PDF";
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (parsed?.message) message = parsed.message;
        } catch {
          // keep default
        }
      } else if (data?.message) {
        message = data.message;
      }
      toast.error(message);
    } finally {
      setDownloadingCollective(null);
    }
  };

  const statusBadge = (student) => <SubmissionStatusBadge student={student} />;

  const reportSentBadge = (student) => {
    if (student.reportSent) {
      const when = student.reportSentAt
        ? new Date(student.reportSentAt).toLocaleString()
        : "";
      return (
        <span
          className="ma-report-sent-pill ma-report-sent-pill--yes"
          title={when ? `Report sent ${when}` : "Report sent"}
        >
          Sent
        </span>
      );
    }
    return (
      <span className="ma-report-sent-pill ma-report-sent-pill--no" title="No report sent yet for this assignment">
        Not sent
      </span>
    );
  };

  const filteredClassrooms = classrooms;

  const filteredAssignments = assignments;
  const allOnPageChecked =
    filteredAssignments.length > 0 &&
    filteredAssignments.every((a) => checkedAssignments[String(a._id)]);

  const sendTeacherCollectiveReport = async (options = {}) => {
    if (sending) return;
    const forceResend = options.forceResend === true;
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
      const { data } = await api.post(
        "/manager-assignments/send-teacher-collective-report",
        {
          reports,
          classroomId: selectedClassroom?._id,
          clientSendId: crypto.randomUUID(),
          ...(forceResend ? { forceResend: true } : {}),
        }
      );

      if (data?.skipped && !forceResend) {
        setSending(false);
        const confirmed = await confirmToast(
          "This teacher collective report was already sent recently. Are you sure you want to send it again?",
          {
            title: "Already sent recently",
            confirmLabel: "Send again",
            cancelLabel: "Cancel",
            toastId: "teacher-collective-force-resend",
          }
        );
        if (confirmed) return sendTeacherCollectiveReport({ forceResend: true });
        toast.info("Send cancelled — nothing was resent");
        return;
      }

      toast.success("Teacher collective PDF report sent");
    } catch {
      toast.error("Failed to send teacher report");
    } finally {
      setSending(false);
    }
  };

  const sendCustomCollectiveReport = async (options = {}) => {
    if (sending) return;
    const forceResend = options.forceResend === true;
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
      const { data } = await api.post(
        "/manager-assignments/send-custom-collective-report",
        {
          reports,
          classroomId: selectedClassroom?._id,
          phone: customPhone,
          clientSendId: crypto.randomUUID(),
          ...(forceResend ? { forceResend: true } : {}),
        }
      );

      if (data?.skipped && !forceResend) {
        setSending(false);
        const confirmed = await confirmToast(
          "This report was already sent recently. Are you sure you want to send it again?",
          {
            title: "Already sent recently",
            confirmLabel: "Send again",
            cancelLabel: "Cancel",
            toastId: "custom-collective-force-resend",
          }
        );
        if (confirmed) return sendCustomCollectiveReport({ forceResend: true });
        toast.info("Send cancelled — nothing was resent");
        return;
      }

      toast.success("Custom PDF report sent");
    } catch {
      toast.error("Failed to send custom report");
    } finally {
      setSending(false);
    }
  };

  const pageTitle =
    isTeacher || isAssistant || isDirector ? "Reports" : "Assignments";

  const workflowStep = !selectedClassroom ? 1 : !selectedAssignment ? 2 : reportCount > 0 ? 4 : 3;

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

  if (reportView === "sent") {
    return (
      <ReportsSentWorkspace
        variant={variant}
        onBack={() => setReportView("assignment")}
        onNavigate={setReportView}
      />
    );
  }

  const mainContent = (
      <main className="ma-main">

        {/* TOPBAR */}
        <header className="ma-topbar ma-topbar--reports">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">{pageTitle}</h1>
            <span className="ma-topbar-sub">
              {selectedClassroom
                ? selectedAssignment
                  ? `${selectedClassroom.name} — ${selectedAssignment.title}`
                  : `Choose an assignment in ${selectedClassroom.name}`
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
              <button
                type="button"
                className="ma-report-tab"
                onClick={() => setReportView("executive")}
              >
                <FiBarChart2 size={12} /> Teacher Executive Analysis
              </button>
              <button
                type="button"
                className="ma-report-tab"
                onClick={() => setReportView("sent")}
              >
                <FiSend size={12} /> Reports Sent
              </button>
            </div>
          </div>
          {selectedClassroom && (
            <div className="rw-topbar-actions">
              <button
                type="button"
                className="mpr-btn mpr-btn--autosend"
                onClick={() => setShowAutoSendModal(true)}
              >
                <FiClock size={16} /> Auto-send settings
              </button>
              {reportCount > 0 && (
                <div className="ma-cart-pill">
                  <FiCheckSquare size={13} />
                  <span>{cartSummary}</span>
                </div>
              )}
            </div>
          )}
        </header>

        <div className={`ma-content${reportCount > 0 ? " ma-content--with-cart" : ""}`}>
          <nav className="rw-steps" aria-label="Report workflow">
            <button
              type="button"
              className={`rw-step rw-step--clickable ${workflowStep === 1 ? "rw-step--active" : ""} ${workflowStep > 1 ? "rw-step--done" : ""}`}
              onClick={workflowStep > 1 ? expandClassroomSection : undefined}
            >
              <span className="rw-step-num">{workflowStep > 1 ? "✓" : "1"}</span>
              <span className="rw-step-body">
                <span className="rw-step-label">Classroom</span>
                <span className="rw-step-hint">
                  {selectedClassroom?.name || "Pick a class"}
                </span>
              </span>
            </button>
            <span className="rw-step-divider" aria-hidden="true" />
            <button
              type="button"
              className={`rw-step ${selectedClassroom ? "rw-step--clickable" : ""} ${workflowStep === 2 ? "rw-step--active" : ""} ${workflowStep > 2 ? "rw-step--done" : ""}`}
              onClick={
                selectedClassroom && workflowStep > 2
                  ? () => {
                      setSelectedAssignment(null);
                      setSummaryMap({});
                      setStudentFilter("all");
                    }
                  : undefined
              }
            >
              <span className="rw-step-num">{workflowStep > 2 ? "✓" : "2"}</span>
              <span className="rw-step-body">
                <span className="rw-step-label">Assignment</span>
                <span className="rw-step-hint">
                  {selectedAssignment?.title || "Choose assignment"}
                </span>
              </span>
            </button>
            <span className="rw-step-divider" aria-hidden="true" />
            <div className={`rw-step ${workflowStep === 3 ? "rw-step--active" : ""} ${workflowStep > 3 ? "rw-step--done" : ""}`}>
              <span className="rw-step-num">{workflowStep > 3 ? "✓" : "3"}</span>
              <span className="rw-step-body">
                <span className="rw-step-label">Students</span>
                <span className="rw-step-hint">
                  {selectedStudentCount > 0
                    ? `${selectedStudentCount} selected`
                    : "Select recipients"}
                </span>
              </span>
            </div>
            <span className="rw-step-divider" aria-hidden="true" />
            <div className={`rw-step ${workflowStep === 4 ? "rw-step--active" : ""}`}>
              <span className="rw-step-num">4</span>
              <span className="rw-step-body">
                <span className="rw-step-label">Send</span>
                <span className="rw-step-hint">
                  {reportCount > 0 ? `${reportCount} ready` : "Preview & send"}
                </span>
              </span>
            </div>
          </nav>

          <div className="rw-workspace">
          {!selectedClassroom ? (
          <section className="rw-pane rw-pane--full">
            <div className="rw-pane-head">
              <div>
                <h2 className="rw-pane-title">Select a classroom</h2>
                <p className="rw-pane-sub">Choose where the assignment lives before building reports.</p>
              </div>
            </div>

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
              {filteredClassrooms.length === 0 ? (
                <div className="rw-empty">
                  <FiUsers size={28} />
                  <p>No classrooms match your search.</p>
                </div>
              ) : (
                filteredClassrooms.map(c => (
                  <div
                    key={c._id}
                    className="ma-classroom-card"
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
                    <FiChevronRight size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
                  </div>
                ))
              )}
            </div>
            <Pagination page={classroomPage} totalPages={classroomTotalPages} onPageChange={fetchClassroomPage} />
          </section>
          ) : (
            <>
              <div className="rw-context-bar">
                <div className="rw-context-bar-main">
                  <span className="rw-context-label">Classroom</span>
                  <span className="rw-context-value">{selectedClassroom.name}</span>
                </div>
                <button type="button" className="rw-context-change" onClick={expandClassroomSection}>
                  Change classroom
                </button>
              </div>

              <div className={`rw-split${selectedAssignment ? "" : " rw-split--assignments-only"}`}>
                <aside className="rw-pane rw-pane--assignments">
                  <div className="rw-pane-head">
                    <div>
                      <h2 className="rw-pane-title">Assignments</h2>
                      <p className="rw-pane-sub">Open one to pick students, or check several for a collective PDF.</p>
                    </div>
                  </div>

                  <div className="rw-info-card">
                    <FiInfo size={14} />
                    <span>
                      Check multiple assignments, then use <strong>Add all students</strong> — or tick specific students in an open assignment and use <strong>Add selected students</strong> to include only them.
                    </span>
                  </div>

                  <input
                    className="ma-search-input"
                    placeholder="Search assignments..."
                    value={assignmentSearch}
                    onChange={(e) => setAssignmentSearch(e.target.value)}
                  />

                  <div className="ma-assignment-bulk-actions">
                    <label className="ma-assignment-check-all">
                      <input
                        type="checkbox"
                        checked={allOnPageChecked}
                        onChange={(e) => toggleAllAssignmentsOnPage(e.target.checked)}
                      />
                      <span>Select page</span>
                    </label>
                    <button
                      type="button"
                      className="ma-send-btn ma-send-btn--compact"
                      onClick={selectAllStudentsForCheckedAssignments}
                      disabled={selectingAll || checkedAssignmentCount === 0}
                      title="Add every student from all checked assignments to the report cart"
                    >
                      {selectingAll
                        ? "Selecting…"
                        : `Add all students (${checkedAssignmentCount || 0})`}
                    </button>
                    <button
                      type="button"
                      className="ma-send-btn ma-send-btn--compact"
                      onClick={addSelectedStudentsToCheckedAssignments}
                      disabled={selectingAll || checkedAssignmentCount === 0 || cartCount === 0}
                      title="Add only the students you already ticked to every checked assignment"
                    >
                      {selectingAll
                        ? "Selecting…"
                        : `Add selected students (${cartCount || 0})`}
                    </button>
                  </div>

                  <div className="ma-scroll-list">
                    {filteredAssignments.length === 0 ? (
                      <div className="rw-empty">
                        <FiClipboard size={24} />
                        <p>No assignments found.</p>
                      </div>
                    ) : (
                      filteredAssignments.map(a => {
                        const isChecked = Boolean(checkedAssignments[String(a._id)]);
                        return (
                          <div
                            key={a._id}
                            className={`ma-assignment-card ${
                              selectedAssignment?._id === a._id
                                ? "ma-assignment-card--active"
                                : ""
                            }${isChecked ? " ma-assignment-card--checked" : ""}`}
                            onClick={() => selectAssignment(a)}
                          >
                            <label
                              className="ma-assignment-checkbox"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleAssignmentChecked(a, e)}
                                aria-label={`Include ${a.title} in collective report`}
                              />
                            </label>
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
                        );
                      })
                    )}
                  </div>
                  <Pagination page={assignmentPage} totalPages={assignmentTotalPages} onPageChange={fetchAssignmentPage} />
                </aside>

                {selectedAssignment ? (
                <section className="rw-pane rw-pane--students">
              <div className="ma-panel">
                <div className="ma-panel-header">
                  <div className="ma-panel-title-wrap">
                    <div className="ma-panel-dot" />
                    <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                    <span className="ma-panel-count">{studentTotal ?? students.length} students</span>
                  </div>
                  <div className="ma-panel-actions">
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
                    className="ma-send-btn ma-send-btn--ghost"
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

                <div className="rw-student-toolbar">
                  <div className="rw-filter-tabs" role="tablist" aria-label="Filter students">
                    <button
                      type="button"
                      role="tab"
                      className={`rw-filter-tab ${studentFilter === "all" ? "rw-filter-tab--active" : ""}`}
                      onClick={() => setStudentFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`rw-filter-tab ${studentFilter === "selected" ? "rw-filter-tab--active" : ""}`}
                      onClick={() => setStudentFilter("selected")}
                    >
                      Selected ({selectedStudentCount})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`rw-filter-tab ${studentFilter === "not_sent" ? "rw-filter-tab--active" : ""}`}
                      onClick={() => setStudentFilter("not_sent")}
                    >
                      Not sent
                    </button>
                  </div>
                  <span className="rw-student-count">
                    Showing {filteredStudents.length} of {students.length}
                  </span>
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
                    <div className="ma-table-scroll rw-table-scroll">
                      <table className="ma-table sah-table--cards rw-table-sticky">
                        <thead>
                          <tr>
                            <th style={{ width: 44 }}></th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Report Sent</th>
                            {showAttendanceColumn && <th>Attendance</th>}
                            {showAttendanceColumn && <th>Date</th>}
                            <th>Submitted At</th>
                            <th>Grade</th>
                            <th>%</th>
                            <th>Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((s, i) => {
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
                                <td data-label="Name">
                                  <div className="ma-avatar-cell">
                                    <div className="ma-avatar">
                                      {(s.name || s.email || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <span className="ma-cell-name">{s.name || <span className="ma-cell-empty">—</span>}</span>
                                  </div>
                                </td>
                                <td data-label="Email"><span className="ma-cell-muted">{s.email || "—"}</span></td>
                                <td data-label="Status">{statusBadge(s)}</td>
                                <td data-label="Report Sent">{reportSentBadge(s)}</td>
                                {showAttendanceColumn && (
                                  <td data-label="Attendance" onClick={(e) => e.stopPropagation()}>
                                    <ReportAttendanceSelect
                                      present={!!currentAssignmentAttendance.map?.[stuId]}
                                      onChange={(present) =>
                                        setStudentAttendance(asgId, stuId, present)
                                      }
                                    />
                                  </td>
                                )}
                                {showAttendanceColumn && (
                                  <td data-label="Date" onClick={(e) => e.stopPropagation()}>
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
                                <td data-label="Submitted At">
                                  <span className="ma-cell-muted">
                                    {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                                  </span>
                                </td>
                                <td data-label="Grade">
                                  {s.assignedGrade != null
                                    ? <span className="ma-grade-pill">{s.assignedGrade}</span>
                                    : <span className="ma-cell-empty">—</span>}
                                </td>
                                <td data-label="%" onClick={(e) => e.stopPropagation()}>
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
                                <td data-label="Comment" onClick={e => e.stopPropagation()}>
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
                {!loadingStudents && students.length > 0 && filteredStudents.length === 0 && (
                  <div className="rw-empty">
                    <FiUsers size={24} />
                    <p>No students match this filter.</p>
                  </div>
                )}
                {!loadingStudents && students.length > 0 && (
                  <Pagination page={studentPage} totalPages={studentTotalPages} onPageChange={fetchStudentPage} />
                )}
              </div>
                </section>
                ) : (
                  <div className="rw-pane rw-pane--placeholder">
                    <FiClipboard size={32} />
                    <h3>Select an assignment</h3>
                    <p>Click an assignment on the left to view students and build WhatsApp reports.</p>
                  </div>
                )}
              </div>
            </>
          )}
          </div>

        {reportCount > 0 && selectedClassroom?._id && (
          <section className="ma-collective-preview-section">
            <div className="ma-collective-preview-head">
              <h3>Collective PDF reports</h3>
              <button
                type="button"
                className="rw-collective-toggle"
                onClick={() => setShowCollectivePanel((v) => !v)}
              >
                {showCollectivePanel ? "Hide preview" : "Show preview"}
              </button>
            </div>

            {showCollectivePanel && (
              <>
                <div className="rw-collective-tabs">
                  <button
                    type="button"
                    className={`rw-collective-tab ${collectiveTab === "teacher" ? "rw-collective-tab--active" : ""}`}
                    onClick={() => setCollectiveTab("teacher")}
                  >
                    Teacher PDF
                  </button>
                  <button
                    type="button"
                    className={`rw-collective-tab ${collectiveTab === "custom" ? "rw-collective-tab--active" : ""}`}
                    onClick={() => setCollectiveTab("custom")}
                  >
                    Custom recipient
                  </button>
                </div>

                {collectiveTab === "teacher" ? (
                  <div className="ma-collective-preview-card" id="teacher-collective-preview">
                    <div className="ma-collective-preview-head">
                      <p className="rw-pane-sub" style={{ margin: 0 }}>
                        Combined PDF for the classroom teacher
                      </p>
                      <div className="ma-collective-preview-actions">
                        <button
                          type="button"
                          className="ma-send-btn ma-send-btn--ghost"
                          onClick={() => downloadCollectivePdf("teacher")}
                          disabled={!!downloadingCollective || !teacherCollectivePdfConfig}
                        >
                          <FiDownload size={13} />
                          {downloadingCollective === "teacher" ? "Downloading…" : "Download"}
                        </button>
                        {!isTeacher && (
                          <button
                            type="button"
                            className="ma-send-btn"
                            onClick={sendTeacherCollectiveReport}
                            disabled={sending}
                          >
                            <FiSend size={13} />
                            Send to teacher
                          </button>
                        )}
                      </div>
                    </div>
                    <ReportPdfPreview
                      fetchConfig={teacherCollectivePdfConfig}
                      title="Teacher collective report PDF"
                      frameClassName="mpr-pdf-preview-frame--tall"
                    />
                  </div>
                ) : (
                  <div className="ma-collective-preview-card" id="custom-collective-preview">
                    <div className="rw-collective-phone">
                      <span className="rw-collective-phone-label">Send to</span>
                      <div style={{ minWidth: "240px", flex: 1 }}>
                        <PhoneInput
                          defaultCountry="eg"
                          value={`+${customPhone}`}
                          onChange={(value) => setCustomPhone(value.replace(/\D/g, ""))}
                          className="tm-phone-input"
                          countrySelectorStyleProps={{
                            dropdownStyleProps: {
                              style: { maxHeight: "350px", zIndex: 9999 },
                            },
                          }}
                        />
                      </div>
                    </div>
                    <div className="ma-collective-preview-head">
                      <p className="rw-pane-sub" style={{ margin: 0 }}>
                        Combined PDF to a custom WhatsApp number
                      </p>
                      <div className="ma-collective-preview-actions">
                        <button
                          type="button"
                          className="ma-send-btn ma-send-btn--ghost"
                          onClick={() => downloadCollectivePdf("custom")}
                          disabled={!!downloadingCollective || !customCollectivePdfConfig}
                        >
                          <FiDownload size={13} />
                          {downloadingCollective === "custom" ? "Downloading…" : "Download"}
                        </button>
                        <button
                          type="button"
                          className="ma-send-btn"
                          onClick={sendCustomCollectiveReport}
                          disabled={sending}
                        >
                          <FiSend size={13} />
                          Send
                        </button>
                      </div>
                    </div>
                    <ReportPdfPreview
                      fetchConfig={customCollectivePdfConfig}
                      title="Custom collective report PDF"
                      frameClassName="mpr-pdf-preview-frame--tall"
                    />
                  </div>
                )}
              </>
            )}
          </section>
        )}
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
                className="ma-send-btn ma-send-btn--ghost"
                onClick={() => {
                  setShowCollectivePanel(true);
                  setCollectiveTab("teacher");
                  scrollToCollectivePreview("teacher");
                }}
                disabled={!teacherCollectivePdfConfig}
              >
                <FiDownload size={16} />
                Collective PDF
              </button>
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
          onChangeMessage={updatePreviewMessage}
          onConfirm={() => sendReport({ fromPreview: true })}
        />

        {summaryViewer.open && (
          <div
            className="rw-summary-overlay"
            onClick={() =>
              setSummaryViewer({ open: false, title: "", message: "" })
            }
          >
            <div
              className="rw-summary-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rw-summary-head">
                <span className="rw-summary-title">{summaryViewer.title}</span>
                <button
                  type="button"
                  className="rw-summary-close"
                  onClick={() =>
                    setSummaryViewer({ open: false, title: "", message: "" })
                  }
                  aria-label="Close"
                >
                  <FiX size={16} />
                </button>
              </div>
              <p className="rw-summary-body">{summaryViewer.message}</p>
            </div>
          </div>
        )}

        {showAutoSendModal && selectedClassroom && (
          <ReportAutomationRuleModal
            classroomId={selectedClassroom._id}
            classroomName={selectedClassroom.name}
            reportType="custom_collective"
            onClose={() => setShowAutoSendModal(false)}
          />
        )}

      </main>
  );

  if (isTeacher || isAssistant) {
    return <div className="ma-root ma-root--embedded">{mainContent}</div>;
  }

  return mainContent;
}