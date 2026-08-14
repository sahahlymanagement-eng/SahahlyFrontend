import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import api from "../../api/api";
import "./DirectorManagerWorkload.css";
import { toast } from "react-toastify";

import {
  FiBarChart2,
  FiUser,
  FiMail,
  FiHome,
  FiCheckCircle,
  FiAlertTriangle,
  FiSearch,
  FiClock,
  FiUsers,
  FiTrendingUp,
  FiCalendar,
  FiX,
  FiFileText,
} from "react-icons/fi";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";

const STATUS_FILTERS = [
  { key: "all", label: "All managers" },
  { key: "unassigned", label: "Late on manager", field: "unassigned" },
  { key: "inProgress", label: "In progress", field: "assigned" },
  { key: "failedDeadline", label: "Late on assistant", field: "failedDeadline" },
  { key: "late", label: "Late", field: "lateReports" },
];

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

function healthTone(value) {
  if (value >= 75) return "good";
  if (value >= 50) return "mid";
  return "low";
}

export default function DirectorManagerWorkload() {
  const period = useDashboardPeriod();
  const [managers, setManagers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [period.params.from, period.params.to]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get("/director/manager-workload", {
        params: period.params,
      });
      setManagers(res.data?.managers || []);
      setSummary(res.data?.summary || null);
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Failed to load manager workload"
      );
      setManagers([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (manager) => {
    setDetail({ manager });
    setDetailLoading(true);
    try {
      const res = await api.get("/director/manager-workload/detail", {
        params: { personId: manager.managerId, ...period.params },
      });
      setDetail(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load manager detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => setDetail(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterMeta = STATUS_FILTERS.find((f) => f.key === statusFilter);

    return managers.filter((m) => {
      if (q && !m.name?.toLowerCase().includes(q) && !m.email?.toLowerCase().includes(q)) {
        return false;
      }
      if (!filterMeta?.field) return true;
      return (m[filterMeta.field] || 0) > 0;
    });
  }, [search, managers, statusFilter]);

  const applyStatusFilter = useCallback((key) => {
    setStatusFilter((prev) => (prev === key ? "all" : key));
  }, []);

  return (
    <div className="managerWorkloadPage">
      <div className="pageHeader">
        <div className="headerLeft">
          <div className="headerIcon">
            <FiBarChart2 />
          </div>
          <div>
            <h2>Manager Workload</h2>
            <p>Pipeline, reports, edits, and capacity across each manager</p>
          </div>
        </div>
      </div>

      <DashboardPeriodFilter
        from={period.from}
        to={period.to}
        setFrom={period.setFrom}
        setTo={period.setTo}
        resetToThisMonth={period.resetToThisMonth}
        monthLabel={period.monthLabel}
      />

      {summary && !loading && (
        <div className="mw-summary-grid">
          <SummaryCard icon={<FiUsers />} label="Managers" value={formatNum(summary.managerCount)} />
          <SummaryCard icon={<FiHome />} label="Classrooms" value={formatNum(summary.classroomCount)} />
          <SummaryCard icon={<FiBarChart2 />} label="Total assignments" value={formatNum(summary.totalAssignments)} />
          <SummaryCard icon={<FiTrendingUp />} label="Completion rate" value={`${summary.completionRate || 0}%`} />
        </div>
      )}

      {summary && !loading && (
        <div className="mw-summary-status">
          {STATUS_FILTERS.filter((f) => f.key !== "all").map((f) => (
            <button
              key={f.key}
              type="button"
              className={`mw-status-pill mw-status-pill--clickable mw-status-pill--${f.key}${
                statusFilter === f.key ? " mw-status-pill--active" : ""
              }`}
              onClick={() => applyStatusFilter(f.key)}
            >
              <span>{f.label}</span>
              <strong>
                {formatNum(
                  f.key === "late"
                    ? (summary.failedDeadline || 0) + (summary.overdueUnassigned || 0)
                    : summary[f.field] ?? 0
                )}
              </strong>
            </button>
          ))}
        </div>
      )}

      <div className="searchBar">
        <FiSearch />
        <input
          placeholder="Search manager..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="loading">Loading workload…</p>}

      {!loading && !filtered.length && (
        <p className="loading">
          {search || statusFilter !== "all"
            ? "No managers match the current filters."
            : "No managers found."}
        </p>
      )}

      <div className="workloadGrid">
        {filtered.map((m) => (
          <button
            type="button"
            className="managerCard managerCard--clickable"
            key={m.managerId}
            onClick={() => openDetail(m)}
          >
            <div className="managerTop">
              <div className="managerAvatar">
                <FiUser />
              </div>
              <div className="managerInfo">
                <h3>{m.name}</h3>
                <p>
                  <FiMail />
                  <span>{m.email}</span>
                </p>
              </div>
              <span className="mw-card-open">Details →</span>
            </div>

            <HealthBar label="Overall health" value={m.health ?? m.capacity?.health ?? 0} />
            <HealthBar label="Report returns" value={m.reportReturnRate ?? 0} tone="reports" />

            <div className="mw-progress-wrap">
              <div className="mw-progress-label">
                <span>Completion</span>
                <strong>{m.completionRate || 0}%</strong>
              </div>
              <div className="mw-progress-track">
                <div
                  className="mw-progress-fill"
                  style={{ width: `${Math.min(m.completionRate || 0, 100)}%` }}
                />
              </div>
            </div>

            <div className="metricsRow">
              <div className="metricBox">
                <div className="metricIcon"><FiHome /></div>
                <div><span>{m.classroomCount}</span><p>Classrooms</p></div>
              </div>
              <div className="metricBox">
                <div className="metricIcon"><FiUsers /></div>
                <div><span>{m.studentCount ?? m.teacherCount}</span><p>{m.studentCount != null ? "Students" : "Teachers"}</p></div>
              </div>
              <div className="metricBox">
                <div className="metricIcon"><FiFileText /></div>
                <div><span>{m.monthlyEdits ?? 0}</span><p>Edits (mo)</p></div>
              </div>
            </div>

            <div className="mw-report-row">
              <span><FiCheckCircle /> Sent: {m.reportsSent ?? 0}</span>
              <span><FiClock /> Unsent: {m.unsentReports ?? 0}</span>
              <span><FiAlertTriangle /> Late: {m.lateReports ?? 0}</span>
            </div>

            <div className="statusGrid statusGrid--four">
              {STATUS_FILTERS.filter((f) => f.field).map((f) => (
                <div
                  key={f.key}
                  className={`statusItem statusItem--clickable statusItem--${f.key}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    applyStatusFilter(f.key);
                  }}
                >
                  <div className="statusTitle">
                    <span>{f.label}</span>
                  </div>
                  <strong>{m[f.field] ?? 0}</strong>
                </div>
              ))}
            </div>

            <div className="mw-extra-metrics">
              {m.overdueUnassigned > 0 && (
                <span className="mw-flag mw-flag--warn">
                  <FiCalendar />
                  {m.overdueUnassigned} overdue &amp; unassigned
                </span>
              )}
              {m.capacity?.studentUtilization != null && (
                <span className="mw-flag">
                  <FiUsers />
                  Student load: {m.capacity.studentUtilization}%
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {detail &&
        createPortal(
          <div className="mw-modal-overlay" onClick={closeDetail}>
            <div className="mw-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mw-modal-header">
                <h3>{detail.manager?.name || detail.name || "Manager"}</h3>
                <button type="button" className="mw-modal-close" onClick={closeDetail}>
                  <FiX />
                </button>
              </div>
              <div className="mw-modal-body">
                {detailLoading && <p className="loading">Loading detail…</p>}
                {!detailLoading && detail.metrics && (
                  <div className="mw-modal-metrics">
                    <HealthBar label="Health" value={detail.metrics.health ?? 0} />
                    <div className="mw-report-row">
                      <span>Reports sent: {detail.metrics.reportsSent ?? 0}</span>
                      <span>Unsent: {detail.metrics.unsentReports ?? 0}</span>
                      <span>Late: {detail.metrics.lateReports ?? 0}</span>
                      <span>Edits (mo): {detail.metrics.monthlyEdits ?? 0}</span>
                    </div>
                  </div>
                )}
                {!detailLoading && detail.teachers?.length > 0 && (
                  <>
                    <h4>By teacher</h4>
                    <div className="mw-detail-table-wrap">
                      <table className="mw-detail-table">
                        <thead>
                          <tr>
                            <th>Teacher</th>
                            <th>Classrooms</th>
                            <th>Students</th>
                            <th>Edits</th>
                            <th>Reports sent</th>
                            <th>Unsent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.teachers.map((t) => (
                            <tr key={t.teacherId}>
                              <td>{t.name}</td>
                              <td>{t.classroomCount}</td>
                              <td>{t.studentCount}</td>
                              <td>{t.monthlyEdits}</td>
                              <td>{t.reportsSent}</td>
                              <td>{t.unsentReports}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {!detailLoading && detail.classrooms?.length > 0 && (
                  <>
                    <h4>By classroom</h4>
                    <div className="mw-detail-table-wrap">
                      <table className="mw-detail-table">
                        <thead>
                          <tr>
                            <th>Classroom</th>
                            <th>Teacher</th>
                            <th>Students</th>
                            <th>Edits</th>
                            <th>Reports sent</th>
                            <th>Unsent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.classrooms.map((c) => (
                            <tr key={c.classroomId}>
                              <td>{c.name}</td>
                              <td>{c.teacher?.name || "—"}</td>
                              <td>{c.studentCount ?? 0}</td>
                              <td>{c.monthlyEdits ?? 0}</td>
                              <td>{c.reportsSent ?? 0}</td>
                              <td>{c.unsentReports ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {!detailLoading && detail.assignmentBreakdown?.length > 0 && (
                  <>
                    <h4>Edits by assignment</h4>
                    <div className="mw-detail-table-wrap">
                      <table className="mw-detail-table">
                        <thead>
                          <tr>
                            <th>Assignment</th>
                            <th>Class</th>
                            <th>Teacher</th>
                            <th>Edits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.assignmentBreakdown.map((row) => (
                            <tr key={row.assignmentId}>
                              <td>{row.title}</td>
                              <td>{row.className}</td>
                              <td>{row.teacherName}</td>
                              <td>{row.edits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="mw-summary-card">
      <span className="mw-summary-icon">{icon}</span>
      <div>
        <span className="mw-summary-value">{value}</span>
        <span className="mw-summary-label">{label}</span>
      </div>
    </div>
  );
}

function HealthBar({ label, value, tone = "health" }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="mw-health-wrap">
      <div className="mw-health-label">
        <span>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="mw-health-track">
        <div
          className={`mw-health-fill mw-health-fill--${tone} mw-health-fill--${healthTone(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
