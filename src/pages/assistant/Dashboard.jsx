import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import {
  FiRefreshCw,
  FiClipboard,
  FiCheckCircle,
  FiAlertTriangle,
  FiBarChart2,
  FiChevronRight,
  FiBookOpen,
} from "react-icons/fi";
import { AssistantLoading } from "./AssistantUI";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";

// Each tile combines the classroom count with its external grading-partner
// counterpart (EXTERNAL_ASSIGNED already folds in IN_PROGRESS — see
// assignment-workflow.js's /assistant/summary).
const STATUSES = [
  { key: "ASSIGNED", externalKey: "EXTERNAL_ASSIGNED", label: "Assigned", icon: <FiClipboard />, tone: "violet" },
  { key: "DONE", externalKey: "EXTERNAL_DONE", label: "Done", icon: <FiCheckCircle />, tone: "green" },
  { key: "FAILED_DEADLINE", externalKey: "EXTERNAL_FAILED_DEADLINE", label: "Failed Deadline", icon: <FiAlertTriangle />, tone: "red" },
  { key: "TOTAL", externalKey: "EXTERNAL_TOTAL", label: "Total", icon: <FiBarChart2 />, tone: "indigo" },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function AssistantDashboard() {
  const navigate = useNavigate();
  const period = useDashboardPeriod();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState(() => {
    const base = {};
    STATUSES.forEach((s) => (base[s.key] = 0));
    return base;
  });

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsedUser = JSON.parse(storedUser);
    const roleName = parsedUser?.roleId?.name?.toLowerCase() || "";

    if (roleName !== "assistant") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsedUser);
  }, [navigate]);

  const loadSummary = async (personId) => {
    try {
      setLoading(true);
      const res = await api.get("/assignment-workflow/assistant/summary", {
        params: { personId, ...period.params },
      });
      const data = res.data || {};
      const safe = {};
      STATUSES.forEach((s) => {
        safe[s.key] = Number(data[s.key] || 0) + Number(data[s.externalKey] || 0);
      });
      setCounts(safe);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadSummary(user.id);
  }, [user?.id, period.params.from, period.params.to]);

  const refresh = () => {
    if (!user?.id) return;
    loadSummary(user.id);
  };

  if (!user) return null;

  return (
    <div className="ast-page">
      <section className="ast-hero">
        <div className="ast-hero-top">
          <div>
            <p className="ast-hero-greeting">{getGreeting()}</p>
            <h1>
              Welcome back, <span>{user.name?.split(" ")[0] || "Assistant"}</span>
            </h1>
            <p>
              Track your assignment workload, mark submissions on time, and review your
              performance — all from one place.
            </p>
          </div>
          <button
            type="button"
            className="ast-btn ast-btn--secondary"
            onClick={refresh}
            disabled={loading}
          >
            <FiRefreshCw />
            Refresh
          </button>
        </div>
      </section>

      <DashboardPeriodFilter
        from={period.from}
        to={period.to}
        setFrom={period.setFrom}
        setTo={period.setTo}
        resetToThisMonth={period.resetToThisMonth}
        monthLabel={period.monthLabel}
      />

      <h2 className="ast-section-title">Workload overview</h2>

      {loading && counts.TOTAL === 0 ? (
        <AssistantLoading message="Loading dashboard…" />
      ) : (
        <div className="ast-stats-grid">
          {STATUSES.map((stat, i) => (
            <StatCard
              key={stat.key}
              icon={stat.icon}
              label={stat.label}
              value={counts[stat.key]}
              tone={stat.tone}
              delay={i * 0.04}
            />
          ))}
        </div>
      )}

      <h2 className="ast-section-title">Quick actions</h2>

      <div className="ast-actions-grid">
        <ActionCard
          icon={<FiClipboard />}
          title="View Assignments"
          desc="Open your assignment list and start marking"
          onClick={() => navigate("/assistant/assignments")}
        />
        <ActionCard
          icon={<FiBarChart2 />}
          title="Performance"
          desc="Papers corrected and deadline delivery"
          onClick={() => navigate("/assistant/performance")}
        />
        <ActionCard
          icon={<FiBookOpen />}
          title="Course Management"
          desc="Browse the classrooms you have assignments in"
          onClick={() => navigate("/assistant/courses")}
        />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone, delay }) {
  return (
    <div
      className={`ast-stat-card ast-stat-card--${tone}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="ast-stat-card-top">
        <div className="ast-stat-card-icon">{icon}</div>
        <span>{label}</span>
      </div>
      <div className="ast-stat-card-value">{value}</div>
    </div>
  );
}

function ActionCard({ icon, title, desc, onClick }) {
  return (
    <button type="button" className="ast-action-card" onClick={onClick}>
      <div>
        <div className="ast-action-card-icon">{icon}</div>
        <h4>{title}</h4>
        <p>{desc}</p>
      </div>
      <FiChevronRight className="ast-action-card-arrow" size={22} />
    </button>
  );
}
