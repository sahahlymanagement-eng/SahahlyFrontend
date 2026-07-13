import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiBookOpen,
  FiCheckCircle,
  FiClipboard,
  FiHome,
  FiMessageSquare,
  FiPercent,
  FiRefreshCw,
  FiSearch,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
  FiCalendar,
  FiLayers,
} from "react-icons/fi";
import "./DirectorReports.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "academic", label: "Academic" },
  { id: "attendance", label: "Attendance" },
  { id: "delivery", label: "Report delivery" },
  { id: "coverage", label: "Coverage" },
];

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

function formatPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Number(n)}%`;
}

function monthLabel(year, month) {
  if (!year || !month) return "—";
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function StatCard({ icon, label, value, hint, tone }) {
  return (
    <div className={`dr-stat${tone ? ` dr-stat--${tone}` : ""}`}>
      <div className="dr-stat-icon">{icon}</div>
      <div className="dr-stat-body">
        <span className="dr-stat-label">{label}</span>
        <strong className="dr-stat-value">{value}</strong>
        {hint ? <span className="dr-stat-hint">{hint}</span> : null}
      </div>
    </div>
  );
}

function BandBar({ bands }) {
  const total =
    (bands?.excellent || 0) +
    (bands?.good || 0) +
    (bands?.fair || 0) +
    (bands?.weak || 0);
  if (!total) {
    return <p className="dr-empty">No graded submissions yet.</p>;
  }
  const parts = [
    { key: "excellent", label: "≥80%", count: bands.excellent, cls: "excellent" },
    { key: "good", label: "65–79%", count: bands.good, cls: "good" },
    { key: "fair", label: "50–64%", count: bands.fair, cls: "fair" },
    { key: "weak", label: "<50%", count: bands.weak, cls: "weak" },
  ];
  return (
    <div className="dr-bands">
      <div className="dr-band-track">
        {parts.map((p) =>
          p.count ? (
            <div
              key={p.key}
              className={`dr-band-seg dr-band-seg--${p.cls}`}
              style={{ width: `${(p.count / total) * 100}%` }}
              title={`${p.label}: ${p.count}`}
            />
          ) : null
        )}
      </div>
      <div className="dr-band-legend">
        {parts.map((p) => (
          <div key={p.key} className="dr-band-legend-item">
            <span className={`dr-dot dr-dot--${p.cls}`} />
            <span>
              {p.label}: <strong>{formatNum(p.count)}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ columns, rows, empty }) {
  if (!rows?.length) {
    return <p className="dr-empty">{empty || "No data."}</p>;
  }
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || row.classroomId || row.teacherId || row.subjectId || idx}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DirectorReports() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [search, setSearch] = useState("");

  const loadOrg = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/director/org-reports");
      setData(res.data || null);
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Failed to load organization reports"
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeliveryExtras = useCallback(async () => {
    try {
      setDeliveryLoading(true);
      const [tokenRes, feedbackRes] = await Promise.all([
        api.get("/director-token-usage/reports-analytics", {
          params: { period: "month" },
        }),
        api.get("/director-feedback/stats"),
      ]);
      setDelivery(tokenRes.data || null);
      setFeedback(feedbackRes.data || null);
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Failed to load report delivery stats"
      );
    } finally {
      setDeliveryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    if (tab === "delivery" && delivery == null && !deliveryLoading) {
      loadDeliveryExtras();
    }
  }, [tab, delivery, deliveryLoading, loadDeliveryExtras]);

  const overview = data?.overview;
  const academic = data?.academic;
  const attendance = data?.attendance;
  const coverage = data?.coverage;

  const filteredClassrooms = useMemo(() => {
    const rows = academic?.byClassroom || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.subjectName?.toLowerCase().includes(q) ||
        r.teacherName?.toLowerCase().includes(q)
    );
  }, [academic, search]);

  const refreshAll = async () => {
    await loadOrg();
    if (tab === "delivery" || delivery != null) {
      setDelivery(null);
      setFeedback(null);
      await loadDeliveryExtras();
    }
  };

  return (
    <div className="directorReportsPage">
      <div className="pageHeader">
        <div className="headerLeft">
          <div className="headerIcon">
            <FiClipboard />
          </div>
          <div>
            <h2>Reports</h2>
            <p>
              Organization-wide academic, attendance, pipeline, and report
              delivery insights
            </p>
          </div>
        </div>
        <button
          type="button"
          className="dr-refresh-btn"
          onClick={refreshAll}
          disabled={loading}
        >
          <FiRefreshCw className={loading ? "is-spinning" : ""} />
          Refresh
        </button>
      </div>

      <div className="dr-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`dr-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="loading">Building organization reports…</p>}

      {!loading && !data && (
        <p className="loading">No report data available.</p>
      )}

      {!loading && data && tab === "overview" && (
        <>
          <div className="dr-stat-grid">
            <StatCard
              icon={<FiHome />}
              label="Classrooms"
              value={formatNum(overview.classroomCount)}
              hint={`${formatNum(overview.activeClassroomCount)} active`}
            />
            <StatCard
              icon={<FiUsers />}
              label="Students"
              value={formatNum(overview.studentCount)}
            />
            <StatCard
              icon={<FiBookOpen />}
              label="Assignments"
              value={formatNum(overview.assignmentCount)}
              hint={`${formatPct(overview.pipeline?.completionRate)} complete`}
            />
            <StatCard
              icon={<FiPercent />}
              label="Avg. grade"
              value={formatPct(academic?.overall?.avgPercent)}
              hint={`${formatNum(academic?.overall?.markedCount)} marked`}
              tone="accent"
            />
            <StatCard
              icon={<FiCalendar />}
              label="Monthly attendance"
              value={formatPct(attendance?.monthly?.avgPresentRate)}
              hint={`${formatNum(attendance?.monthly?.classroomsWithRecords)} classrooms`}
            />
            <StatCard
              icon={<FiCheckCircle />}
              label="Staff"
              value={formatNum(
                (overview.teacherCount || 0) +
                  (overview.managerCount || 0) +
                  (overview.assistantCount || 0) +
                  (overview.qualityManagerCount || 0)
              )}
              hint={`${formatNum(overview.teacherCount)} teachers · ${formatNum(overview.managerCount)} managers`}
            />
          </div>

          <div className="dr-panel">
            <div className="dr-panel-head">
              <h3>Assignment pipeline</h3>
              <Link to="/director/manager-workload" className="dr-link">
                Manager workload →
              </Link>
            </div>
            <div className="dr-status-row">
              <span className="dr-pill dr-pill--done">
                Done {formatNum(overview.pipeline?.done)}
              </span>
              <span className="dr-pill dr-pill--assigned">
                In progress {formatNum(overview.pipeline?.assigned)}
              </span>
              <span className="dr-pill dr-pill--unassigned">
                Unassigned {formatNum(overview.pipeline?.unassigned)}
              </span>
              <span className="dr-pill dr-pill--failed">
                Failed deadline {formatNum(overview.pipeline?.failedDeadline)}
              </span>
              <span className="dr-pill dr-pill--warn">
                Overdue unassigned {formatNum(overview.pipeline?.overdueUnassigned)}
              </span>
            </div>
          </div>

          <div className="dr-split">
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>Grade distribution</h3>
              </div>
              <BandBar bands={academic?.overall?.gradeBands} />
            </div>
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>Gaps to watch</h3>
              </div>
              <ul className="dr-gap-list">
                <li>
                  <FiAlertTriangle />
                  <span>
                    {formatNum(overview.classroomsWithoutTeacher)} classrooms
                    without a teacher
                  </span>
                </li>
                <li>
                  <FiAlertTriangle />
                  <span>
                    {formatNum(overview.classroomsWithoutSubject)} classrooms
                    without a subject
                  </span>
                </li>
                <li>
                  <FiActivity />
                  <span>
                    {formatNum(overview.delivery?.teacherSubmissionReportSent)}{" "}
                    teacher submission reports sent
                  </span>
                </li>
                <li>
                  <FiLayers />
                  <span>
                    {formatNum(overview.delivery?.executiveReportAssignments)}{" "}
                    assignments with executive reports
                  </span>
                </li>
              </ul>
              <div className="dr-quick-links">
                <Link to="/director/assistant-performance">Assistant performance</Link>
                <Link to="/director/token-usage">Token usage</Link>
                <Link to="/director/feedback">Report feedback</Link>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && data && tab === "academic" && (
        <>
          <div className="dr-stat-grid dr-stat-grid--4">
            <StatCard
              icon={<FiPercent />}
              label="Organization average"
              value={formatPct(academic?.overall?.avgPercent)}
              tone="accent"
            />
            <StatCard
              icon={<FiBarChart2 />}
              label="Marked scripts"
              value={formatNum(academic?.overall?.markedCount)}
            />
            <StatCard
              icon={<FiBookOpen />}
              label="Assignments graded"
              value={formatNum(academic?.assignmentsWithGrades)}
            />
            <StatCard
              icon={<FiTrendingUp />}
              label="Subjects with grades"
              value={formatNum(academic?.bySubject?.length)}
            />
          </div>

          <div className="dr-panel">
            <div className="dr-panel-head">
              <h3>Score bands</h3>
            </div>
            <BandBar bands={academic?.overall?.gradeBands} />
          </div>

          <div className="dr-split">
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>
                  <FiTrendingUp /> Strongest classrooms
                </h3>
              </div>
              <DataTable
                empty="Not enough graded work yet."
                columns={[
                  { key: "name", label: "Classroom" },
                  { key: "subjectName", label: "Subject" },
                  {
                    key: "avgPercent",
                    label: "Avg",
                    render: (r) => formatPct(r.avgPercent),
                  },
                  {
                    key: "markedCount",
                    label: "Scripts",
                    render: (r) => formatNum(r.markedCount),
                  },
                ]}
                rows={academic?.strongestClassrooms}
              />
            </div>
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>
                  <FiTrendingDown /> Weakest classrooms
                </h3>
              </div>
              <DataTable
                empty="Not enough graded work yet."
                columns={[
                  { key: "name", label: "Classroom" },
                  { key: "subjectName", label: "Subject" },
                  {
                    key: "avgPercent",
                    label: "Avg",
                    render: (r) => formatPct(r.avgPercent),
                  },
                  {
                    key: "markedCount",
                    label: "Scripts",
                    render: (r) => formatNum(r.markedCount),
                  },
                ]}
                rows={academic?.weakestClassrooms}
              />
            </div>
          </div>

          <div className="dr-split">
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>By subject</h3>
              </div>
              <DataTable
                empty="No subject grades yet."
                columns={[
                  { key: "name", label: "Subject" },
                  {
                    key: "avgPercent",
                    label: "Avg",
                    render: (r) => formatPct(r.avgPercent),
                  },
                  {
                    key: "markedCount",
                    label: "Scripts",
                    render: (r) => formatNum(r.markedCount),
                  },
                  {
                    key: "classroomCount",
                    label: "Classes",
                    render: (r) => formatNum(r.classroomCount),
                  },
                ]}
                rows={academic?.bySubject}
              />
            </div>
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>By teacher</h3>
              </div>
              <DataTable
                empty="No teacher grades yet."
                columns={[
                  { key: "name", label: "Teacher" },
                  {
                    key: "avgPercent",
                    label: "Avg",
                    render: (r) => formatPct(r.avgPercent),
                  },
                  {
                    key: "markedCount",
                    label: "Scripts",
                    render: (r) => formatNum(r.markedCount),
                  },
                  {
                    key: "classroomCount",
                    label: "Classes",
                    render: (r) => formatNum(r.classroomCount),
                  },
                ]}
                rows={academic?.byTeacher}
              />
            </div>
          </div>

          <div className="dr-panel">
            <div className="dr-panel-head">
              <h3>All classrooms with grades</h3>
              <div className="searchBar dr-inline-search">
                <FiSearch />
                <input
                  placeholder="Search classroom, subject, teacher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <DataTable
              empty={
                search
                  ? `No classrooms match “${search}”.`
                  : "No classroom grades yet."
              }
              columns={[
                { key: "name", label: "Classroom" },
                { key: "subjectName", label: "Subject" },
                { key: "teacherName", label: "Teacher" },
                {
                  key: "avgPercent",
                  label: "Avg",
                  render: (r) => formatPct(r.avgPercent),
                },
                {
                  key: "markedCount",
                  label: "Scripts",
                  render: (r) => formatNum(r.markedCount),
                },
                {
                  key: "assignmentCount",
                  label: "Assignments",
                  render: (r) => formatNum(r.assignmentCount),
                },
              ]}
              rows={filteredClassrooms}
            />
          </div>
        </>
      )}

      {!loading && data && tab === "attendance" && (
        <>
          <div className="dr-stat-grid dr-stat-grid--4">
            <StatCard
              icon={<FiCalendar />}
              label="Monthly present rate"
              value={formatPct(attendance?.monthly?.avgPresentRate)}
              tone="accent"
            />
            <StatCard
              icon={<FiHome />}
              label="Classes with monthly logs"
              value={formatNum(attendance?.monthly?.classroomsWithRecords)}
              hint={`${formatNum(attendance?.monthly?.recordsCount)} month records`}
            />
            <StatCard
              icon={<FiCheckCircle />}
              label="Lesson present rate"
              value={formatPct(attendance?.lesson?.avgPresentRate)}
            />
            <StatCard
              icon={<FiClipboard />}
              label="Lesson attendance sheets"
              value={formatNum(attendance?.lesson?.recordsCount)}
              hint={`${formatNum(attendance?.lesson?.classroomsWithRecords)} classrooms`}
            />
          </div>

          <div className="dr-panel">
            <div className="dr-panel-head">
              <h3>Recent monthly attendance</h3>
            </div>
            <DataTable
              empty="No monthly attendance has been saved yet."
              columns={[
                {
                  key: "label",
                  label: "Month",
                  render: (r) => monthLabel(r.year, r.month),
                },
                {
                  key: "classrooms",
                  label: "Classrooms",
                  render: (r) => formatNum(r.classrooms),
                },
                {
                  key: "totalSessions",
                  label: "Sessions",
                  render: (r) => formatNum(r.totalSessions),
                },
                {
                  key: "avgPresentRate",
                  label: "Present rate",
                  render: (r) => formatPct(r.avgPresentRate),
                },
              ]}
              rows={attendance?.monthly?.recentMonths}
            />
          </div>
        </>
      )}

      {!loading && data && tab === "delivery" && (
        <>
          <div className="dr-stat-grid dr-stat-grid--4">
            <StatCard
              icon={<FiClipboard />}
              label="Submission reports sent"
              value={formatNum(overview?.delivery?.teacherSubmissionReportSent)}
            />
            <StatCard
              icon={<FiBarChart2 />}
              label="Exec. report assignments"
              value={formatNum(overview?.delivery?.executiveReportAssignments)}
            />
            <StatCard
              icon={<FiMessageSquare />}
              label="Parent feedback avg"
              value={
                feedback?.avgRating != null
                  ? Number(feedback.avgRating).toFixed(1)
                  : "—"
              }
              hint={
                feedback
                  ? `${formatNum(feedback.totalResponses)} responses`
                  : deliveryLoading
                    ? "Loading…"
                    : undefined
              }
              tone="accent"
            />
            <StatCard
              icon={<FiActivity />}
              label="Report deliveries (month)"
              value={
                delivery
                  ? formatNum(delivery.grandDeliveries)
                  : deliveryLoading
                    ? "…"
                    : "—"
              }
              hint={
                delivery
                  ? `≈ $${Number(delivery.grandCostUsd || 0).toFixed(2)}`
                  : undefined
              }
            />
          </div>

          <div className="dr-split">
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>Delivery by report type</h3>
                <Link to="/director/token-usage" className="dr-link">
                  Token usage →
                </Link>
              </div>
              {deliveryLoading && !delivery ? (
                <p className="dr-empty">Loading delivery analytics…</p>
              ) : (
                <DataTable
                  empty="No report delivery activity this month."
                  columns={[
                    {
                      key: "label",
                      label: "Type",
                      render: (r) => r.label || r.source,
                    },
                    {
                      key: "deliveryCount",
                      label: "Deliveries",
                      render: (r) => formatNum(r.deliveryCount),
                    },
                    {
                      key: "costUsd",
                      label: "Cost USD",
                      render: (r) =>
                        `$${Number(r.costUsd || r.estimatedCostUsd || 0).toFixed(2)}`,
                    },
                  ]}
                  rows={delivery?.types}
                />
              )}
            </div>
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>Feedback quality</h3>
                <Link to="/director/feedback" className="dr-link">
                  Open feedback →
                </Link>
              </div>
              {deliveryLoading && !feedback ? (
                <p className="dr-empty">Loading feedback stats…</p>
              ) : feedback ? (
                <ul className="dr-gap-list">
                  <li>
                    <FiCheckCircle />
                    <span>
                      Average rating{" "}
                      <strong>
                        {feedback.avgRating != null
                          ? Number(feedback.avgRating).toFixed(2)
                          : "—"}
                      </strong>
                    </span>
                  </li>
                  <li>
                    <FiUsers />
                    <span>
                      Parent responses{" "}
                      <strong>{formatNum(feedback.parentResponses)}</strong>
                    </span>
                  </li>
                  <li>
                    <FiAlertTriangle />
                    <span>
                      Low ratings (≤3){" "}
                      <strong>{formatNum(feedback.lowRatings)}</strong>
                    </span>
                  </li>
                  <li>
                    <FiBarChart2 />
                    <span>
                      Distribution{" "}
                      {[1, 2, 3, 4, 5]
                        .map(
                          (n) =>
                            `${n}★ ${formatNum(feedback.distribution?.[n] || 0)}`
                        )
                        .join(" · ")}
                    </span>
                  </li>
                </ul>
              ) : (
                <p className="dr-empty">No feedback stats yet.</p>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && data && tab === "coverage" && (
        <>
          <div className="dr-stat-grid dr-stat-grid--4">
            <StatCard
              icon={<FiHome />}
              label="Active classrooms"
              value={formatNum(overview?.activeClassroomCount)}
            />
            <StatCard
              icon={<FiAlertTriangle />}
              label="Missing teacher"
              value={formatNum(overview?.classroomsWithoutTeacher)}
              tone="warn"
            />
            <StatCard
              icon={<FiAlertTriangle />}
              label="Missing subject"
              value={formatNum(overview?.classroomsWithoutSubject)}
              tone="warn"
            />
            <StatCard
              icon={<FiLayers />}
              label="Google accounts"
              value={formatNum(overview?.googleAccountCount)}
            />
          </div>

          <div className="dr-panel">
            <div className="dr-panel-head">
              <h3>Busiest classrooms</h3>
            </div>
            <DataTable
              empty="No classrooms found."
              columns={[
                { key: "name", label: "Classroom" },
                { key: "subjectName", label: "Subject" },
                { key: "teacherName", label: "Teacher" },
                {
                  key: "assignmentCount",
                  label: "Assignments",
                  render: (r) => formatNum(r.assignmentCount),
                },
              ]}
              rows={coverage?.topClassroomsByAssignments}
            />
          </div>

          <div className="dr-split">
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>Missing teacher assignment</h3>
                <Link
                  to="/director/manage-classroom-teachers"
                  className="dr-link"
                >
                  Assign →
                </Link>
              </div>
              <DataTable
                empty="All classrooms have teachers."
                columns={[
                  { key: "name", label: "Classroom" },
                  { key: "subjectName", label: "Subject" },
                  {
                    key: "assignmentCount",
                    label: "Assignments",
                    render: (r) => formatNum(r.assignmentCount),
                  },
                ]}
                rows={coverage?.missingTeacher}
              />
            </div>
            <div className="dr-panel">
              <div className="dr-panel-head">
                <h3>Missing subject</h3>
                <Link to="/director/subjects" className="dr-link">
                  Subjects →
                </Link>
              </div>
              <DataTable
                empty="All classrooms have subjects."
                columns={[
                  { key: "name", label: "Classroom" },
                  { key: "teacherName", label: "Teacher" },
                  {
                    key: "assignmentCount",
                    label: "Assignments",
                    render: (r) => formatNum(r.assignmentCount),
                  },
                ]}
                rows={coverage?.missingSubject}
              />
            </div>
          </div>
        </>
      )}

      {data?.generatedAt && !loading && (
        <p className="dr-generated">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
