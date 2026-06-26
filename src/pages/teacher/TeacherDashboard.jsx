import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import {
  FiBookOpen,
  FiPlusCircle,
  FiRefreshCw,
  FiEdit3,
  FiBarChart2,
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
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
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
  };

  useEffect(() => {
    loadStats();
  }, [user?.id]);

  return (
    <div className="tch-page">
      <section className="tch-hero">
        <p className="tch-hero-greeting">{getGreeting()}</p>
        <h1>
          Welcome back, <span>{user.name?.split(" ")[0] || "Teacher"}</span>
        </h1>
        <p>
          Create assignments, track student submissions, and manage your Google Classroom
          courses — all from one place.
        </p>
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
          style={{ animationDelay: "0.1s" }}
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
          onClick={loadStats}
          disabled={loading}
        >
          <FiRefreshCw size={15} />
          Refresh
        </button>
      </div>
    </div>
  );
}
