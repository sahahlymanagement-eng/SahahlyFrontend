import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import "./AssistantPerformance.css";
import {
  FiArrowLeft,
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
    <div className="assistantPerfPage">
      <header className="assistantPerfHeader">
        <div className="assistantPerfHeaderLeft">
          <button
            type="button"
            className="assistantPerfBack"
            onClick={() => navigate("/assistant/dashboard")}
          >
            <FiArrowLeft /> Back
          </button>
          <div className="assistantPerfTitleWrap">
            <div className="assistantPerfIcon">
              <FiBarChart2 />
            </div>
            <div>
              <h1>Performance</h1>
              <p>Your marking output, token usage, and deadline delivery</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="assistantPerfRefresh"
          onClick={() => loadPerformance(user.id)}
          disabled={loading}
        >
          <FiRefreshCw /> Refresh
        </button>
      </header>

      {loading && <p className="assistantPerfLoading">Loading performance…</p>}

      {!loading && data && (
        <>
          <section className="assistantPerfSection">
            <h2>Overview</h2>
            <div className="assistantPerfGrid">
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
            <section className="assistantPerfSection">
              <h2>Token usage</h2>
              <div className="assistantPerfTokenRow">
                <span>Input: {formatNum(tokenUsage.inputTokens)}</span>
                <span>Output: {formatNum(tokenUsage.outputTokens)}</span>
                <span>Total: {formatNum(tokenUsage.totalTokens)}</span>
                <span>Cost: {formatCostUsd(tokenUsage.costUsd)} · {formatCostEgp(tokenUsage.costEgp)}</span>
              </div>
            </section>
          )}

          <section className="assistantPerfSection">
            <h2>Teachers ({teachers.length})</h2>
            {teachers.length === 0 ? (
              <p className="assistantPerfEmpty">No teachers linked to your assignments yet.</p>
            ) : (
              <div className="assistantPerfChipList">
                {teachers.map((t) => (
                  <span key={t.id} className="assistantPerfChip">
                    {t.name}
                    {t.email ? ` · ${t.email}` : ""}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="assistantPerfSection">
            <h2>By classroom</h2>
            {classrooms.length === 0 ? (
              <p className="assistantPerfEmpty">No classroom data yet.</p>
            ) : (
              <div className="assistantPerfTableWrap">
                <table className="assistantPerfTable">
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
                            <span className="assistantPerfMuted"> · {c.section}</span>
                          ) : null}
                        </td>
                        <td>{c.teacherName}</td>
                        <td>{c.totalAssignments}</td>
                        <td>{formatNum(c.papersCorrected)}</td>
                        <td className="assistantPerfGood">{c.onTime}</td>
                        <td className="assistantPerfWarn">{c.missedDeadline}</td>
                        <td>{c.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    <div className={`assistantPerfCard${tone ? ` assistantPerfCard--${tone}` : ""}`}>
      <div className="assistantPerfCardTop">
        <span className="assistantPerfCardIcon">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="assistantPerfCardValue">{value}</div>
      {sub ? <div className="assistantPerfCardSub">{sub}</div> : null}
    </div>
  );
}
