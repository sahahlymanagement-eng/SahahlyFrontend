import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import { toast } from "react-toastify";
import "../pages/manager/ManagerFeedback.css";

const RECIPIENT_LABELS = {
  parent: "Parent",
  student: "Student",
  teacher: "Teacher",
};

const STATE_LABELS = {
  awaiting_rating: "Awaiting rating",
  awaiting_reason: "Awaiting reason",
  awaiting_comment: "Awaiting comment",
  awaiting_assignment_pick: "Picking assignment",
  done: "Complete",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stars(rating) {
  if (rating == null) return "—";
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

/**
 * @param {{ apiBase: string, scope: 'manager' | 'director' }} props
 */
export default function FeedbackView({ apiBase, scope }) {
  const navigate = useNavigate();
  const requiredRole = scope === "manager" ? "manager" : "admin";
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recipientType, setRecipientType] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(storedUser);
    if (parsed.roleId?.name?.toLowerCase() !== requiredRole) {
      navigate("/login");
      return;
    }
    setUser(parsed);
  }, [navigate, requiredRole]);

  useEffect(() => {
    if (!user?.id) return;
    loadData();
  }, [user, recipientType, lowOnly, page]);

  const params = () => {
    const p = { page, limit };
    if (scope === "manager") p.managerId = user.id;
    if (recipientType) p.recipientType = recipientType;
    if (lowOnly) p.lowOnly = "1";
    return p;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get(apiBase, { params: params() }),
        api.get(`${apiBase}/stats`, { params: params() }),
      ]);
      setSessions(listRes.data.sessions || []);
      setTotal(listRes.data.total || 0);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load report feedback");
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <main className="fb-main">
      <div className="fb-topbar">
        <h1>Report Feedback</h1>
        <p>
          Ratings and comments collected via WhatsApp after parent, student, and teacher
          grading reports are sent.
        </p>
      </div>

      {stats && (
        <div className="fb-summary">
          <div className="fb-summary-card">
            <h3>{stats.totalResponses}</h3>
            <span>Total responses</span>
          </div>
          <div className="fb-summary-card">
            <h3>{stats.parentResponses}</h3>
            <span>Parent responses</span>
          </div>
          <div className="fb-summary-card fb-summary-card--warn">
            <h3>{stats.lowRatings}</h3>
            <span>Low ratings (1–3)</span>
          </div>
          <div className="fb-summary-card">
            <h3>{stats.avgRating ?? "—"}</h3>
            <span>Average rating</span>
          </div>
        </div>
      )}

      <div className="fb-filters">
        <label>
          <span>Recipient</span>
          <select
            value={recipientType}
            onChange={(e) => {
              setRecipientType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="parent">Parents only</option>
            <option value="student">Students only</option>
            <option value="teacher">Teachers only</option>
          </select>
        </label>
        <label className="fb-check">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          Low ratings only (1–3)
        </label>
      </div>

      {loading && <div className="fb-loading">Loading…</div>}

      {!loading && !sessions.length && (
        <div className="fb-empty">
          No feedback recorded yet. Feedback is saved when recipients reply to the WhatsApp
          rating prompt after a report is sent.
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <>
          {/* Scrolls between 641px and desktop, where 9 columns still overflow;
              below 640px it becomes cards and the wrapper stops scrolling. */}
          <div className="sah-table-scroll">
          <table className="fb-table sah-table--cards">
            <thead>
              <tr>
                <th>Date</th>
                <th>Recipient</th>
                <th>Student</th>
                <th>Classroom</th>
                <th>Assignment</th>
                <th>Rating</th>
                <th>Reason</th>
                <th>Comment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s._id} className={s.rating != null && s.rating <= 3 ? "fb-row--low" : ""}>
                  <td data-label="Date">{formatDate(s.createdAt)}</td>
                  <td data-label="Recipient">
                    {RECIPIENT_LABELS[s.recipientType] || s.recipientType}
                  </td>
                  <td data-label="Student">
                    {s.reportStudentName || s.recipientName || "—"}
                  </td>
                  <td data-label="Classroom">{s.classroomName || "—"}</td>
                  <td data-label="Assignment">
                    {s.assignmentTitle ||
                      (s.reportAssignmentSnapshots?.length > 1
                        ? `${s.reportAssignmentSnapshots.length} assignments`
                        : "—")}
                  </td>
                  <td
                    className="fb-stars"
                    data-label="Rating"
                    title={s.rating != null ? `${s.rating}/5` : ""}
                  >
                    {stars(s.rating)}
                  </td>
                  <td data-label="Reason">{s.reasonLabel || "—"}</td>
                  <td className="fb-comment" data-label="Comment">{s.comment || "—"}</td>
                  <td data-label="Status">{STATE_LABELS[s.state] || s.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="fb-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} · {total} total
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
