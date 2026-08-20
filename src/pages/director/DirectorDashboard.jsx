import { useEffect, useMemo, useState, useCallback } from "react";
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
  FiCopy,
  FiDownload,
} from "react-icons/fi";
import { toast } from "react-toastify";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";

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

function sahahlyDueDate(value) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  return new Date(due.getTime() + 24 * 60 * 60 * 1000);
}

function statusLabel(status) {
  const map = {
    UNASSIGNED: "Late on manager",
    ASSIGNED: "In progress",
    IN_REVIEW: "In review",
    RECHECK_BY_ASSISTANT: "Recheck",
    IN_REVIEW_AFTER_RECHECK: "In review (recheck)",
    EMERGENCY: "Emergency",
    FAILED_DEADLINE: "Late on assistant",
    DONE: "Done",
    DONE_BY_QUALITY: "Done (quality)",
    DONE_BY_QUALITY_LATE: "Done (quality, late)",
  };
  return map[status] || status || "—";
}

const MANAGER_BUCKET_META = {
  unassigned: { label: "Late on manager", tone: "unassigned" },
  inProgress: { label: "In progress", tone: "progress" },
  failedDeadline: { label: "Late on assistant", tone: "late" },
  late: { label: "Late", tone: "late" },
};

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

function LateDueDates({ row }) {
  const sahahlyDue = sahahlyDueDate(row?.dueDate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="md-cell-muted">Classroom: {fmtDate(row?.dueDate)}</span>
      <span className="md-cell-muted">Sahahly: {fmtDate(sahahlyDue)}</span>
      <span className="md-cell-muted">
        Manager set: {fmtDate(row?.assistantDeadline)}
      </span>
    </div>
  );
}

// One clickable tile per dashboard bucket — mirrors ManagerDashboard's
// tch-stat-card/md-stat-filter tiles. "dueSoon" has no external-grading
// counterpart, so it maps to null below.
const TILE_ORDER = ["done", "inProgress", "unassigned", "late", "dueSoon"];

const TILE_META = {
  done: { label: "Done", icon: <FiCheckCircle />, iconClass: "tch-stat-icon--green" },
  inProgress: { label: "In progress", icon: <FiClock />, iconClass: "tch-stat-icon--blue" },
  unassigned: { label: "Late on manager", icon: <FiUsers />, iconClass: "tch-stat-icon--violet" },
  late: { label: "Late on assistant", icon: <FiAlertTriangle />, iconClass: "tch-stat-icon--orange" },
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
  const period = useDashboardPeriod();
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
  const bucketParams = useMemo(
    () => ({ bucket: selectedBucket, ...period.params }),
    [selectedBucket, period.params.from, period.params.to]
  );
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
        setLoading(true);
        const res = await api.get("/director/dashboard", {
          params: period.params,
        });
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
  }, [user, period.params.from, period.params.to]);

  const openManagerDetail = async (m) => {
    setDetailTarget({ type: "manager", name: m.name });
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api.get("/director/manager-workload/detail", {
        params: { personId: m.managerId, ...period.params },
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

      <DashboardPeriodFilter
        from={period.from}
        to={period.to}
        setFrom={period.setFrom}
        setTo={period.setTo}
        resetToThisMonth={period.resetToThisMonth}
        monthLabel={period.monthLabel}
      />

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
                            {selectedBucket === "late" ? (
                              <LateDueDates row={r} />
                            ) : (
                              <span className="md-cell-muted">{fmtDate(r.dueDate)}</span>
                            )}
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
              <p>Choose Done, In progress, Late on manager, Late on assistant, or Due in 7 days to view assignments.</p>
            </div>
          )}
        </>
      )}

      {/* ── Teachers at risk ─────────────────────────────────────────── */}
      {!loading && data?.teachersAtRisk?.length > 0 && (
      <section className="directorDashSection">
        <div className="directorDashSectionHeader">
          <div className="directorDashTitleWrap">
            <span className="directorDashDot" />
              <h2 className="directorDashTitle">Teachers at risk</h2>
            </div>
            <div className="directorDashCount">
              <FiAlertTriangle /> {data.teachersAtRisk.length} flagged
            </div>
          </div>
          <div className="ddx-table-wrap">
            <table className="ddx-table sah-table--cards">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Classrooms</th>
                  <th title="Marks or feedback changed on this teacher's marked papers">
                    Correction edits
                  </th>
                  <th title="Annotations dragged to a new place on this teacher's marked papers">
                    Mapping edits
                  </th>
                  <th>Late returns</th>
                  <th>Unreturned papers</th>
                </tr>
              </thead>
              <tbody>
                {data.teachersAtRisk.map((t) => (
                  <tr key={t.teacherId}>
                    <td data-label="Teacher">
                      <strong>{t.name}</strong>
                      {t.email ? <div className="ddx-muted">{t.email}</div> : null}
                    </td>
                    <td data-label="Classrooms">{t.classroomCount}</td>
                    <td data-label="Correction edits">{t.editCount}</td>
                    <td data-label="Mapping edits">{t.mappingEditCount ?? 0}</td>
                    <td data-label="Late returns">{t.lateReturns}</td>
                    <td data-label="Unreturned">{t.unsentReports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
                  <Chip tone="unassigned" label="Late on mgr" value={m.unassigned} />
                  <Chip tone="late" label="Late on asst" value={m.failedDeadline} />
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
                    onRowClick={goToDirectorSubmissionViewer}
                  />
                )}
                {!detailLoading && detailTarget.type === "assistant" && detail && (
                  <AssistantDetail
                    detail={detail.assistant}
                    onLateRowClick={goToDirectorSubmissionViewer}
                  />
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

function ManagerDetail({ detail, onRowClick }) {
  const { manager, stats, classrooms, late, unassigned, inProgress, failedDeadline, assistants } =
    detail;
  const [selectedBucket, setSelectedBucket] = useState("unassigned");
  const [alertingId, setAlertingId] = useState(null);

  const buckets = useMemo(
    () => ({
      unassigned: unassigned || [],
      inProgress: inProgress || [],
      failedDeadline: failedDeadline || [],
      late: (late || []).filter(isLateRow),
    }),
    [unassigned, inProgress, failedDeadline, late]
  );

  const activeRows = buckets[selectedBucket] || [];

  const buildListMessage = useCallback(() => {
    const label = MANAGER_BUCKET_META[selectedBucket]?.label || "Assignments";
    const header = [`${manager.name} — ${label}`, `Total: ${activeRows.length}`, ""];
    const body = activeRows.length
      ? activeRows.map((row, index) =>
          [
            `${index + 1}. ${row.title}`,
            `Class: ${row.className || "—"}`,
            `Status: ${statusLabel(row.status)}`,
            `Due: ${fmtDate(row.dueDate)}`,
            row.assistantName ? `Assistant: ${row.assistantName}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        )
      : ["No assignments in this bucket."];
    return [...header, ...body].join("\n\n");
  }, [activeRows, manager.name, selectedBucket]);

  const copyListMessage = async () => {
    try {
      await navigator.clipboard.writeText(buildListMessage());
      toast.success("Message copied for WhatsApp");
    } catch {
      toast.error("Failed to copy message");
    }
  };

  const exportListMessage = () => {
    try {
      const message = buildListMessage();
      const blob = new Blob([message], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${manager.name}-${selectedBucket}-message.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Message exported");
    } catch {
      toast.error("Failed to export message");
    }
  };

  const sendRowAlert = async (row) => {
    try {
      setAlertingId(row.assignmentId);
      if (selectedBucket === "unassigned") {
        await api.post("/director/manager-workload/send-alert", {
          personId: manager.personId,
          assignmentId: row.assignmentId,
        });
      } else if (row.delegationId) {
        await api.post(`/assignment-delegations/${row.delegationId}/send-alert`);
      } else {
        toast.error("No alert target for this row");
        return;
      }
      toast.success("Alert sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send alert");
    } finally {
      setAlertingId(null);
    }
  };

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
        <Chip tone="unassigned" label="Late on mgr" value={stats.unassigned} />
        <Chip tone="late" label="Late on asst" value={stats.failedDeadline} />
        <Chip tone="muted" label="Completion" value={`${stats.completionRate}%`} />
      </div>

      <h4 className="ddx-detail-heading">Classrooms ({classrooms.length})</h4>
      <div className="ddx-table-wrap">
        <table className="ddx-table">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Total</th>
              <th>Done</th>
              <th>In progress</th>
              <th>Late on mgr</th>
              <th>Late on asst</th>
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

      <div className="ddx-bucket-filters">
        {Object.entries(MANAGER_BUCKET_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={`ddx-bucket-filter ddx-bucket-filter--${meta.tone}${
              selectedBucket === key ? " ddx-bucket-filter--active" : ""
            }`}
            onClick={() => setSelectedBucket(key)}
          >
            {meta.label} ({buckets[key]?.length || 0})
          </button>
        ))}
      </div>

      <div className="ddx-export-actions">
        <button type="button" className="ddx-export-btn" onClick={copyListMessage}>
          <FiCopy /> Copy message
        </button>
        <button type="button" className="ddx-export-btn" onClick={exportListMessage}>
          <FiDownload /> Export message
        </button>
      </div>

      <DetailAssignmentList
        title={`${MANAGER_BUCKET_META[selectedBucket]?.label || "Assignments"} (${activeRows.length})`}
        rows={activeRows}
        onRowClick={onRowClick}
        onAlert={sendRowAlert}
        alertingId={alertingId}
        alertLabel={selectedBucket === "unassigned" ? "Alert manager" : "Alert assistant"}
      />
    </>
  );
}

function AssistantDetail({ detail, onLateRowClick }) {
  const {
    email,
    subjects,
    papersCorrected,
    tokenUsage,
    teachers,
    classrooms,
    summary,
    lateAssignments,
    editStats,
  } = detail;
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
          label="Total edits"
          value={(editStats?.totalEdits ?? 0) + (editStats?.totalMappingEdits ?? 0)}
        />
        <Chip tone="muted" label="Correction edits" value={editStats?.totalEdits ?? 0} />
        <Chip tone="muted" label="Mapping edits" value={editStats?.totalMappingEdits ?? 0} />
        <Chip
          tone="muted"
          label="AI requests"
          value={tokenUsage?.requestCount ?? 0}
        />
      </div>

      <DetailAssignmentList
        title={`Late assignments (${lateAssignments?.length || 0})`}
        rows={lateAssignments || []}
        onRowClick={onLateRowClick}
      />

      {(editStats?.byAssignment?.length > 0 || editStats?.papers?.length > 0) && (
        <>
          <h4 className="ddx-detail-heading">Edits by assignment</h4>
          <div className="ddx-table-wrap" style={{ marginBottom: 16 }}>
            <table className="ddx-table">
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Classroom</th>
                  <th>Papers</th>
                  <th>Correction edits</th>
                  <th>Mapping edits</th>
                </tr>
              </thead>
              <tbody>
                {(editStats.byAssignment || []).slice(0, 15).map((row) => (
                  <tr key={row.assignmentId}>
                    <td>{row.title}</td>
                    <td>{row.classroomName}</td>
                    <td>{row.papers}</td>
                    <td>{row.edits}</td>
                    <td>{row.mappingEdits ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="ddx-detail-heading">Edits by classroom</h4>
          <div className="ddx-chip-row" style={{ marginBottom: 16 }}>
            {(editStats.byClassroom || []).map((row) => (
              <span key={row.classroomId} className="ddx-chip ddx-chip--muted">
                {row.classroomName}: <strong>{row.edits}</strong> correction
                {" · "}
                <strong>{row.mappingEdits ?? 0}</strong> mapping
              </span>
            ))}
          </div>

          <h4 className="ddx-detail-heading">Edits per paper (top)</h4>
          <div className="ddx-table-wrap" style={{ marginBottom: 16 }}>
            <table className="ddx-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Assignment</th>
                  <th>Classroom</th>
                  <th>Correction edits</th>
                  <th>Mapping edits</th>
                </tr>
              </thead>
              <tbody>
                {(editStats.papers || []).slice(0, 10).map((row) => (
                  <tr key={row.submissionId}>
                    <td>{row.studentName}</td>
                    <td>{row.assignmentTitle}</td>
                    <td>{row.classroomName}</td>
                    <td>{row.edits}</td>
                    <td>{row.mappingEdits ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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

      <h4 className="ddx-detail-heading">Classrooms ({classrooms?.length || 0})</h4>
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
              <th>Correction edits</th>
              <th>Mapping edits</th>
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
                <td>{c.editCount ?? 0}</td>
                <td>{c.mappingEditCount ?? 0}</td>
              </tr>
            ))}
            {!classrooms?.length && (
              <tr>
                <td colSpan={9}>No classroom activity yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DetailAssignmentList({
  title,
  rows,
  onRowClick,
  onAlert,
  alertingId,
  alertLabel = "Alert",
}) {
  const clickable = typeof onRowClick === "function";
  const canAlert = typeof onAlert === "function";
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
              <span className="ddx-list-class">{r.className || r.classroomName || "—"}</span>
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
              {canAlert && (
                <button
                  type="button"
                  className="md-external-alertBtn ddx-list-alertBtn"
                  disabled={alertingId === r.assignmentId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlert(r);
                  }}
                >
                  {alertingId === r.assignmentId ? "Sending…" : alertLabel}
                </button>
              )}
    </div>
          </li>
        ))}
      </ul>
    </>
  );
}
