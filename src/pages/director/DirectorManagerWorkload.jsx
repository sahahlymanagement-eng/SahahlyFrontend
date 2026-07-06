import { useEffect, useMemo, useState } from "react";
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
} from "react-icons/fi";

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

export default function DirectorManagerWorkload() {
  const [managers, setManagers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get("/director/manager-workload");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return managers;

    return managers.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
    );
  }, [search, managers]);

  return (
    <div className="managerWorkloadPage">
      <div className="pageHeader">
        <div className="headerLeft">
          <div className="headerIcon">
            <FiBarChart2 />
          </div>
          <div>
            <h2>Manager Workload</h2>
            <p>Assignment pipeline across each manager&apos;s classrooms</p>
          </div>
        </div>
      </div>

      {summary && !loading && (
        <div className="mw-summary-grid">
          <SummaryCard
            icon={<FiUsers />}
            label="Managers"
            value={formatNum(summary.managerCount)}
          />
          <SummaryCard
            icon={<FiHome />}
            label="Classrooms"
            value={formatNum(summary.classroomCount)}
          />
          <SummaryCard
            icon={<FiBarChart2 />}
            label="Total assignments"
            value={formatNum(summary.totalAssignments)}
          />
          <SummaryCard
            icon={<FiTrendingUp />}
            label="Completion rate"
            value={`${summary.completionRate || 0}%`}
          />
        </div>
      )}

      {summary && !loading && (
        <div className="mw-summary-status">
          <StatusPill label="Done" value={summary.done} tone="done" />
          <StatusPill label="Assigned" value={summary.assigned} tone="assigned" />
          <StatusPill label="Unassigned" value={summary.unassigned} tone="unassigned" />
          <StatusPill
            label="Failed deadline"
            value={summary.failedDeadline}
            tone="failed"
          />
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
          {search ? `No managers match "${search}".` : "No managers found."}
        </p>
      )}

      <div className="workloadGrid">
        {filtered.map((m) => (
          <div className="managerCard" key={m.managerId}>
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
            </div>

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
                <div className="metricIcon">
                  <FiHome />
                </div>
                <div>
                  <span>{m.classroomCount}</span>
                  <p>Classrooms</p>
                </div>
              </div>
              <div className="metricBox">
                <div className="metricIcon">
                  <FiUsers />
                </div>
                <div>
                  <span>{m.teacherCount}</span>
                  <p>Teachers</p>
                </div>
              </div>
              <div className="metricBox">
                <div className="metricIcon">
                  <FiBarChart2 />
                </div>
                <div>
                  <span>{m.totalAssignments}</span>
                  <p>Assignments</p>
                </div>
              </div>
            </div>

            <div className="statusGrid statusGrid--four">
              <div className="statusItem done">
                <div className="statusTitle">
                  <FiCheckCircle />
                  <span>Done</span>
                </div>
                <strong>{m.done}</strong>
              </div>
              <div className="statusItem assigned">
                <div className="statusTitle">
                  <FiUser />
                  <span>Assigned</span>
                </div>
                <strong>{m.assigned}</strong>
              </div>
              <div className="statusItem unassigned">
                <div className="statusTitle">
                  <FiClock />
                  <span>Unassigned</span>
                </div>
                <strong>{m.unassigned}</strong>
              </div>
              <div className="statusItem late">
                <div className="statusTitle">
                  <FiAlertTriangle />
                  <span>Failed deadline</span>
                </div>
                <strong>{m.failedDeadline}</strong>
              </div>
            </div>

            <div className="mw-extra-metrics">
              {m.overdueUnassigned > 0 && (
                <span className="mw-flag mw-flag--warn">
                  <FiCalendar />
                  {m.overdueUnassigned} overdue &amp; unassigned
                </span>
              )}
              {m.averageTurnaroundHours != null && (
                <span className="mw-flag">
                  <FiTrendingUp />
                  Avg turnaround: {m.averageTurnaroundHours}h after due
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
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

function StatusPill({ label, value, tone }) {
  return (
    <div className={`mw-status-pill mw-status-pill--${tone}`}>
      <span>{label}</span>
      <strong>{formatNum(value)}</strong>
    </div>
  );
}
