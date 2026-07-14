import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import "./QualityTeamDashboard.css";
import {
  FiShield,
  FiSearch,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiArrowLeftCircle,
  FiRefreshCw,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { FiLogOut } from "react-icons/fi";

function formatStatus(status = "") {
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatDateTime(date) {
  if (!date) return "Not Set";
  const d = new Date(date);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const time = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${day}/${month}/${year} ${time}`;
}

export default function QualityTeamDashboard() {
  const [personId, setPersonId] = useState("");
  const [user, setUser] = useState(null);

  const [delegations, setDelegations] = useState([]);
  const [selected, setSelected] = useState(null);

  const [checklistItems, setChecklistItems] = useState([]);
  const [selectedLevels, setSelectedLevels] = useState({});
  const [totalScore, setTotalScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);

  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [classroomTeacherMap, setClassroomTeacherMap] = useState({});
  const [classroomNameMap, setClassroomNameMap] = useState({});

  const [search, setSearch] = useState("");

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (storedUser) {
      setUser(storedUser);
      setPersonId(storedUser.id);
      initialLoad(storedUser.id);
    }
  }, []);

  const initialLoad = async (id) => {
    try {
      setLoading(true);
      await Promise.all([
        loadAssignments(id),
        loadChecklistItems(),
        loadClassrooms(),
      ]);
    } catch (err) {
      console.error(err);
      setMessage("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const loadClassrooms = async () => {
    const res = await api.get("/classrooms", { params: { page: 1, limit: 5000 } });

    const teacherMap = {};
    const nameMap = {};

    (res.data.data || []).forEach((c) => {
      nameMap[c._id] = c.name;
      teacherMap[c._id] = c.teacherId?.name || "Not Assigned";
    });

    setClassroomTeacherMap(teacherMap);
    setClassroomNameMap(nameMap);
  };

  const loadChecklistItems = async () => {
    const res = await api.get("/quality-checklist-items", {
      params: { activeOnly: true },
    });

    const items = res.data || [];
    setChecklistItems(items);

    const totalMax = items.reduce((sum, item) => sum + (item.fullScore || 0), 0);
    setMaxScore(totalMax);
  };

  const loadAssignments = async (id) => {
    const res = await api.get("/assignment-delegations", {
      params: {
        personId: id,
        role: "quality team",
      },
    });

    setDelegations(res.data || []);
  };

  const selectScore = (item, level) => {
    const updated = {
      ...selectedLevels,
      [item._id]: level,
    };

    setSelectedLevels(updated);

    let total = 0;

    checklistItems.forEach((i) => {
      const selectedLevel = updated[i._id];

      if (selectedLevel === "partial") total += (i.fullScore || 0) / 2;
      if (selectedLevel === "full") total += i.fullScore || 0;
    });

    setTotalScore(total);
  };

  useEffect(() => {
    if (selected) {
      setSelectedLevels({});
      setTotalScore(0);
      setComment("");
      setMessage("");
    }
  }, [selected]);

  const handleRefresh = async () => {
    if (!personId) return;
    await initialLoad(personId);
  };

  const markDone = async () => {
    try {
      setActionLoading(true);

      await api.post(
        `/assignment-workflow/quality-team/${selected.assignmentId._id}/done`,
        { personId }
      );

      setMessage("Marked as DONE");
      setSelected(null);
      await loadAssignments(personId);
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || "Failed to mark done");
    } finally {
      setActionLoading(false);
    }
  };

  const markDoneLate = async () => {
    try {
      setActionLoading(true);

      await api.post(
        `/assignment-workflow/quality-team/${selected.assignmentId._id}/done-late`,
        { personId }
      );

      setMessage("Marked as DONE_BY_QUALITY_LATE");
      setSelected(null);
      await loadAssignments(personId);
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || "Failed to mark done late");
    } finally {
      setActionLoading(false);
    }
  };

  const markDoneByQuality = async () => {
    try {
      setActionLoading(true);

      await api.post(
        `/assignment-workflow/quality-team/${selected.assignmentId._id}/done-by-quality`,
        { personId }
      );

      setMessage("Resolved by Quality Team");
      setSelected(null);
      await loadAssignments(personId);
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || "Failed to resolve by quality");
    } finally {
      setActionLoading(false);
    }
  };

  const sendBack = async () => {
    try {
      setActionLoading(true);

      const itemsPayload = checklistItems.map((item) => ({
        checklistItemId: item._id,
        selected: selectedLevels[item._id] || "zero",
      }));

      await api.post(
        `/assignment-workflow/quality-team/${selected.assignmentId._id}/recheck`,
        {
          personId,
          comment,
          items: itemsPayload,
        }
      );

      setMessage("Sent back to assistant");
      setSelected(null);
      await loadAssignments(personId);
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || "Failed to send back");
    } finally {
      setActionLoading(false);
    }
  };

  const visibleDelegations = useMemo(() => {
    return delegations
      .filter((d) =>
        ["IN_REVIEW", "IN_REVIEW_AFTER_RECHECK", "EMERGENCY"].includes(
          d.assignmentId?.status
        )
      )
      .filter((d) => {
        if (!search.trim()) return true;

        const classroomId = d.assignmentId?.classroomId;
        const text = [
          classroomNameMap[classroomId] || "",
          classroomTeacherMap[classroomId] || "",
          d.assignmentId?.title || "",
          d.assignmentId?.status || "",
          d.qualityDeadline ? formatDateTime(d.qualityDeadline) : "",
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(search.trim().toLowerCase());
      });
  }, [delegations, search, classroomNameMap, classroomTeacherMap]);

  const stats = useMemo(() => {
    const source = delegations.filter((d) =>
      ["IN_REVIEW", "IN_REVIEW_AFTER_RECHECK", "EMERGENCY"].includes(
        d.assignmentId?.status
      )
    );

    return {
      total: source.length,
      review: source.filter((d) => d.assignmentId?.status === "IN_REVIEW").length,
      recheck: source.filter(
        (d) => d.assignmentId?.status === "IN_REVIEW_AFTER_RECHECK"
      ).length,
      emergency: source.filter((d) => d.assignmentId?.status === "EMERGENCY").length,
    };
  }, [delegations]);

  return (
    <div className="qt-root">
      <div className="qt-main">
        <header className="qt-topbar">
          <div className="qt-topbar-left">
            <div className="qt-brand-row">
              <div className="qt-brand-icon">
                <FiShield size={18} />
              </div>
              <div>
                <h1 className="qt-title">Quality Team Dashboard</h1>
                <span className="qt-sub">
                  Review assignments, score checklist items, and send feedback
                </span>
              </div>
            </div>
          </div>

          <div className="qt-topbar-right">
          <button
            className="qt-refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            <FiRefreshCw size={15} />
            <span>{loading ? "Loading..." : "Refresh"}</span>
          </button>

          <button
            className="qt-logout-btn"
            onClick={handleLogout}
          >
            <FiLogOut size={15} />
            <span>Logout</span>
          </button>

        </div>
        </header>

        <div className="qt-stats">
          <div className="qt-stat-card" style={{ "--accent": "#2563eb" }}>
            <div className="qt-stat-icon"><FiShield /></div>
            <div className="qt-stat-content">
              <span className="qt-stat-label">Total Active</span>
              <strong className="qt-stat-value">{stats.total}</strong>
            </div>
          </div>

          <div className="qt-stat-card" style={{ "--accent": "#22c55e" }}>
            <div className="qt-stat-icon"><FiCheckCircle /></div>
            <div className="qt-stat-content">
              <span className="qt-stat-label">In Review</span>
              <strong className="qt-stat-value">{stats.review}</strong>
            </div>
          </div>

          <div className="qt-stat-card" style={{ "--accent": "#f59e0b" }}>
            <div className="qt-stat-icon"><FiAlertTriangle /></div>
            <div className="qt-stat-content">
              <span className="qt-stat-label">After Recheck</span>
              <strong className="qt-stat-value">{stats.recheck}</strong>
            </div>
          </div>

          <div className="qt-stat-card" style={{ "--accent": "#ef4444" }}>
            <div className="qt-stat-icon"><FiClock /></div>
            <div className="qt-stat-content">
              <span className="qt-stat-label">Emergency</span>
              <strong className="qt-stat-value">{stats.emergency}</strong>
            </div>
          </div>
        </div>

        <div className="qt-card qt-card-table">
          <div className="qt-card-head">
            <div>
              <h2 className="qt-card-title">Assignments Queue</h2>
              <p className="qt-card-subtitle">
                Open any assignment to review checklist and take action
              </p>
            </div>

            <div className="qt-search-wrap">
              <FiSearch className="qt-search-icon" size={14} />
              <input
                className="qt-search-input"
                placeholder="Search classroom, teacher, assignment..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="qt-table-wrap">
            {loading ? (
              <div className="qt-loading">Loading dashboard...</div>
            ) : visibleDelegations.length === 0 ? (
              <div className="qt-empty">No assignments available.</div>
            ) : (
              <table className="qt-table sah-table--cards">
                <thead>
                  <tr>
                    <th>Classroom</th>
                    <th>Teacher</th>
                    <th>Assignment</th>
                    <th>Status</th>
                    <th>Quality Deadline</th>
                    <th>Open</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleDelegations.map((d, index) => {
                    const classroomId = d.assignmentId?.classroomId;

                    return (
                      <tr
                        key={d._id}
                        className="qt-row"
                        style={{ animationDelay: `${index * 0.04}s` }}
                      >
                        <td data-label="Classroom">
                          <span className="qt-cell-primary">
                            {classroomNameMap[classroomId] || "Unknown"}
                          </span>
                        </td>

                        <td data-label="Teacher">
                          <span className="qt-cell-muted">
                            {classroomTeacherMap[classroomId] || "Not Assigned"}
                          </span>
                        </td>

                        <td data-label="Assignment">
                          <span className="qt-assignment-title">
                            {d.assignmentId?.title}
                          </span>
                        </td>

                        <td data-label="Status">
                          <span className={`qt-status ${d.assignmentId?.status}`}>
                            {formatStatus(d.assignmentId?.status)}
                          </span>
                        </td>

                        <td data-label="Quality Deadline">
                          <span className="qt-cell-muted">
                            {d.qualityDeadline
                              ? formatDateTime(d.qualityDeadline)
                              : "Not Set"}
                          </span>
                        </td>

                        <td data-label="Open">
                          <button
                            className="qt-open-btn"
                            onClick={() => setSelected(d)}
                          >
                            Open Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {selected && (
          <div className="qt-card qt-review-panel">
            <div className="qt-review-head">
              <div>
                <h3 className="qt-review-title">{selected.assignmentId?.title}</h3>
                <div className="qt-review-meta">
                  <span className={`qt-status ${selected.assignmentId?.status}`}>
                    {formatStatus(selected.assignmentId?.status)}
                  </span>
                  <span className="qt-review-deadline">
                    Deadline:{" "}
                    {selected.qualityDeadline
                      ? formatDateTime(selected.qualityDeadline)
                      : "Not Set"}
                  </span>
                </div>
              </div>

              <button className="qt-close-btn" onClick={() => setSelected(null)}>
                <FiArrowLeftCircle size={16} />
                <span>Close Review</span>
              </button>
            </div>

            {selected.assignmentId?.status !== "EMERGENCY" && (
              <>
                <div className="qt-checklist-wrap">
                  <table className="qt-checklist-table sah-table--cards">
                    <thead>
                      <tr>
                        <th>Checklist Item</th>
                        <th>Zero</th>
                        <th>Partial</th>
                        <th>Full</th>
                      </tr>
                    </thead>

                    <tbody>
                      {checklistItems.map((item) => (
                        <tr key={item._id}>
                          <td data-label="Checklist Item">
                            <div className="qt-item-title-wrap">
                              <span className="qt-item-title">{item.title}</span>
                              <span className="qt-item-score">
                                Max: {item.fullScore}
                              </span>
                            </div>
                          </td>

                          <td data-label="Zero">
                            <input
                              type="radio"
                              name={item._id}
                              checked={selectedLevels[item._id] === "zero"}
                              onChange={() => selectScore(item, "zero")}
                            />
                          </td>

                          <td data-label="Partial">
                            <input
                              type="radio"
                              name={item._id}
                              checked={selectedLevels[item._id] === "partial"}
                              onChange={() => selectScore(item, "partial")}
                            />
                          </td>

                          <td data-label="Full">
                            <input
                              type="radio"
                              name={item._id}
                              checked={selectedLevels[item._id] === "full"}
                              onChange={() => selectScore(item, "full")}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="qt-score-box">
                  <span>Total Score</span>
                  <strong>
                    {totalScore} / {maxScore}
                  </strong>
                </div>

                <textarea
                  className="qt-comment-box"
                  placeholder="Write feedback for the assistant..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </>
            )}

            <div className="qt-action-buttons">
              {selected.assignmentId?.status === "IN_REVIEW" && (
                <button
                  className="qt-btn qt-btn-success"
                  onClick={markDone}
                  disabled={actionLoading}
                >
                  Mark Done
                </button>
              )}

              {selected.assignmentId?.status === "IN_REVIEW_AFTER_RECHECK" && (
                <>
                  <button
                    className="qt-btn qt-btn-success"
                    onClick={markDone}
                    disabled={actionLoading}
                  >
                    Mark Done
                  </button>

                  <button
                    className="qt-btn qt-btn-warning"
                    onClick={markDoneByQuality}
                    disabled={actionLoading}
                  >
                    Resolve by Quality
                  </button>
                </>
              )}

              {selected.assignmentId?.status === "EMERGENCY" && (
                <button
                  className="qt-btn qt-btn-danger"
                  onClick={markDoneLate}
                  disabled={actionLoading}
                >
                  Done Late
                </button>
              )}

              {selected.assignmentId?.status !== "EMERGENCY" && (
                <button
                  className="qt-btn qt-btn-secondary"
                  onClick={sendBack}
                  disabled={actionLoading}
                >
                  Send Back
                </button>
              )}
            </div>
          </div>
        )}

        {message && <div className="qt-message-box">{message}</div>}
      </div>
    </div>
  );
}