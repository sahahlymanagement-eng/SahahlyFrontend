import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import {
  FiBarChart2,
  FiBookOpen,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiRefreshCw,
  FiUsers,
  FiFileText,
  FiCpu,
} from "react-icons/fi";
import { formatCostEgp, formatCostUsd } from "../../utils/markingCost";
import { AssistantPageHeader, AssistantLoading } from "./AssistantUI";

function formatNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString();
}

export default function AssistantPerformance() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsed = JSON.parse(storedUser);
    if (parsed?.roleId?.name?.toLowerCase() !== "assistant") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsed);
  }, [navigate]);

  const loadPerformance = async (personId) => {
    try {
      setLoading(true);
      const res = await api.get("/assignment-workflow/assistant/performance", {
        params: { personId },
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load performance");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadPerformance(user.id);
  }, [user?.id]);

  if (!user) return null;

  const summary = data?.summary || {};
  const tokenUsage = data?.tokenUsage || {};
  const teachers = data?.teachers || [];
  const classrooms = data?.classrooms || [];

  return (
    <div className="ast-page ast-page--wide">
      <AssistantPageHeader
        eyebrow="Analytics"
        title="Performance"
        subtitle="Your marking output, token usage, and deadline delivery"
        actions={
          <button
            type="button"
            className="ast-btn ast-btn--secondary"
            onClick={() => loadPerformance(user.id)}
            disabled={loading}
          >
            <FiRefreshCw />
            Refresh
          </button>
        }
      />

      {loading && !data ? (
        <AssistantLoading message="Loading performance…" />
      ) : null}

      {!loading && data && (
        <>
          <section className="ast-perf-section">
            <h2>Overview</h2>
            <div className="ast-perf-grid">
              <MetricCard
                icon={<FiFileText />}
                label="Papers corrected"
                value={formatNum(data.papersCorrected)}
              />
              <MetricCard
                icon={<FiCpu />}
                label="Tokens used"
                value={formatNum(tokenUsage.totalTokens)}
                sub={
                  tokenUsage.requestCount
                    ? `${formatNum(tokenUsage.requestCount)} marking requests`
                    : null
                }
              />
              <MetricCard
                icon={<FiUsers />}
                label="Teachers"
                value={formatNum(summary.teacherCount)}
              />
              <MetricCard
                icon={<FiBookOpen />}
                label="Classrooms"
                value={formatNum(summary.classroomCount)}
              />
              <MetricCard
                icon={<FiCheckCircle />}
                label="On time"
                value={formatNum(summary.onTime)}
                tone="good"
              />
              <MetricCard
                icon={<FiAlertTriangle />}
                label="Passed deadline"
                value={formatNum(summary.missedDeadline)}
                tone="warn"
              />
              <MetricCard
                icon={<FiClock />}
                label="In progress"
                value={formatNum(summary.pending)}
              />
              <MetricCard
                icon={<FiBarChart2 />}
                label="Total assignments"
                value={formatNum(summary.totalAssignments)}
              />
            </div>
          </section>

          {tokenUsage.totalTokens > 0 && (
            <section className="ast-perf-section">
              <h2>Token usage</h2>
              <div className="ast-perf-token-row">
                <span>Input: {formatNum(tokenUsage.inputTokens)}</span>
                <span>Output: {formatNum(tokenUsage.outputTokens)}</span>
                <span>Total: {formatNum(tokenUsage.totalTokens)}</span>
                <span>
                  Cost: {formatCostUsd(tokenUsage.costUsd)} · {formatCostEgp(tokenUsage.costEgp)}
                </span>
              </div>
            </section>
          )}

          <section className="ast-perf-section">
            <h2>Teachers ({teachers.length})</h2>
            {teachers.length === 0 ? (
              <p className="ast-empty">No teachers linked to your assignments yet.</p>
            ) : (
              <div className="ast-perf-chip-list">
                {teachers.map((t) => (
                  <span key={t.id} className="ast-perf-chip">
                    {t.name}
                    {t.email ? ` · ${t.email}` : ""}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="ast-perf-section">
            <h2>By classroom</h2>
            {classrooms.length === 0 ? (
              <p className="ast-empty">No classroom data yet.</p>
            ) : (
              <div className="ast-table-card">
                <div className="ast-table-wrap">
                  <table className="ast-table">
                    <thead>
                      <tr>
                        <th>Classroom</th>
                        <th>Teacher</th>
                        <th>Assignments</th>
                        <th>Papers corrected</th>
                        <th>On time</th>
                        <th>Passed deadline</th>
                        <th>In progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classrooms.map((c) => (
                        <tr key={c.classroomId}>
                          <td>
                            <strong>{c.classroomName}</strong>
                            {c.section ? (
                              <span className="ast-muted"> · {c.section}</span>
                            ) : null}
                          </td>
                          <td>{c.teacherName}</td>
                          <td>{c.totalAssignments}</td>
                          <td>{formatNum(c.papersCorrected)}</td>
                          <td className="ast-perf-good">{c.onTime}</td>
                          <td className="ast-perf-warn">{c.missedDeadline}</td>
                          <td>{c.pending}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, sub, tone }) {
  return (
    <div className={`ast-perf-card${tone ? ` ast-perf-card--${tone}` : ""}`}>
      <div className="ast-perf-card-top">
        <span className="ast-perf-card-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="ast-perf-card-value">{value}</div>
      {sub ? <div className="ast-perf-card-sub">{sub}</div> : null}
    </div>
  );
}
