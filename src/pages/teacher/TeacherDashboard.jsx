import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import {
  FiBookOpen,
  FiPlusCircle,
  FiRefreshCw,
  FiEdit3,
  FiBarChart2,
  FiClipboard,
  FiMessageCircle,
  FiAlertCircle,
} from "react-icons/fi";
import { TeacherActionLink } from "./TeacherUI";
import "./teacher.css";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [courseCount, setCourseCount] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);

  const loadStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const res = await api.get(`/google-classroom/teacher-courses/${user.id}`, {
        params: { page: 1, limit: 1 },
      });
      setCourseCount(res.data?.total ?? 0);
    } catch {
      setCourseCount(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadBriefing = useCallback(async () => {
    if (!user?.id) return;
    try {
      setBriefingLoading(true);
      const res = await api.get("/teacher-chatbot/briefing", {
        params: { personId: user.id },
      });
      setBriefing(res.data);
    } catch {
      setBriefing(null);
    } finally {
      setBriefingLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadStats();
    loadBriefing();
  }, [loadStats, loadBriefing]);

  const refreshAll = () => {
    loadStats();
    loadBriefing();
  };

  const summary = briefing?.summary;

  return (
    <div className="tch-page">
      <section className="tch-hero">
        <p className="tch-hero-greeting">
          {briefing?.greeting || `${getGreeting()}${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        </p>
        <h1>
          Welcome back, <span>{user.name?.split(" ")[0] || "Teacher"}</span>
        </h1>
        <p>
          Create assignments, track student submissions, and manage your Google Classroom
          courses — all from one place.
        </p>
      </section>

      <section className="tch-briefing" aria-label="Today's briefing">
        <div className="tch-briefing-head">
          <div>
            <div className="tch-briefing-eyebrow">Today&apos;s briefing</div>
            <h2 className="tch-briefing-title">What needs attention</h2>
          </div>
          <button
            type="button"
            className="tch-btn tch-btn--ghost"
            onClick={() => navigate("/teacher/ai-agent")}
          >
            <FiMessageCircle size={15} />
            Ask AI Agent
          </button>
        </div>

        {briefingLoading ? (
          <div className="tch-briefing-loading">Loading your briefing…</div>
        ) : briefing ? (
          <>
            <div className="tch-briefing-stats">
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {summary?.papersMarkedToday ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Marked today</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {summary?.awaitingCorrection ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Awaiting correction</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {summary?.assistantsBehind ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Assistants behind</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {summary?.upcomingDueSoon ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Due in 48h</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {summary?.parentsMissingPhone ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Missing parent phone</span>
              </div>
            </div>
            <ul className="tch-briefing-lines">
              {(briefing.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {briefing.details?.assistantsBehind?.length > 0 && (
              <div className="tch-briefing-alert">
                <FiAlertCircle size={16} />
                <div>
                  <strong>Behind schedule</strong>
                  <p>
                    {briefing.details.assistantsBehind
                      .slice(0, 3)
                      .map(
                        (a) =>
                          `${a.assistantName} on “${a.assignmentTitle}”${
                            a.className ? ` (${a.className})` : ""
                          }`
                      )
                      .join(" · ")}
                    {briefing.details.assistantsBehind.length > 3
                      ? ` · +${briefing.details.assistantsBehind.length - 3} more`
                      : ""}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="tch-briefing-loading">
            Briefing unavailable right now. Try refresh.
          </div>
        )}
      </section>

      <div className="tch-stats-row">
        <div className="tch-stat-card" style={{ animationDelay: "0.05s" }}>
          <div className="tch-stat-icon tch-stat-icon--blue">
            <FiBookOpen />
          </div>
          <div>
            <div className="tch-stat-value">
              {loading ? "—" : courseCount}
            </div>
            <div className="tch-stat-label">Active courses</div>
          </div>
        </div>
        <div className="tch-stat-card" style={{ animationDelay: "0.1s" }}>
          <div className="tch-stat-icon tch-stat-icon--cyan">
            <FiPlusCircle />
          </div>
          <div>
            <div className="tch-stat-value">Create</div>
            <div className="tch-stat-label">New coursework anytime</div>
          </div>
        </div>
        <div className="tch-stat-card" style={{ animationDelay: "0.15s" }}>
          <div className="tch-stat-icon tch-stat-icon--green">
            <FiBarChart2 />
          </div>
          <div>
            <div className="tch-stat-value">Track</div>
            <div className="tch-stat-label">On-time & late submissions</div>
          </div>
        </div>
        <div className="tch-stat-card" style={{ animationDelay: "0.2s" }}>
          <div className="tch-stat-icon tch-stat-icon--violet">
            <FiEdit3 />
          </div>
          <div>
            <div className="tch-stat-value">Edit</div>
            <div className="tch-stat-label">Update assignments easily</div>
          </div>
        </div>
      </div>

      <div className="tch-actions-grid">
        <button
          type="button"
          className="tch-action-card"
          style={{ animationDelay: "0.15s" }}
          onClick={() => navigate("/teacher/ai-agent")}
        >
          <div className="tch-action-card-icon">
            <FiMessageCircle />
          </div>
          <h3>AI Agent</h3>
          <p>
            Ask about uncorrected work, delayed assignments, weak students,
            class comparisons, and weak topics.
          </p>
          <TeacherActionLink>Open AI Agent</TeacherActionLink>
        </button>

        <button
          type="button"
          className="tch-action-card"
          style={{ animationDelay: "0.18s" }}
          onClick={() => navigate("/teacher/reports")}
        >
          <div className="tch-action-card-icon">
            <FiClipboard />
          </div>
          <h3>Student reports</h3>
          <p>
            Select students across your classrooms and assignments, then send
            WhatsApp grade reports to parents.
          </p>
          <TeacherActionLink>Open reports</TeacherActionLink>
        </button>

        <button
          type="button"
          className="tch-action-card"
          style={{ animationDelay: "0.2s" }}
          onClick={() => navigate("/teacher/courses")}
        >
          <div className="tch-action-card-icon">
            <FiBookOpen />
          </div>
          <h3>Browse my courses</h3>
          <p>
            View all your Google Classroom courses, create new assignments, and review
            existing coursework.
          </p>
          <TeacherActionLink>Open courses</TeacherActionLink>
        </button>
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="tch-btn tch-btn--ghost"
          onClick={refreshAll}
          disabled={loading || briefingLoading}
        >
          <FiRefreshCw size={15} />
          Refresh
        </button>
      </div>
    </div>
  );
}
