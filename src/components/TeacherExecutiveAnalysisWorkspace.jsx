import { useEffect, useMemo, useState, useCallback } from "react";
import api from "../api/api";
import { toast } from "react-toastify";
import {
  FiArrowLeft,
  FiBarChart2,
  FiDownload,
  FiFileText,
  FiSend,
  FiUsers,
} from "react-icons/fi";
import { usePagination } from "../hooks/usePagination";
import Pagination from "./Pagination";
import QuestionAnalyticsPreview from "./QuestionAnalyticsPreview";
import MarksLostBreakdownPreview from "./MarksLostBreakdownPreview";
import StudentWatchlistsPreview from "./StudentWatchlistsPreview";
import ReportDecisionGuide from "./ReportDecisionGuide";
import ReportPdfPreview from "./ReportPdfPreview";
import GradeDistributionPreview from "./GradeDistributionPreview";
import TopicMasteryPreview from "./TopicMasteryPreview";
import SmartRecommendationsPreview from "./SmartRecommendationsPreview";
import "./MonthlyParentReport.css";
import ReportTeacherFilterSelect from "./ReportTeacherFilterSelect";
import {
  useReportTeacherFilter,
  useReportTeacherOptions,
  useClearClassroomOnTeacherFilter,
} from "../hooks/useReportTeacherFilter";

const TRIGGERS = [
  { value: "assignment_done", label: "Assignment completed" },
  { value: "correction_returned", label: "Corrections returned" },
];

export default function TeacherExecutiveAnalysisWorkspace({
  variant = "manager",
  onBack,
  onNavigate,
}) {
  const isTeacher = variant === "teacher";
  const [user, setUser] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [trigger, setTrigger] = useState("assignment_done");
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendEmailToo, setSendEmailToo] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
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
    setSelectedAssignment(null);
    setReport(null);
  }, []);

  useClearClassroomOnTeacherFilter(teacherFilter, selectedClassroom, clearClassroomSelection);

  const assignmentParams = useMemo(() => ({ search: assignmentSearch }), [assignmentSearch]);

  const {
    data: assignments,
    page: assignmentPage,
    totalPages: assignmentTotalPages,
    fetchPage: fetchAssignmentPage,
    loading: loadingAssignments,
  } = usePagination(
    selectedClassroom
      ? `/manager-assignments/classroom/${selectedClassroom._id}/assignments`
      : "/manager-assignments/classroom/_",
    assignmentParams,
    12,
    "data",
    !!selectedClassroom?._id
  );

  useEffect(() => {
    if (!selectedAssignment?._id) {
      setReport(null);
      return;
    }

    setLoadingReport(true);

    api
      .get(`/reports/assignment-executive/preview/${selectedAssignment._id}`, {
        params: { trigger },
      })
      .then(({ data }) => setReport(data.report || null))
      .catch((err) => {
        setReport(null);
        toast.error(err.response?.data?.message || "Failed to load executive report");
      })
      .finally(() => setLoadingReport(false));
  }, [selectedAssignment?._id, trigger]);

  const pdfPreviewConfig = useMemo(() => {
    if (!selectedAssignment?._id) return null;
    return {
      url: `/reports/assignment-executive/pdf/${selectedAssignment._id}`,
      params: { trigger },
    };
  }, [selectedAssignment?._id, trigger]);

  const selectClassroom = (classroom) => {
    if (selectedClassroom?._id === classroom._id) {
      setSelectedClassroom(null);
      setSelectedAssignment(null);
      return;
    }
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setReport(null);
  };

  const selectAssignment = (assignment) => {
    setSelectedAssignment(
      selectedAssignment?._id === assignment._id ? null : assignment
    );
  };

  const downloadPdf = async () => {
    if (!selectedAssignment?._id) return;
    setDownloading(true);
    try {
      const res = await api.get(
        `/reports/assignment-executive/pdf/${selectedAssignment._id}`,
        { params: { trigger }, responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedAssignment.title || "assignment"}_executive.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const sendToTeacher = async () => {
    if (!selectedAssignment?._id) return;
    if (!report?.meta?.teacherPhone) {
      toast.error("Teacher has no WhatsApp number on file");
      return;
    }

    setSending(true);
    try {
      const { data } = await api.post("/reports/assignment-executive/send", {
        assignmentId: selectedAssignment._id,
        trigger,
        sendEmail: sendEmailToo,
      });
      if (data.result?.whatsApp?.sent) {
        toast.success("Executive report sent to teacher on WhatsApp");
      } else {
        toast.warn(data.message || "Report processed with warnings");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send executive report");
    } finally {
      setSending(false);
    }
  };

  const notSubmitted =
    report?.studentsNotSubmitted || report?.submission?.studentsNotSubmitted || [];

  if (!user) return null;

  return (
    <div className="mpr-root">
      <header className="mpr-header">
        <div className="mpr-header-left">
          <button type="button" className="mpr-back-btn" onClick={onBack}>
            <FiArrowLeft size={14} /> Assignment Reports
          </button>
          <div>
            <h1 className="mpr-title">Teacher Executive Analysis</h1>
            <p className="mpr-subtitle">
              McKinsey-style assignment analytics PDF sent to the classroom teacher via WhatsApp
            </p>
            <div className="ma-report-tabs" style={{ marginTop: 10 }}>
              <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("assignment")}>
                Assignment Reports
              </button>
              <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("monthly")}>
                Monthly Parent Reports
              </button>
              <button type="button" className="ma-report-tab ma-report-tab--active">
                <FiBarChart2 size={12} /> Teacher Executive Analysis
              </button>
            </div>
          </div>
        </div>
        <div className="mpr-header-actions">
          {report && selectedAssignment && (
            <>
              <button
                type="button"
                className="mpr-btn mpr-btn--primary"
                onClick={downloadPdf}
                disabled={downloading}
              >
                <FiDownload size={14} />
                {downloading ? "Generating…" : "Download PDF"}
              </button>
              {!isTeacher && (
                <button
                  type="button"
                  className="mpr-btn mpr-btn--whatsapp"
                  onClick={sendToTeacher}
                  disabled={sending || !report?.meta?.teacherPhone}
                  title={
                    report?.meta?.teacherPhone
                      ? `Send to ${report.meta.teacherPhone}`
                      : "No teacher phone on file"
                  }
                >
                  <FiSend size={14} />
                  {sending ? "Sending…" : "Send to Teacher (WhatsApp)"}
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="mpr-content">
        <div className="mpr-layout">
          <section className="mpr-panel">
            <p className="mpr-panel-label">
              <FiUsers size={13} /> Classroom
            </p>
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
                  className={`mpr-card ${
                    selectedClassroom?._id === c._id ? "mpr-card--active" : ""
                  }`}
                  onClick={() => selectClassroom(c)}
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
          </section>

          <section className="mpr-panel mpr-panel--month">
            <p className="mpr-panel-label">
              <FiFileText size={13} /> Assignment
            </p>
            <input
              className="mpr-search"
              placeholder="Search assignments…"
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
              disabled={!selectedClassroom}
            />
            {!selectedClassroom ? (
              <p className="mpr-month-hint">Select a classroom first</p>
            ) : loadingAssignments ? (
              <p className="mpr-month-hint">Loading assignments…</p>
            ) : (
              <>
                <div className="mpr-scroll">
                  {assignments.map((a) => (
                    <button
                      key={a._id}
                      type="button"
                      className={`mpr-card ${
                        selectedAssignment?._id === a._id ? "mpr-card--active" : ""
                      }`}
                      onClick={() => selectAssignment(a)}
                    >
                      <span className="mpr-card-title">{a.title}</span>
                      {a.status && <span className="mpr-card-meta">{a.status}</span>}
                    </button>
                  ))}
                </div>
                <Pagination
                  page={assignmentPage}
                  totalPages={assignmentTotalPages}
                  onPageChange={fetchAssignmentPage}
                />
              </>
            )}
          </section>

          <section className="mpr-panel mpr-panel--students">
            <p className="mpr-panel-label">
              <FiBarChart2 size={13} /> Executive preview
            </p>

            {selectedAssignment && (
              <label className="tea-trigger-select">
                <span>Report event</span>
                <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                  {TRIGGERS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!selectedAssignment && (
              <p className="mpr-month-hint">Select an assignment to preview the executive report</p>
            )}

            {selectedAssignment && loadingReport && (
              <p className="mpr-month-hint">Loading executive analysis…</p>
            )}

            {selectedAssignment && !loadingReport && report && (
              <div className="mpr-preview tea-preview">
                <ReportPdfPreview
                  fetchConfig={pdfPreviewConfig}
                  title="Executive report PDF"
                />

                <ReportDecisionGuide guide={report.decisionGuide} />

                <h3 className="tea-preview-title">{report.meta.assignmentTitle}</h3>
                <p className="tea-preview-meta">
                  {report.meta.classroomName} · {report.meta.subject}
                </p>
                <p className="tea-preview-meta">
                  Teacher: <strong>{report.meta.teacherName}</strong>
                  {report.meta.teacherPhone
                    ? ` · WhatsApp: ${report.meta.teacherPhone}`
                    : " · No WhatsApp on file"}
                </p>

                <div className="tea-kpi-grid">
                  <div className="tea-kpi">
                    <span>Class average</span>
                    <strong>
                      {report.kpis.classAverage != null ? `${report.kpis.classAverage}%` : "—"}
                    </strong>
                  </div>
                  <div className="tea-kpi">
                    <span>Submission rate</span>
                    <strong>
                      {report.kpis.submissionRate != null
                        ? `${report.kpis.submissionRate}%`
                        : "—"}
                    </strong>
                  </div>
                  <div className="tea-kpi">
                    <span>Papers marked</span>
                    <strong>{report.meta.papersMarked ?? "—"}</strong>
                  </div>
                  <div className="tea-kpi">
                    <span>Marking unchanged</span>
                    <strong>
                      {report.kpis.markingUnchangedRate != null
                        ? `${report.kpis.markingUnchangedRate}%`
                        : report.kpis.aiAgreementRate != null
                          ? `${report.kpis.aiAgreementRate}%`
                          : "—"}
                    </strong>
                  </div>
                </div>

                {report.executiveSummary?.length > 0 && (
                  <div className="tea-block">
                    <h4>Key insights</h4>
                    <ul>
                      {report.executiveSummary.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <GradeDistributionPreview distribution={report.gradeDistribution} />

                <TopicMasteryPreview
                  topics={report.topicMastery}
                  title="What should I reteach?"
                />

                <QuestionAnalyticsPreview analytics={report.questionAnalytics} />

                <MarksLostBreakdownPreview breakdown={report.marksLostBreakdown} />

                <StudentWatchlistsPreview watchlists={report.studentWatchlists} />

                <SmartRecommendationsPreview recommendations={report.recommendations} />

                <div className="tea-block">
                  <h4>Students who did not submit ({notSubmitted.length})</h4>
                  {notSubmitted.length === 0 ? (
                    <p className="tea-empty-list">Everyone submitted — great engagement.</p>
                  ) : (
                    <ul className="tea-missing-list">
                      {notSubmitted.map((s) => (
                        <li key={s.name}>{s.name}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {!isTeacher && (
                  <label className="tea-check">
                    <input
                      type="checkbox"
                      checked={sendEmailToo}
                      onChange={(e) => setSendEmailToo(e.target.checked)}
                    />
                    Also email PDF to teacher ({report.meta.teacherEmail || "no email on file"})
                  </label>
                )}

              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
