import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";
import "../teacher/teacher.css";
import "../manager/ManagerDashboard.css";
import "./DirectorDashboard.css";
import {
  FiUserCheck,
  FiUsers,
  FiClipboard,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
  FiCalendar,
  FiX,
  FiHome,
  FiMail,
  FiPhone,
  FiFileText,
} from "react-icons/fi";
import { toast } from "react-toastify";

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status) {
  const map = {
    UNASSIGNED: "Unassigned",
    ASSIGNED: "Assigned",
    IN_REVIEW: "In review",
    RECHECK_BY_ASSISTANT: "Recheck",
    IN_REVIEW_AFTER_RECHECK: "In review (recheck)",
    EMERGENCY: "Emergency",
    FAILED_DEADLINE: "Failed deadline",
    DONE: "Done",
    DONE_BY_QUALITY: "Done (quality)",
    DONE_BY_QUALITY_LATE: "Done (quality, late)",
  };
  return map[status] || status || "—";
}

function statusTone(status) {
  if (!status) return "muted";
  if (status.startsWith("DONE")) return "done";
  if (status === "FAILED_DEADLINE" || status === "EMERGENCY") return "late";
  if (status === "UNASSIGNED") return "unassigned";
  return "progress";
}

function isLateRow(row) {
  if (!row) return false;
  if (row.status === "FAILED_DEADLINE" || row.status === "EMERGENCY") return true;
  if (!row.dueDate) return false;
  const due = new Date(row.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < new Date();
}

// One clickable tile per dashboard bucket — mirrors ManagerDashboard's
// tch-stat-card/md-stat-filter tiles. "dueSoon" has no external-grading
// counterpart, so it maps to null below.
const TILE_ORDER = ["done", "inProgress", "unassigned", "late", "dueSoon"];

const TILE_META = {
  done: { label: "Done", icon: <FiCheckCircle />, iconClass: "tch-stat-icon--green" },
  inProgress: { label: "In progress", icon: <FiClock />, iconClass: "tch-stat-icon--blue" },
  unassigned: { label: "Unassigned", icon: <FiUsers />, iconClass: "tch-stat-icon--violet" },
  late: { label: "Late", icon: <FiAlertTriangle />, iconClass: "tch-stat-icon--orange" },
  dueSoon: { label: "Due in 7 days", icon: <FiCalendar />, iconClass: "tch-stat-icon--cyan" },
};

const EXTERNAL_BUCKET_FOR_TILE = {
  done: "done",
  inProgress: "inProgress",
  unassigned: "lateOnManager",
  late: "lateOnAssistant",
  dueSoon: null,
};

export default function DirectorDashboard() {
  const navigate = useNavigate();
  const [user] = useState(readStoredUser);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Person detail modal: { type: "manager"|"assistant", name }
  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingExternalAlertId, setSendingExternalAlertId] = useState(null);

  // Clicking a tile below picks which bucket's assignment list this fetches
  // (same usePagination/Pagination pair ManagerDashboard uses) — kept
  // separate from the main dashboard load so switching tiles doesn't
  // re-fetch managers/assistants/external-grading.
  const [selectedBucket, setSelectedBucket] = useState(null);
  const bucketParams = useMemo(() => ({ bucket: selectedBucket }), [selectedBucket]);
  const {
    data: bucketRows,
    page: bucketPage,
    totalPages: bucketTotalPages,
    loading: loadingBucket,
    fetchPage: fetchBucketPage,
  } = usePagination(
    "/director/dashboard/assignments",
    bucketParams,
    15,
    "rows",
    Boolean(selectedBucket)
  );

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!user || !token || user?.roleId?.name?.toLowerCase() !== "admin") {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/director/dashboard");
        if (!cancelled) setData(res.data);
      } catch (err) {
        console.error("Failed loading dashboard", err);
        if (!cancelled) {
          toast.error(err.response?.data?.message || "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const openManagerDetail = async (m) => {
    setDetailTarget({ type: "manager", name: m.name });
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get("/director/manager-workload/detail", {
        params: { personId: m.managerId },
      });
      setDetail(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load manager details");
      setDetailTarget(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openAssistantDetail = async (a) => {
    setDetailTarget({ type: "assistant", name: a.name });
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get("/director/assistant-performance/detail", {
        params: { personId: a.personId },
      });
      setDetail(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load assistant details");
      setDetailTarget(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailTarget(null);
    setDetail(null);
  };

  const sendExternalAlert = async (delegationId) => {
    try {
      setSendingExternalAlertId(delegationId);
      await api.post(`/grading-delegations/${delegationId}/send-alert`);
      toast.success("Alert sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send alert");
    } finally {
      setSendingExternalAlertId(null);
    }
  };

  const goToDirectorSubmissionViewer = (row) => {
    const classroomId = row?.classroomId;
    const assignmentId = row?.assignmentId;
    if (!classroomId || !assignmentId) return;
    navigate(
      `/director/submissions?classroomId=${classroomId}&assignmentId=${assignmentId}`
    );
  };

  if (!user) return null;

  const summary = data?.assignments?.summary;
  const dueSoonTotal = data?.assignments?.dueSoonTotal ?? 0;
  const externalSummary = data?.externalGrading?.summary || {
    lateOnManager: 0,
    inProgress: 0,
    lateOnAssistant: 0,
    done: 0,
    total: 0,
  };
  const externalRows = data?.externalGrading?.rows || [];
  // "Unassigned" absorbs external lateOnManager (a manager hasn't finished
  // delegating/managing that partner assignment); "Late" absorbs external
  // lateOnAssistant (an assistant missed their deadline); "Done"/"In
  // progress" absorb their like-named external buckets — same pairing used
  // on the manager dashboard. "Due soon" has no external equivalent.
  const tileCounts = summary && {
    done: summary.done + externalSummary.done,
    inProgress: summary.inProgress + externalSummary.inProgress,
    unassigned: summary.unassigned + externalSummary.lateOnManager,
    late: summary.late + externalSummary.lateOnAssistant,
    dueSoon: dueSoonTotal,
  };
  const totalAssignments = summary
    ? summary.total + externalSummary.total
    : 0;

  const selectedExternalBucket = selectedBucket && EXTERNAL_BUCKET_FOR_TILE[selectedBucket];
  const selectedExternalRows = selectedExternalBucket
    ? externalRows.filter((r) => r.bucket === selectedExternalBucket)
    : [];

  return (
    <div className="tch-page md-dashboard-page directorDashboardPage">
      <section className="tch-hero">
        <p className="tch-hero-greeting">
          Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
        </p>
        <h1>
          Assignments, <span>org-wide</span>
        </h1>
        <p>
          Track assignment status, manager workload, and assistant
          performance across every classroom — all from one place.
        </p>
      </section>

      {loading && <p className="ddx-loading">Loading dashboard…</p>}

      {!loading && tileCounts && (
        <>
          <div className="directorDashCount" style={{ marginBottom: 18, width: "fit-content" }}>
            <FiClipboard /> Total: {totalAssignments}
          </div>

          <div className="tch-stats-row">
            {TILE_ORDER.map((key, i) => {
              const meta = TILE_META[key];
              const isActive = selectedBucket === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`tch-stat-card md-stat-filter ${isActive ? "md-stat-filter--active" : ""}`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                  onClick={() => setSelectedBucket(isActive ? null : key)}
                >
                  <div className={`tch-stat-icon ${meta.iconClass}`}>{meta.icon}</div>
                  <div>
                    <div className="tch-stat-value">{tileCounts[key]}</div>
                    <div className="tch-stat-label">{meta.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedBucket && (
            <div className="md-section">
              <div className="md-section-header">
                <div className="md-section-title-wrap">
                  <span className="directorDashDot" />
                  <h2 className="md-section-title">{TILE_META[selectedBucket].label}</h2>
                  <span className="md-section-count">{tileCounts[selectedBucket]}</span>
                </div>
              </div>

              <div className="md-table-wrap">
                {loadingBucket ? (
                  <div className="md-loading">
                    <div className="md-spinner" />
                    <span>Loading…</span>
                  </div>
                ) : (
                  <table className="md-table sah-table--cards">
                    <thead>
                      <tr>
                        <th>Classroom</th>
                        <th>Teacher</th>
                        <th>Manager</th>
                        <th>Assignment</th>
                        <th>Status</th>
                        <th>Due date</th>
                        <th>Assistant</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucketRows.map((r) => (
                        <tr key={r.assignmentId} className="md-row">
                          <td data-label="Classroom">
                            <span className="md-cell-primary">{r.className || "—"}</span>
                          </td>
                          <td data-label="Teacher">
                            <span className="md-cell-muted">{r.teacherName}</span>
                          </td>
                          <td data-label="Manager">
                            <span className="md-cell-muted">{r.managerName}</span>
                          </td>
                          <td data-label="Assignment">
                            <span
                              className="md-cell-title md-cell-title--clickable"
                              onClick={() => goToDirectorSubmissionViewer(r)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  goToDirectorSubmissionViewer(r);
                                }
                              }}
                            >
                              {r.title}
                            </span>
                          </td>
                          <td data-label="Status">
                            <span className={`ddx-status ddx-status--${statusTone(r.status)}`}>
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td data-label="Due date">
                            <span className="md-cell-muted">{fmtDate(r.dueDate)}</span>
                          </td>
                          <td data-label="Assistant">
                            <span className="md-cell-muted">{r.assistantName || "—"}</span>
                          </td>
                          <td data-label="Action">
                            <button
                              type="button"
                              className="md-external-alertBtn"
                              onClick={() => goToDirectorSubmissionViewer(r)}
                            >
                              Open viewer
                            </button>
                          </td>
                        </tr>
                      ))}
                      {selectedExternalRows.map((r) => (
                        <tr key={r._id} className="md-row">
                          <td data-label="Classroom">
                            <span className="md-cell-primary">{r.provider}</span>
                          </td>
                          <td data-label="Teacher">
                            <span className="md-cell-muted" style={{ textTransform: "capitalize" }}>
                              {r.role}
                            </span>
                          </td>
                          <td data-label="Manager">—</td>
                          <td data-label="Assignment">
                            <span className="md-cell-title">{r.assignmentName}</span>
                          </td>
                          <td data-label="Status">—</td>
                          <td data-label="Due date">
                            <span className="md-cell-muted">{fmtDate(r.deadline)}</span>
                          </td>
                          <td data-label="Assistant">
                            <span className="md-cell-muted">{r.personName}</span>
                          </td>
                          <td data-label="Action">
                            <button
                              type="button"
                              className="md-external-alertBtn"
                              disabled={sendingExternalAlertId === r._id}
                              onClick={() => sendExternalAlert(r._id)}
                            >
                              {sendingExternalAlertId === r._id
                                ? "Alerting…"
                                : r.role === "manager"
                                ? "Alert Manager"
                                : "Alert Assistant"}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!bucketRows.length && !selectedExternalRows.length && (
                        <tr>
                          <td colSpan={8} className="md-cell-empty">
                            Nothing here. 🎉
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
                <Pagination page={bucketPage} totalPages={bucketTotalPages} onPageChange={fetchBucketPage} />
              </div>
            </div>
          )}

          {!selectedBucket && (
            <div className="tch-empty md-dashboard-hint">
              <div className="tch-empty-icon">
                <FiClipboard size={28} />
              </div>
              <h3>Select a tile above</h3>
              <p>Choose Done, In progress, Unassigned, Late, or Due in 7 days to view assignments.</p>
            </div>
          )}
        </>
      )}

      {/* ── Managers ─────────────────────────────────────────────────── */}
      {!loading && data && (
        <section className="directorDashSection">
          <div className="directorDashSectionHeader">
            <div className="directorDashTitleWrap">
              <span className="directorDashDot" />
              <h2 className="directorDashTitle">Managers</h2>
            </div>
            <div className="directorDashCount">
              <FiUserCheck /> {data.managers.length} manager
              {data.managers.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="ddx-people-grid">
            {data.managers.map((m) => (
              <button
                type="button"
                key={m.managerId}
                className="ddx-person-card"
                onClick={() => openManagerDetail(m)}
                title="Click for full details"
              >
                <div className="ddx-person-top">
                  <div className="ddx-person-avatar">
                    <FiUserCheck />
                  </div>
                  <div className="ddx-person-id">
                    <h3>{m.name}</h3>
                    <p>{m.email || "—"}</p>
                  </div>
                  <span className="ddx-person-open">Details →</span>
                </div>
                <div className="ddx-person-meta">
                  <span>
                    <FiHome /> {m.classroomCount} classroom
                    {m.classroomCount === 1 ? "" : "s"}
                  </span>
                  <span>
                    <FiClipboard /> {m.totalAssignments} assignment
                    {m.totalAssignments === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="ddx-chip-row">
                  <Chip tone="done" label="Done" value={m.done} />
                  <Chip tone="progress" label="In progress" value={m.assigned} />
                  <Chip tone="unassigned" label="Unassigned" value={m.unassigned} />
                  <Chip tone="late" label="Late" value={m.failedDeadline} />
                </div>
                <div className="ddx-progress-track">
                  <div
                    className="ddx-progress-fill"
                    style={{ width: `${Math.min(m.completionRate || 0, 100)}%` }}
                  />
                </div>
                <div className="ddx-progress-caption">
                  {m.completionRate || 0}% complete
                  {m.overdueUnassigned > 0 && (
                    <span className="ddx-warn-inline">
                      · {m.overdueUnassigned} overdue &amp; unassigned
                    </span>
                  )}
                </div>
              </button>
            ))}
            {!data.managers.length && (
              <p className="ddx-loading">No managers found.</p>
            )}
          </div>
        </section>
      )}

      {/* ── Assistants ───────────────────────────────────────────────── */}
      {!loading && data && (
        <section className="directorDashSection">
          <div className="directorDashSectionHeader">
            <div className="directorDashTitleWrap">
              <span className="directorDashDot" />
              <h2 className="directorDashTitle">Assistants</h2>
            </div>
            <div className="directorDashCount">
              <FiUsers /> {data.assistants.length} assistant
              {data.assistants.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="ddx-people-grid">
            {data.assistants.map((a) => (
              <button
                type="button"
                key={a.personId}
                className="ddx-person-card"
                onClick={() => openAssistantDetail(a)}
                title="Click for full details"
              >
                <div className="ddx-person-top">
                  <div className="ddx-person-avatar ddx-person-avatar--assistant">
                    <FiUsers />
                  </div>
                  <div className="ddx-person-id">
                    <h3>{a.name}</h3>
                    <p>{a.email || "—"}</p>
                  </div>
                  <span className="ddx-person-open">Details →</span>
                </div>
                {a.subjects?.length > 0 && (
                  <div className="ddx-person-meta">
                    <span>
                      <FiFileText /> {a.subjects.map((s) => s.name || s).join(", ")}
                    </span>
                  </div>
                )}
                <div className="ddx-chip-row">
                  <Chip
                    tone="done"
                    label="On time"
                    value={a.summary?.onTime ?? 0}
                  />
                  <Chip
                    tone="late"
                    label="Missed"
                    value={a.summary?.missedDeadline ?? 0}
                  />
                  <Chip
                    tone="progress"
                    label="Pending"
                    value={a.summary?.pending ?? 0}
                  />
                  <Chip
                    tone="unassigned"
                    label="Papers"
                    value={a.papersCorrected ?? 0}
                  />
                </div>
              </button>
            ))}
            {!data.assistants.length && (
              <p className="ddx-loading">No assistants found.</p>
            )}
          </div>
        </section>
      )}

      {/* ── Person detail modal ──────────────────────────────────────── */}
      {/* Portaled to <body>: the hero/tile entrance animations above give
          .tch-page (and other ancestors) a `transform`, which makes them a
          containing block for `position: fixed` descendants — without the
          portal this modal would be positioned relative to that box instead
          of the viewport, and could open off-screen from the user's scroll. */}
      {detailTarget &&
        createPortal(
          <div className="ddx-modal-overlay" onClick={closeDetail}>
            <div className="ddx-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ddx-modal-header">
                <h3>
                  {detailTarget.type === "manager" ? "Manager" : "Assistant"} ·{" "}
                  {detailTarget.name}
                </h3>
                <button type="button" className="ddx-modal-close" onClick={closeDetail}>
                  <FiX />
                </button>
              </div>

              <div className="ddx-modal-body">
                {detailLoading && <p className="ddx-loading">Loading details…</p>}

                {!detailLoading && detailTarget.type === "manager" && detail && (
                  <ManagerDetail
                    detail={detail}
                    onLateRowClick={goToDirectorSubmissionViewer}
                  />
                )}
                {!detailLoading && detailTarget.type === "assistant" && detail && (
                  <AssistantDetail detail={detail.assistant} />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function Chip({ tone, label, value }) {
  return (
    <span className={`ddx-chip ddx-chip--${tone}`}>
      {label}: <strong>{value}</strong>
    </span>
  );
}

function ManagerDetail({ detail, onLateRowClick }) {
  const { manager, stats, classrooms, late, unassigned, assistants } = detail;
  const lateFiltered = (late || []).filter(isLateRow);
  return (
    <>
      <div className="ddx-detail-contact">
        {manager.email && (
          <span>
            <FiMail /> {manager.email}
          </span>
        )}
        {manager.phone && (
          <span>
            <FiPhone /> {manager.phone}
          </span>
        )}
      </div>

      <div className="ddx-chip-row" style={{ marginBottom: 16 }}>
        <Chip tone="done" label="Done" value={stats.done} />
        <Chip tone="progress" label="In progress" value={stats.assigned} />
        <Chip tone="unassigned" label="Unassigned" value={stats.unassigned} />
        <Chip tone="late" label="Failed deadline" value={stats.failedDeadline} />
        <Chip tone="muted" label="Completion" value={`${stats.completionRate}%`} />
      </div>

      <h4 className="ddx-detail-heading">
        Classrooms ({classrooms.length})
      </h4>
      <div className="ddx-table-wrap">
        <table className="ddx-table">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Total</th>
              <th>Done</th>
              <th>In progress</th>
              <th>Unassigned</th>
              <th>Late</th>
            </tr>
          </thead>
          <tbody>
            {classrooms.map((c) => (
              <tr key={c.classroomId}>
                <td>
                  {c.name}
                  {c.section ? ` · ${c.section}` : ""}
                </td>
                <td>{c.teacher?.name || "—"}</td>
                <td>{c.totalAssignments}</td>
                <td>{c.done}</td>
                <td>{c.assigned}</td>
                <td>{c.unassigned}</td>
                <td>{c.failedDeadline}</td>
              </tr>
            ))}
            {!classrooms.length && (
              <tr>
                <td colSpan={7}>No classrooms assigned.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h4 className="ddx-detail-heading">Assistants on their assignments</h4>
      <div className="ddx-chip-row" style={{ marginBottom: 16 }}>
        {assistants.map((a) => (
          <span key={a.personId} className="ddx-chip ddx-chip--muted">
            {a.name}: <strong>{a.total}</strong>
            {a.behind > 0 && (
              <em className="ddx-warn-inline"> ({a.behind} behind)</em>
            )}
          </span>
        ))}
        {!assistants.length && (
          <span className="ddx-list-empty">No assistant delegations yet.</span>
        )}
      </div>

      <DetailAssignmentList
        title={`Late (${lateFiltered.length})`}
        rows={lateFiltered}
        onRowClick={onLateRowClick}
      />
      <DetailAssignmentList
        title={`Unassigned (${unassigned.length})`}
        rows={unassigned}
      />
    </>
  );
}

function AssistantDetail({ detail }) {
  const { email, subjects, papersCorrected, tokenUsage, teachers, classrooms, summary } =
    detail;
  return (
    <>
      <div className="ddx-detail-contact">
        {email && (
          <span>
            <FiMail /> {email}
          </span>
        )}
        {subjects?.length > 0 && (
          <span>
            <FiFileText /> {subjects.map((s) => s.name || s).join(", ")}
          </span>
        )}
      </div>

      <div className="ddx-chip-row" style={{ marginBottom: 16 }}>
        <Chip tone="done" label="On time" value={summary?.onTime ?? 0} />
        <Chip tone="late" label="Missed" value={summary?.missedDeadline ?? 0} />
        <Chip tone="progress" label="Pending" value={summary?.pending ?? 0} />
        <Chip tone="unassigned" label="Papers corrected" value={papersCorrected ?? 0} />
        <Chip
          tone="muted"
          label="AI requests"
          value={tokenUsage?.requestCount ?? 0}
        />
      </div>

      <h4 className="ddx-detail-heading">
        Teachers they work with ({teachers?.length || 0})
      </h4>
      <div className="ddx-chip-row" style={{ marginBottom: 16 }}>
        {(teachers || []).map((t) => (
          <span key={t.id} className="ddx-chip ddx-chip--muted">
            {t.name}
          </span>
        ))}
        {!teachers?.length && (
          <span className="ddx-list-empty">No linked teachers yet.</span>
        )}
      </div>

      <h4 className="ddx-detail-heading">
        Classrooms ({classrooms?.length || 0})
      </h4>
      <div className="ddx-table-wrap">
        <table className="ddx-table">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Assignments</th>
              <th>On time</th>
              <th>Missed</th>
              <th>Pending</th>
              <th>Papers</th>
            </tr>
          </thead>
          <tbody>
            {(classrooms || []).map((c) => (
              <tr key={c.classroomId}>
                <td>
                  {c.classroomName}
                  {c.section ? ` · ${c.section}` : ""}
                </td>
                <td>{c.teacherName || "—"}</td>
                <td>{c.totalAssignments}</td>
                <td>{c.onTime}</td>
                <td>{c.missedDeadline}</td>
                <td>{c.pending}</td>
                <td>{c.papersCorrected}</td>
              </tr>
            ))}
            {!classrooms?.length && (
              <tr>
                <td colSpan={7}>No classroom activity yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DetailAssignmentList({ title, rows, onRowClick }) {
  const clickable = typeof onRowClick === "function";
  if (!rows?.length) return null;
  return (
    <>
      <h4 className="ddx-detail-heading">{title}</h4>
      <ul className="ddx-list" style={{ marginBottom: 16 }}>
        {rows.map((r) => (
          <li
            key={r.assignmentId}
            className={clickable ? "ddx-list-item--clickable" : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onRowClick(r) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(r);
                    }
                  }
                : undefined
            }
          >
            <div className="ddx-list-main">
              <span className="ddx-list-assignment">{r.title}</span>
              <span className="ddx-list-class">{r.className || "—"}</span>
            </div>
            <div className="ddx-list-side">
              <span className={`ddx-status ddx-status--${statusTone(r.status)}`}>
                {statusLabel(r.status)}
              </span>
              <span className="ddx-list-due">
                <FiCalendar /> {fmtDate(r.dueDate)}
              </span>
              {r.assistantName && (
                <span className="ddx-list-assistant">
                  <FiUsers /> {r.assistantName}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
