import { useEffect, useMemo, useState, useCallback, useRef } from "react";

import api from "../api/api";

import { toast } from "react-toastify";

import {

  FiUsers, FiDownload, FiFileText, FiCalendar, FiArrowLeft, FiCopy, FiSend,

} from "react-icons/fi";

import { usePagination } from "../hooks/usePagination";

import Pagination from "./Pagination";
import QuestionAnalyticsPreview from "./QuestionAnalyticsPreview";
import MarksLostBreakdownPreview from "./MarksLostBreakdownPreview";
import ReportDecisionGuide from "./ReportDecisionGuide";
import ReportPdfPreview from "./ReportPdfPreview";
import TopicMasteryPreview from "./TopicMasteryPreview";
import ActionThisWeekPreview from "./ActionThisWeekPreview";
import SmartRecommendationsPreview from "./SmartRecommendationsPreview";
import {
  parseAttendanceNamesFromFile,
  buildInitialAttendanceMap,
  countPresentInMap,
} from "../utils/attendanceExcel";

import "./MonthlyParentReport.css";
import ReportTeacherFilterSelect from "./ReportTeacherFilterSelect";
import {
  useReportTeacherFilter,
  useReportTeacherOptions,
  useClearClassroomOnTeacherFilter,
} from "../hooks/useReportTeacherFilter";



function currentYearMonth() {

  const d = new Date();

  return { year: d.getFullYear(), month: d.getMonth() + 1 };

}



export default function MonthlyParentReportWorkspace({

  variant = "manager",

  onBack,

}) {

  const isTeacher = variant === "teacher";

  const [user, setUser] = useState(null);

  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [previewStudent, setPreviewStudent] = useState(null);

  const [selectedStudentIds, setSelectedStudentIds] = useState(() => new Set());

  const [students, setStudents] = useState([]);

  const [loadingStudents, setLoadingStudents] = useState(false);

  const [studentSearch, setStudentSearch] = useState("");

  const [classroomSearch, setClassroomSearch] = useState("");

  const [monthOptions, setMonthOptions] = useState([]);

  const [{ year, month }, setYearMonth] = useState(currentYearMonth);

  const [report, setReport] = useState(null);

  const [loadingReport, setLoadingReport] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);


  const [schoolSessions, setSchoolSessions] = useState(4);
  const [schoolAttendanceInfo, setSchoolAttendanceInfo] = useState(null);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [attendanceFileName, setAttendanceFileName] = useState("");
  const [savingSchoolAttendance, setSavingSchoolAttendance] = useState(false);
  const previewSectionRef = useRef(null);

  useEffect(() => {

    const stored = localStorage.getItem("user");

    if (stored) setUser(JSON.parse(stored));

    api.get("/reports/monthly-parent/months")

      .then(({ data }) => setMonthOptions(data.months || []))

      .catch(() => {

        const now = new Date();

        setMonthOptions([{

          year: now.getFullYear(),

          month: now.getMonth() + 1,

          label: now.toLocaleString("en", { month: "long", year: "numeric" }),

        }]);

      });

  }, []);



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
    setPreviewStudent(null);
    setSelectedStudentIds(new Set());
    setReport(null);
  }, []);

  useClearClassroomOnTeacherFilter(teacherFilter, selectedClassroom, clearClassroomSelection);



  useEffect(() => {

    if (!selectedClassroom?._id) {

      setStudents([]);

      setPreviewStudent(null);

      setSelectedStudentIds(new Set());

      return;

    }

    setLoadingStudents(true);

    api.get("/reports/monthly-parent/students", {

      params: { classroomId: selectedClassroom._id },

    })

      .then(({ data }) => setStudents(data.students || []))

      .catch(() => toast.error("Failed to load students"))

      .finally(() => setLoadingStudents(false));

  }, [selectedClassroom?._id]);



  useEffect(() => {

    if (!selectedClassroom?._id || !previewStudent?._id) {

      setReport(null);

      return;

    }

    setLoadingReport(true);

    api.get("/reports/monthly-parent/preview", {

      params: {

        classroomId: selectedClassroom._id,

        studentId: previewStudent._id,

        year,

        month,

      },

    })

      .then(({ data }) => setReport(data.report))

      .catch((err) => {

        setReport(null);

        toast.error(err.response?.data?.message || "Failed to load report preview");

      })

      .finally(() => setLoadingReport(false));

  }, [selectedClassroom?._id, previewStudent?._id, year, month]);



  useEffect(() => {
    if (!selectedClassroom?._id) {
      setSchoolAttendanceInfo(null);
      setAttendanceMap({});
      setAttendanceFileName("");
      return;
    }
    api.get("/reports/monthly-parent/attendance", {
      params: { classroomId: selectedClassroom._id, year, month },
    })
      .then(({ data }) => {
        setSchoolAttendanceInfo(data.attendance);
        if (data.attendance?.totalSessions) {
          setSchoolSessions(data.attendance.totalSessions);
        }
      })
      .catch(() => setSchoolAttendanceInfo(null));
  }, [selectedClassroom?._id, year, month]);



  const filteredStudents = useMemo(() => {

    const q = studentSearch.trim().toLowerCase();

    if (!q) return students;

    return students.filter((s) => String(s.name || "").toLowerCase().includes(q));

  }, [students, studentSearch]);



  const selectedMonthLabel = useMemo(() => {

    const match = monthOptions.find((m) => m.year === year && m.month === month);

    return match?.label || `${month}/${year}`;

  }, [monthOptions, year, month]);

  const pdfPreviewConfig = useMemo(() => {
    if (!selectedClassroom?._id || !previewStudent?._id) return null;
    return {
      url: "/reports/monthly-parent/pdf",
      params: {
        classroomId: selectedClassroom._id,
        studentId: previewStudent._id,
        year,
        month,
      },
    };
  }, [selectedClassroom?._id, previewStudent?._id, year, month]);



  const selectedCount = selectedStudentIds.size;

  const selectedWithParentPhone = useMemo(

    () => students.filter(

      (s) => selectedStudentIds.has(String(s._id)) && s.parentPhone

    ).length,

    [students, selectedStudentIds]

  );



  const previewHasParentPhone = Boolean(previewStudent?.parentPhone);



  const openStudentPreview = useCallback((student, { scroll = true } = {}) => {
    if (!student) return;
    setPreviewStudent(student);
    if (scroll) {
      requestAnimationFrame(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  // If students are selected but no preview target yet (e.g. Select all), open the first one.
  useEffect(() => {
    if (previewStudent || !selectedStudentIds.size || !students.length) return;
    const firstId = [...selectedStudentIds][0];
    const match = students.find((s) => String(s._id) === String(firstId));
    if (match) openStudentPreview(match, { scroll: false });
  }, [previewStudent, selectedStudentIds, students, openStudentPreview]);

  const toggleStudentSelection = (student) => {
    const studentObj =
      typeof student === "object" && student?._id
        ? student
        : students.find((s) => String(s._id) === String(student));
    const id = String(studentObj?._id || student);

    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (studentObj) openStudentPreview(studentObj);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.add(String(s._id)));
      return next;
    });
    const first =
      filteredStudents.find((s) => s.parentPhone) || filteredStudents[0] || null;
    if (first) openStudentPreview(first);
  };

  const clearSelection = () => setSelectedStudentIds(new Set());

  const handleSchoolAttendanceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !students.length) {
      if (!students.length) toast.warn("Load students first");
      return;
    }
    try {
      const { names } = await parseAttendanceNamesFromFile(file);
      const map = buildInitialAttendanceMap(students, names, (s) => s._id);
      setAttendanceMap(map);
      setAttendanceFileName(file.name);
      toast.success(`Matched ${countPresentInMap(map)} present students`);
    } catch (err) {
      toast.error(err?.message || "Failed to read attendance file");
    }
  };

  const saveSchoolAttendance = async () => {
    if (!selectedClassroom?._id) return;
    if (!Object.keys(attendanceMap).length) {
      toast.warn("Upload a school attendance file first");
      return;
    }
    const presentStudentIds = students
      .filter((s) => attendanceMap[String(s._id)] === true)
      .map((s) => s._id);
    setSavingSchoolAttendance(true);
    try {
      const { data } = await api.post("/reports/monthly-parent/attendance", {
        classroomId: selectedClassroom._id,
        year,
        month,
        totalSessions: schoolSessions,
        presentStudentIds,
        sourceFileName: attendanceFileName || null,
      });
      setSchoolAttendanceInfo(data.attendance);
      toast.success("School attendance saved for this month");
      if (previewStudent?._id) {
        const preview = await api.get("/reports/monthly-parent/preview", {
          params: {
            classroomId: selectedClassroom._id,
            studentId: previewStudent._id,
            year,
            month,
          },
        });
        setReport(preview.data.report);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save attendance");
    } finally {
      setSavingSchoolAttendance(false);
    }
  };



  const downloadPdf = async () => {

    if (!selectedClassroom?._id || !previewStudent?._id) return;

    setDownloading(true);

    try {

      const res = await api.get("/reports/monthly-parent/pdf", {

        params: {

          classroomId: selectedClassroom._id,

          studentId: previewStudent._id,

          year,

          month,

        },

        responseType: "blob",

      });

      const blob = new Blob([res.data], { type: "application/pdf" });

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");

      a.href = url;

      a.download = `${previewStudent.name || "student"}_${selectedMonthLabel.replace(/\s+/g, "_")}.pdf`;

      a.click();

      URL.revokeObjectURL(url);

      toast.success("PDF downloaded");

    } catch {

      toast.error("Failed to download PDF");

    } finally {

      setDownloading(false);

    }

  };



  const sendWhatsApp = async (studentIds) => {

    if (!selectedClassroom?._id || !studentIds.length) return;



    const withoutPhone = students.filter(

      (s) => studentIds.includes(String(s._id)) && !s.parentPhone

    );

    if (withoutPhone.length) {

      toast.warn(

        `${withoutPhone.length} student(s) skipped — no parent phone on file`

      );

    }



    const idsToSend = studentIds.filter((id) => {

      const student = students.find((s) => String(s._id) === String(id));

      return student?.parentPhone;

    });



    if (!idsToSend.length) {

      toast.error("No selected students have a parent phone number");

      return;

    }



    setSendingWhatsApp(true);

    try {

      const payload = {

        classroomId: selectedClassroom._id,

        year,

        month,

      };



      if (idsToSend.length === 1) {

        payload.studentId = idsToSend[0];

      } else {

        payload.studentIds = idsToSend;

      }



      const { data } = await api.post("/reports/monthly-parent/send-whatsapp", payload);

      const sent = data.sent ?? 0;

      const failed = data.failed ?? 0;

      if (sent > 0) {

        toast.success(`Sent to ${sent} parent(s) on WhatsApp${failed ? ` (${failed} failed)` : ""}`);

      } else {

        toast.error("Failed to send reports on WhatsApp");

      }

      if (idsToSend.length > 1) clearSelection();

    } catch (err) {

      toast.error(err.response?.data?.message || "Failed to send on WhatsApp");

    } finally {

      setSendingWhatsApp(false);

    }

  };



  const sendPreviewToParent = () => {

    if (!previewStudent?._id) return;

    sendWhatsApp([String(previewStudent._id)]);

  };



  const sendBulkToParents = () => {

    sendWhatsApp([...selectedStudentIds]);

  };



  const copyParentMessage = async () => {

    if (!report?.parentMessage) return;

    try {

      await navigator.clipboard.writeText(report.parentMessage);

      toast.success("Parent message copied");

    } catch {

      toast.error("Could not copy message");

    }

  };



  if (!user) return null;



  return (

    <div className="mpr-root">

      <header className="mpr-header">

        <div className="mpr-header-left">

          <button type="button" className="mpr-back-btn" onClick={onBack}>

            <FiArrowLeft size={14} /> Assignment Reports

          </button>

          <div>

            <h1 className="mpr-title">Monthly Parent Reports</h1>

            <p className="mpr-subtitle">

              Branded PDF progress report with summary message for parents

            </p>

          </div>

        </div>

        <div className="mpr-header-actions">

          {selectedClassroom && previewStudent && (

            <button

              type="button"

              className="mpr-btn mpr-btn--ghost"

              onClick={() => openStudentPreview(previewStudent)}

            >

              <FiFileText size={14} /> Preview report

            </button>

          )}

          {selectedCount > 0 && (

            <button

              type="button"

              className="mpr-btn mpr-btn--whatsapp"

              onClick={sendBulkToParents}

              disabled={sendingWhatsApp || selectedWithParentPhone === 0}

            >

              <FiSend size={14} />

              {sendingWhatsApp

                ? "Sending…"

                : `Send to ${selectedWithParentPhone} Parent${selectedWithParentPhone !== 1 ? "s" : ""}`}

            </button>

          )}

          {report && previewStudent && (

            <>

              <button

                type="button"

                className="mpr-btn mpr-btn--ghost"

                onClick={copyParentMessage}

              >

                <FiCopy size={14} /> Copy Summary

              </button>

              <button

                type="button"

                className="mpr-btn mpr-btn--primary"

                onClick={downloadPdf}

                disabled={downloading}

              >

                <FiDownload size={14} />

                {downloading ? "Generating…" : "Download PDF"}

              </button>

              <button

                type="button"

                className="mpr-btn mpr-btn--whatsapp"

                onClick={sendPreviewToParent}

                disabled={sendingWhatsApp || !previewHasParentPhone}

                title={previewHasParentPhone ? "Send PDF to parent WhatsApp" : "No parent phone on file"}

              >

                <FiSend size={14} />

                {sendingWhatsApp ? "Sending…" : "Send to Parent WhatsApp"}

              </button>

            </>

          )}

        </div>

      </header>



      <div className="mpr-content">

        <div className="mpr-layout">

          <section className="mpr-panel">

            <p className="mpr-panel-label"><FiUsers size={13} /> Classroom</p>

            {!selectedClassroom ? (

              <>

                <ReportTeacherFilterSelect
                  show={showTeacherFilter}
                  value={teacherFilter}
                  onChange={setTeacherFilter}
                  teachers={teacherOptions}
                  className="mpr-select"
                />

                <input

                  className="mpr-search"

                  placeholder="Search classrooms…"

                  value={classroomSearch}

                  onChange={(e) => setClassroomSearch(e.target.value)}

                />

                <div className="mpr-scroll">

                  {classrooms.map((c) => (

                    <button

                      key={c._id}

                      type="button"

                      className="mpr-card"

                      onClick={() => {

                        setSelectedClassroom(c);

                        setPreviewStudent(null);

                        setSelectedStudentIds(new Set());

                        setReport(null);

                      }}

                    >

                      <span className="mpr-card-title">{c.name}</span>

                      {c.section && <span className="mpr-card-meta">{c.section}</span>}

                      {c.teacherId?.name && (
                        <span className="mpr-card-meta">Teacher: {c.teacherId.name}</span>
                      )}

                    </button>

                  ))}

                </div>

                <Pagination

                  page={classroomPage}

                  totalPages={classroomTotalPages}

                  onPageChange={fetchClassroomPage}

                />

              </>

            ) : (

              <div className="mpr-selected-pill">

                <span>{selectedClassroom.name}</span>

                <button

                  type="button"

                  onClick={() => {

                    setSelectedClassroom(null);

                    setPreviewStudent(null);

                    setSelectedStudentIds(new Set());

                    setReport(null);

                  }}

                >

                  change

                </button>

              </div>

            )}

          </section>



          {selectedClassroom && (

            <section className="mpr-panel mpr-panel--students">

              <div className="mpr-panel-head">

                <p className="mpr-panel-label"><FiUsers size={13} /> Students</p>

                <div className="mpr-panel-tools">

                  <button type="button" className="mpr-tool-btn" onClick={selectAllFiltered}>

                    Select all

                  </button>

                  <button

                    type="button"

                    className="mpr-tool-btn"

                    onClick={clearSelection}

                    disabled={selectedCount === 0}

                  >

                    Clear

                  </button>

                </div>

              </div>

              {selectedCount > 0 && (

                <p className="mpr-selection-hint">

                  {selectedCount} selected · {selectedWithParentPhone} with parent phone

                </p>

              )}

              <input

                className="mpr-search"

                placeholder="Search students…"

                value={studentSearch}

                onChange={(e) => setStudentSearch(e.target.value)}

              />

              {loadingStudents && <p className="mpr-muted">Loading students…</p>}

              <div className="mpr-scroll">

                {filteredStudents.map((s) => {

                  const id = String(s._id);

                  const isSelected = selectedStudentIds.has(id);

                  const isPreview = String(previewStudent?._id) === String(s._id);

                  return (

                    <div

                      key={s._id}

                      className={`mpr-student-row ${isPreview ? "mpr-student-row--preview" : ""}`}

                    >

                      <input

                        type="checkbox"

                        className="mpr-student-check"

                        checked={isSelected}

                        onChange={() => toggleStudentSelection(s)}

                        aria-label={`Select ${s.name}`}

                      />

                      <button

                        type="button"

                        className="mpr-student-name"

                        onClick={() => openStudentPreview(s)}

                      >

                        <span>{s.name || "—"}</span>

                        {!s.parentPhone && (

                          <span className="mpr-student-warn">No parent phone</span>

                        )}

                      </button>

                    </div>

                  );

                })}

              </div>

            </section>

          )}



          {selectedClassroom && (

            <section className="mpr-panel mpr-panel--month">

              <p className="mpr-panel-label"><FiCalendar size={13} /> Month</p>

              <select

                className="mpr-select"

                value={`${year}-${month}`}

                onChange={(e) => {

                  const [y, m] = e.target.value.split("-").map(Number);

                  setYearMonth({ year: y, month: m });

                }}

              >

                {monthOptions.map((opt) => (

                  <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>

                    {opt.label}

                  </option>

                ))}

              </select>

              <p className="mpr-month-hint">

                Reports use assignments due in the selected month.

              </p>

              <div className="mpr-school-attendance">
                <p className="mpr-panel-label">School lesson attendance (optional)</p>
                <label className="mpr-school-attendance-sessions">
                  <span>Lessons this month</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={schoolSessions}
                    onChange={(e) => setSchoolSessions(Number(e.target.value) || 1)}
                  />
                </label>
                <label className="mpr-school-attendance-file">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleSchoolAttendanceFile}
                  />
                  Upload present list
                </label>
                {attendanceFileName && (
                  <p className="mpr-month-hint">
                    {attendanceFileName} · {countPresentInMap(attendanceMap)} present
                  </p>
                )}
                {schoolAttendanceInfo && (
                  <p className="mpr-month-hint">
                    Saved: {schoolAttendanceInfo.presentCount}/{schoolAttendanceInfo.studentsRecorded} students · {schoolAttendanceInfo.totalSessions} session(s)
                  </p>
                )}
                <button
                  type="button"
                  className="mpr-tool-btn"
                  onClick={saveSchoolAttendance}
                  disabled={savingSchoolAttendance || !Object.keys(attendanceMap).length}
                >
                  {savingSchoolAttendance ? "Saving…" : "Save school attendance"}
                </button>
              </div>

            </section>

          )}

        </div>



        {selectedClassroom && (

          <section className="mpr-preview" ref={previewSectionRef}>

            {!previewStudent ? (

              <div className="mpr-preview-empty">

                <p className="mpr-preview-title">Report preview</p>

                <p className="mpr-muted">

                  Select a student (checkbox or name) to preview the monthly parent PDF here.

                </p>

              </div>

            ) : (

              <>

                <p className="mpr-preview-title">

                  Preview — {previewStudent.name} · {selectedMonthLabel}

                </p>

                <ReportPdfPreview

                  fetchConfig={pdfPreviewConfig}

                  title="Monthly parent report PDF"

                  frameClassName="mpr-pdf-preview-frame--tall"

                />

                {loadingReport && <p className="mpr-muted">Building report summary…</p>}

                {!loadingReport && !report && (

                  <p className="mpr-muted">No report data for this month.</p>

                )}

                {report && (

              <>

                <ReportDecisionGuide guide={report.decisionGuide} />

                <div className="mpr-kpi-grid">

                  <div className="mpr-kpi">

                    <span className="mpr-kpi-label">Overall</span>

                    <strong>{report.kpis.overallAverage ?? "—"}%</strong>

                  </div>

                  <div className="mpr-kpi">

                    <span className="mpr-kpi-label">Homework</span>

                    <strong>{report.kpis.homeworkAverage ?? "—"}%</strong>

                  </div>

                  <div className="mpr-kpi">

                    <span className="mpr-kpi-label">Quiz</span>

                    <strong>{report.kpis.quizAverage ?? "—"}%</strong>

                  </div>

                  <div className="mpr-kpi">

                    <span className="mpr-kpi-label">Mock</span>

                    <strong>{report.kpis.mockAverage ?? "—"}%</strong>

                  </div>

                  <div className="mpr-kpi">

                    <span className="mpr-kpi-label">Work submitted</span>

                    <strong>{report.kpis.submissionRate}%</strong>

                  </div>

                  <div className={`mpr-kpi mpr-kpi--risk mpr-kpi--${report.kpis.risk?.tone || "gray"}`}>

                    <span className="mpr-kpi-label">Academic status</span>

                    <strong>{report.kpis.risk?.displayLabel || report.kpis.risk?.label}</strong>

                  </div>

                </div>



                {report.kpis.risk?.description && (

                  <p className="mpr-muted mpr-risk-desc">{report.kpis.risk.description}</p>

                )}



                {report.kpis.risk?.explanation && (

                  <p className={`mpr-risk-note mpr-risk-note--${report.kpis.risk?.tone || "gray"}`}>

                    {report.kpis.risk.explanation}

                  </p>

                )}



                {report.classComparison?.hasComparison && (

                  <div className="mpr-compare-box">

                    <p className="mpr-compare-title">Student vs class comparison</p>

                    <div className="mpr-compare-grid">

                      <div className="mpr-compare-stat">

                        <span>Student average</span>

                        <strong>{report.classComparison.studentAverage}%</strong>

                      </div>

                      <div className="mpr-compare-stat">

                        <span>Class average</span>

                        <strong>{report.classComparison.classAverage}%</strong>

                      </div>

                      <div className="mpr-compare-stat">

                        <span>Class rank</span>

                        <strong>{report.classComparison.rankDisplay}</strong>

                      </div>

                      <div className="mpr-compare-stat">

                        <span>Percentile</span>

                        <strong>{report.classComparison.percentileLabel}</strong>

                      </div>

                      <div

                        className={`mpr-compare-stat mpr-compare-stat--diff ${

                          (report.classComparison.difference ?? 0) >= 0

                            ? "mpr-compare-stat--up"

                            : "mpr-compare-stat--down"

                        }`}

                      >

                        <span>vs class average</span>

                        <strong>{report.classComparison.differenceDisplay}</strong>

                      </div>

                    </div>

                  </div>

                )}



                {report.performanceTrend?.points?.length > 0 && (

                  <div className="mpr-trend-box">

                    <div className="mpr-trend-head">

                      <span>Performance trend</span>

                      {report.performanceTrend.change?.display &&
                        report.performanceTrend.change.display !== "—" && (

                        <span
                          className={`mpr-trend-badge mpr-trend-badge--${report.performanceTrend.change.direction || "flat"}`}
                        >

                          {report.performanceTrend.change.direction === "up" && "↑ "}

                          {report.performanceTrend.change.direction === "down" && "↓ "}

                          {report.performanceTrend.change.direction === "flat" && "→ "}

                          {report.performanceTrend.change.display}

                          <small> vs first assignment</small>

                        </span>

                      )}

                    </div>

                    <table className="mpr-trend-table">

                      <thead>

                        <tr>

                          <th>Assignment</th>

                          <th>Score</th>

                          <th>Class avg</th>

                        </tr>

                      </thead>

                      <tbody>

                        {report.performanceTrend.points.map((row) => (

                          <tr key={`${row.label}-${row.score}`}>

                            <td>{row.label}</td>

                            <td>{row.scoreDisplay || `${row.score}%`}</td>

                            <td>{row.classAverage != null ? `${row.classAverage}%` : "—"}</td>

                          </tr>

                        ))}

                      </tbody>

                    </table>

                  </div>

                )}



                {(report.submission || report.attendance) && (() => {
                  const sub = report.submission || report.attendance;
                  const completion = sub.completionPercent ?? sub.attendancePercent ?? 0;
                  return (
                  <div className="mpr-attendance-box">

                    <p className="mpr-attendance-title">Work completion & submissions</p>

                    <div className="mpr-attendance-head">

                      <div>

                        <span className="mpr-attendance-pct">{completion}%</span>

                        <span className="mpr-attendance-pct-label">assignments completed</span>

                      </div>

                      <span className="mpr-attendance-submitted">

                        {sub.submittedCount ?? "—"}/{sub.totalAssignments ?? "—"} submitted

                      </span>

                    </div>

                    <div className="mpr-attendance-bar" aria-label="Submission breakdown">

                      {sub.onTimePercent > 0 && (

                        <div

                          className="mpr-attendance-bar-seg mpr-attendance-bar-seg--on"

                          style={{ width: `${sub.onTimePercent}%` }}

                          title={`On time: ${sub.onTimeCount}`}

                        />

                      )}

                      {sub.latePercent > 0 && (

                        <div

                          className="mpr-attendance-bar-seg mpr-attendance-bar-seg--late"

                          style={{ width: `${sub.latePercent}%` }}

                          title={`Late: ${sub.lateCount}`}

                        />

                      )}

                      {sub.missingPercent > 0 && (

                        <div

                          className="mpr-attendance-bar-seg mpr-attendance-bar-seg--miss"

                          style={{ width: `${sub.missingPercent}%` }}

                          title={`Missing: ${sub.missingCount}`}

                        />

                      )}

                    </div>

                    <div className="mpr-attendance-legend">

                      <span><i className="mpr-attendance-dot mpr-attendance-dot--on" /> On time: {sub.onTimeCount}</span>

                      <span><i className="mpr-attendance-dot mpr-attendance-dot--late" /> Late: {sub.lateCount}</span>

                      <span><i className="mpr-attendance-dot mpr-attendance-dot--miss" /> Missing: {sub.missingCount}</span>

                    </div>

                    <div className="mpr-attendance-stats">

                      <div className="mpr-attendance-stat">

                        <span>On-time submissions</span>

                        <strong>{sub.onTimeCount}</strong>

                      </div>

                      <div className="mpr-attendance-stat">

                        <span>Late submissions</span>

                        <strong>{sub.lateCount}</strong>

                      </div>

                      <div className="mpr-attendance-stat">

                        <span>Missing submissions</span>

                        <strong>{sub.missingCount}</strong>

                      </div>

                    </div>

                  </div>
                  );
                })()}

                {report.schoolAttendance?.hasData && (
                  <div className="mpr-school-attendance-summary">
                    <p className="mpr-attendance-title">School lesson attendance</p>
                    <p className="mpr-muted">{report.schoolAttendance.display}</p>
                  </div>
                )}



                <QuestionAnalyticsPreview
                  analytics={report.questionAnalytics}
                  includeStudentContext
                />



                <MarksLostBreakdownPreview breakdown={report.marksLostBreakdown} />



                <TopicMasteryPreview
                  topics={report.topicMastery}
                  title="What topics need attention?"
                />



                <ActionThisWeekPreview actions={report.actionThisWeek} />



                <SmartRecommendationsPreview
                  recommendations={
                    report.teacherRecommendation ? [report.teacherRecommendation] : []
                  }
                  title="Sahahly's Recommendation"
                />



                <div className="mpr-message-box">

                  <div className="mpr-message-head">

                    <FiFileText size={15} />

                    <span>Summary message for parents</span>

                  </div>

                  <p className="mpr-message-text">{report.parentMessage}</p>

                </div>



                <div className="mpr-preview-grid">

                  <div>

                    <h3>Strengths (% on marked work)</h3>

                    <ul>{(report.strengths || []).map((s) => <li key={s}>{s}</li>)}</ul>

                  </div>

                  <div>

                    <h3>Areas for improvement</h3>

                    <ul>{(report.improvements || []).map((s) => <li key={s}>{s}</li>)}</ul>

                  </div>

                </div>



                <p className="mpr-footnote">

                  {report.assignmentCount} assignment(s) due in {selectedMonthLabel}.

                </p>

              </>

            )}

              </>

            )}

          </section>

        )}

      </div>

    </div>

  );

}


