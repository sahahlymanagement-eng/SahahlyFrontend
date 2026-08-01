import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
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

export default function DirectorDashboard() {
  const navigate = useNavigate();
  const [user] = useState(readStoredUser);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Person detail modal: { type: "manager"|"assistant", name }
  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  if (!user) return null;

  const summary = data?.assignments?.summary;

  return (
    <div className="directorDashboardPage">
      {/* ── Assignments overview ─────────────────────────────────────── */}
      <section className="directorDashSection">
        <div className="directorDashSectionHeader">
          <div className="directorDashTitleWrap">
            <span className="directorDashDot" />
            <h2 className="directorDashTitle">Assignments</h2>
          </div>
          {summary && (
            <div className="directorDashCount">
              <FiClipboard /> Total: {summary.total}
            </div>
          )}
        </div>

        {loading && <p className="ddx-loading">Loading dashboard…</p>}

        {!loading && summary && (
          <div className="directorDashStatsGrid">
            <StatCard
              icon={<FiCheckCircle />}
              tone="done"
              value={summary.done}
              label="Done"
            />
            <StatCard
              icon={<FiClock />}
              tone="progress"
              value={summary.inProgress}
              label="In progress"
            />
            <StatCard
              icon={<FiUsers />}
              tone="unassigned"
              value={summary.unassigned}
              label="Unassigned"
            />
            <StatCard
              icon={<FiAlertTriangle />}
              tone="late"
              value={summary.late}
              label="Late"
            />
          </div>
        )}
      </section>

      {/* ── Late / due soon lists ────────────────────────────────────── */}
      {!loading && data && (
        <section className="directorDashSection">
          <div className="ddx-lists-grid">
            <AssignmentList
              title="Late"
              icon={<FiAlertTriangle />}
              tone="late"
              rows={data.assignments.late}
              emptyText="Nothing is late. 🎉"
            />
            <AssignmentList
              title="Due in the next 7 days"
              icon={<FiCalendar />}
              tone="progress"
              rows={data.assignments.dueSoon}
              emptyText="Nothing due in the next 7 days."
            />
            <AssignmentList
              title="Recently done"
              icon={<FiCheckCircle />}
              tone="done"
              rows={data.assignments.recentlyDone}
              emptyText="No assignments marked done yet."
            />
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
      {detailTarget && (
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
                <ManagerDetail detail={detail} />
              )}
              {!detailLoading && detailTarget.type === "assistant" && detail && (
                <AssistantDetail detail={detail.assistant} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function StatCard({ icon, tone, value, label }) {
  return (
    <div className={`directorDashStatCard ddx-stat--${tone}`}>
      <div className="directorDashIconWrap">{icon}</div>
      <h3>{value}</h3>
      <p>{label}</p>
    </div>
  );
}

function Chip({ tone, label, value }) {
  return (
    <span className={`ddx-chip ddx-chip--${tone}`}>
      {label}: <strong>{value}</strong>
    </span>
  );
}

function AssignmentList({ title, icon, tone, rows, emptyText }) {
  return (
    <div className="ddx-list-card">
      <div className={`ddx-list-title ddx-list-title--${tone}`}>
        {icon}
        <span>{title}</span>
        <span className="ddx-list-count">{rows?.length || 0}</span>
      </div>
      {!rows?.length && <p className="ddx-list-empty">{emptyText}</p>}
      {rows?.length > 0 && (
        <ul className="ddx-list">
          {rows.map((r) => (
            <li key={r.assignmentId}>
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
      )}
    </div>
  );
}

function ManagerDetail({ detail }) {
  const { manager, stats, classrooms, late, unassigned, assistants } = detail;
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

      <DetailAssignmentList title={`Late (${late.length})`} rows={late} />
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

function DetailAssignmentList({ title, rows }) {
  if (!rows?.length) return null;
  return (
    <>
      <h4 className="ddx-detail-heading">{title}</h4>
      <ul className="ddx-list" style={{ marginBottom: 16 }}>
        {rows.map((r) => (
          <li key={r.assignmentId}>
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
