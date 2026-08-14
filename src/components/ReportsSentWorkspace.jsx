import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";
import {
  FiArrowLeft,
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiRefreshCw,
  FiSend,
  FiUsers,
} from "react-icons/fi";
import { isDirectorLikeVariant } from "../utils/directorLikeAccess";
import Pagination from "./Pagination";
import PartnerReportsTabButton from "./PartnerReportsTabButton";
import DashboardPeriodFilter from "./DashboardPeriodFilter";
import { useDashboardPeriod } from "../hooks/useDashboardPeriod";
import "../pages/manager/ManagerAssignments.css";

function formatSentAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function recipientPillClass(recipientType) {
  if (recipientType === "parent") return "ma-sent-pill ma-sent-pill--parent";
  if (recipientType === "teacher") return "ma-sent-pill ma-sent-pill--teacher";
  return "ma-sent-pill ma-sent-pill--custom";
}

const DEFAULT_REPORT_TYPES = [
  { value: "assignment_parent", label: "Assignment reports to parents" },
  { value: "teacher_collective", label: "Teacher collective PDF" },
  { value: "custom_collective", label: "Custom collective PDF" },
  { value: "monthly_parent", label: "Monthly parent report" },
  { value: "executive_teacher", label: "Executive analysis to teacher" },
  { value: "teacher_submission", label: "Submission summary to teacher" },
];

export default function ReportsSentWorkspace({ variant = "manager", onBack, onNavigate }) {
  const isDirector = isDirectorLikeVariant(variant);
  const period = useDashboardPeriod();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [latest, setLatest] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [reportTypes, setReportTypes] = useState(DEFAULT_REPORT_TYPES);
  const [classrooms, setClassrooms] = useState([]);
  const [classroomId, setClassroomId] = useState("");
  const [reportType, setReportType] = useState("");
  const [recipientType, setRecipientType] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        let url = "/students/my-classrooms";
        const params = { page: 1, limit: 500 };
        if (variant === "teacher") {
          url = `/google-classroom/teacher-courses/${user.id}`;
        } else if (isDirector) {
          url = "/google-classroom/courses";
        }
        const res = await api.get(url, { params });
        const rows = res.data?.data || res.data || [];
        if (!cancelled) setClassrooms(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setClassrooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, variant, isDirector]);

  const fetchHistory = useCallback(
    async (pageNum = 1) => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const { data } = await api.get("/reports/sent-history", {
          params: {
            personId: user.id,
            variant,
            page: pageNum,
            limit: 20,
            ...period.params,
            ...(classroomId ? { classroomId } : {}),
            ...(reportType ? { reportType } : {}),
            ...(recipientType ? { recipientType } : {}),
          },
        });
        setItems(data.items || []);
        setLatest(data.latest || null);
        setCoverage(data.coverage || null);
        if (data.filters?.reportTypes?.length) {
          setReportTypes(data.filters.reportTypes);
        }
        setPage(data.page || pageNum);
        setTotalPages(data.totalPages || 0);
        setTotal(data.total || 0);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load sent reports");
        setItems([]);
        setLatest(null);
        setCoverage(null);
      } finally {
        setLoading(false);
      }
    },
    [
      user?.id,
      variant,
      period.params.from,
      period.params.to,
      classroomId,
      reportType,
      recipientType,
    ]
  );

  useEffect(() => {
    if (user?.id) fetchHistory(1);
  }, [user?.id, fetchHistory]);

  const classroomOptions = useMemo(
    () =>
      [...classrooms]
        .map((c) => ({
          id: String(c._id),
          label: c.section ? `${c.name} — ${c.section}` : c.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [classrooms]
  );

  const pageTitle =
    variant === "teacher" || variant === "assistant" || isDirector
      ? "Reports"
      : "Assignments";

  const coverageText =
    coverage && coverage.studentsTotal > 0
      ? `${coverage.studentsSent} of ${coverage.studentsTotal} students`
      : null;

  return (
    <main className="ma-main">
      <header className="ma-topbar">
        <div className="ma-topbar-left">
          <button type="button" className="ma-back-link" onClick={onBack}>
            <FiArrowLeft size={14} /> Back
          </button>
          <h1 className="ma-topbar-title">{pageTitle}</h1>
          <span className="ma-topbar-sub">
            Review what was already sent so you do not duplicate reports.
          </span>
          <div className="ma-report-tabs" style={{ marginTop: 10 }}>
            <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("assignment")}>
              Assignment Reports
            </button>
            <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("monthly")}>
              <FiCalendar size={12} /> Monthly Parent Reports
            </button>
            <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("executive")}>
              <FiBarChart2 size={12} /> Teacher Executive Analysis
            </button>
            <button type="button" className="ma-report-tab ma-report-tab--active">
              <FiSend size={12} /> Reports Sent
            </button>
            <PartnerReportsTabButton onNavigate={onNavigate} />
          </div>
        </div>
        <div className="ma-topbar-right">
          <button
            type="button"
            className="ma-send-btn ma-send-btn--ghost"
            onClick={() => fetchHistory(page)}
            disabled={loading}
          >
            <FiRefreshCw size={13} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="ma-content">
        <DashboardPeriodFilter
          from={period.from}
          to={period.to}
          setFrom={period.setFrom}
          setTo={period.setTo}
          resetToThisMonth={period.resetToThisMonth}
          monthLabel={period.monthLabel}
        />

        <div className="ma-sent-filters">
          <label className="ma-sent-filter">
            <span>Classroom</span>
            <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
              <option value="">All classrooms</option>
              {classroomOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ma-sent-filter">
            <span>Report type</span>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="">All types</option>
              {reportTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ma-sent-filter">
            <span>Recipient</span>
            <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
              <option value="">All recipients</option>
              <option value="parent">Parents</option>
              <option value="teacher">Teacher</option>
              <option value="custom">Custom number</option>
              <option value="student">Student</option>
            </select>
          </label>
        </div>

        {coverageText && (
          <section className="ma-sent-coverage-card">
            <FiUsers size={16} />
            <div>
              <strong>{coverageText}</strong>
              <span>
                have received at least one parent assignment report in this period
                {coverage?.percent != null ? ` (${coverage.percent}%)` : ""}
              </span>
            </div>
          </section>
        )}

        {latest && (
          <section className="ma-sent-latest-card">
            <div className="ma-sent-latest-head">
              <FiClock size={16} />
              <h2>Most recent send</h2>
            </div>
            <p className="ma-sent-latest-summary">{latest.summary}</p>
            <div className="ma-sent-latest-meta">
              <span>{formatSentAt(latest.sentAt)}</span>
              {latest.classroomName && <span>{latest.classroomName}</span>}
              <span className={recipientPillClass(latest.recipientType)}>
                {latest.recipientLabel}
              </span>
              {latest.coverageLabel && latest.coverageLabel !== "—" && (
                <span className="ma-sent-coverage-pill">{latest.coverageLabel}</span>
              )}
            </div>
            {latest.assignmentTitles?.length > 0 && (
              <ul className="ma-sent-assignment-list">
                {latest.assignmentTitles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="ma-sent-history-section">
          <div className="ma-sent-history-head">
            <h2>Send history</h2>
            <span className="ma-sent-history-count">
              {total} record{total !== 1 ? "s" : ""}
            </span>
          </div>

          {loading && items.length === 0 ? (
            <p className="ma-empty-state">Loading sent reports…</p>
          ) : items.length === 0 ? (
            <p className="ma-empty-state">No reports sent yet for this filter.</p>
          ) : (
            <div className="ma-sent-table-wrap">
              <table className="ma-sent-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>To</th>
                    <th>Classroom</th>
                    <th>Assignments / period</th>
                    <th>Students</th>
                    <th>Sent by</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td data-label="When">{formatSentAt(row.sentAt)}</td>
                      <td data-label="Type">{row.reportTypeLabel}</td>
                      <td data-label="To">
                        <span className={recipientPillClass(row.recipientType)}>
                          {row.recipientLabel}
                        </span>
                      </td>
                      <td data-label="Classroom">{row.classroomName || "—"}</td>
                      <td data-label="Content">
                        {row.periodLabel ? (
                          <span>{row.periodLabel}</span>
                        ) : row.assignmentTitles?.length ? (
                          <span title={row.assignmentTitles.join(", ")}>
                            {row.assignmentTitles.slice(0, 2).join(", ")}
                            {row.assignmentTitles.length > 2
                              ? ` +${row.assignmentTitles.length - 2} more`
                              : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Students">
                        <strong>
                          {row.coverageLabel ||
                            (row.studentCount > 0
                              ? `${row.sentCount} of ${row.studentCount} students`
                              : row.sentCount > 0
                                ? `${row.sentCount} sent`
                                : "—")}
                        </strong>
                        {row.skippedCount > 0 && (
                          <span className="ma-sent-skipped">
                            {" "}
                            · {row.skippedCount} skipped
                          </span>
                        )}
                        {row.teacherNotified && (
                          <span className="ma-sent-teacher-note" title="Teacher was notified">
                            {" "}
                            · teacher notified
                          </span>
                        )}
                      </td>
                      <td data-label="Sent by">{row.sentByPersonName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={fetchHistory} />
          )}
        </section>
      </div>
    </main>
  );
}
