import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FiUsers,
  FiUser,
  FiBookOpen,
  FiFileText,
  FiEdit3,
  FiMove,
  FiSend,
  FiClock,
  FiAlertTriangle,
  FiSearch,
  FiRefreshCw,
  FiCalendar,
  FiX,
  FiUserCheck,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";
import HealthBar from "../../components/HealthBar";
import "./DirectorManagerAnalytics.css";

const PERIODS = [
  { key: "week", label: "Weekly", hint: "Last 7 days" },
  { key: "month", label: "Monthly", hint: "Last 30 days" },
  { key: "all", label: "All time", hint: "No date limit" },
];

const EDIT_TABS = [
  { key: "assignments", label: "By assignment" },
  { key: "classrooms", label: "By class" },
  { key: "teachers", label: "By teacher" },
];

const REPORT_STATUS_LABEL = { sent: "Sent", late: "Late", unsent: "Unsent", pending: "Pending" };

const PAGE_SIZE = 20;

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

/**
 * Every edit of either kind. Correction and mapping edits are separate axes
 * (a question can be re-graded AND moved), so this is a workload headline, not
 * a total the two columns divide up.
 */
function allEdits(row) {
  return (Number(row?.totalEdits) || 0) + (Number(row?.placementChanges) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toApiDate(date) {
  if (!date) return undefined;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function SummaryPill({ icon, label, value, sub, tone }) {
  return (
    <div className={`dma-summary-pill${tone ? ` dma-summary-pill--${tone}` : ""}`}>
      <span className="dma-summary-icon">{icon}</span>
      <div>
        <p className="dma-summary-label">{label}</p>
        <p className="dma-summary-value">{value}</p>
        {sub ? <p className="dma-summary-sub">{sub}</p> : null}
      </div>
    </div>
  );
}

/** A stat number that toggles a filtered table below it — the "every number
 * clickable" requirement, applied to the report counters. */
function StatFilterTile({ icon, label, value, active, tone, onClick }) {
  return (
    <button
      type="button"
      className={`dma-stat-filter${active ? " dma-stat-filter--active" : ""}${tone ? ` dma-stat-filter--${tone}` : ""}`}
      onClick={onClick}
    >
      <span className="dma-summary-icon">{icon}</span>
      <div>
        <p className="dma-summary-label">{label}</p>
        <p className="dma-summary-value">{value}</p>
      </div>
    </button>
  );
}

function StatusBadge({ status }) {
  return <span className={`dma-badge dma-badge--${status}`}>{REPORT_STATUS_LABEL[status] || status}</span>;
}

/** Students/classes assigned + edited PDFs this month. Renders a filled bar
 * only once a ceiling is configured — until then it's counts-only. */
function CapacityRow({ label, usage, ceiling }) {
  const pct = ceiling ? Math.min(100, Math.round((usage / ceiling) * 100)) : null;
  return (
    <div className="dma-capacity-row">
      <div className="dma-capacity-row-head">
        <span>{label}</span>
        <strong>
          {formatNum(usage)}
          {ceiling ? ` / ${formatNum(ceiling)}` : ""}
        </strong>
      </div>
      {ceiling ? (
        <div className="health-bar-track">
          <div
            className={`health-bar-fill${pct >= 100 ? " health-bar-fill--critical" : pct >= 85 ? " health-bar-fill--warning" : " health-bar-fill--good"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function CapacityBlock({ capacity }) {
  if (!capacity) return <p className="dma-loading">No capacity data.</p>;
  return (
    <div className="dma-capacity-block">
      <CapacityRow label="Students assigned" usage={capacity.studentsAssigned} ceiling={capacity.studentsCeiling} />
      <CapacityRow label="Edited PDFs this month" usage={capacity.editedPdfsThisMonth} ceiling={capacity.editedPdfsCeiling} />
      <div className="dma-capacity-row-head">
        <span>Classes assigned</span>
        <strong>{formatNum(capacity.classesAssigned)}</strong>
      </div>
      {capacity.status == null ? (
        <p className="dma-muted">Capacity ceiling not configured for managers yet — showing counts only.</p>
      ) : null}
    </div>
  );
}

export default function DirectorManagerAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/director-managers/overview", {
        params: { period, from: toApiDate(from), to: toApiDate(to) },
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load manager analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, period, from, to]);

  const rows = useMemo(() => {
    const all = data?.managers || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => [r.name, r.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)));
  }, [data, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const overall = data?.overall;

  const customRange = Boolean(from || to);
  const selectPeriod = (key) => {
    setPeriod(key);
    setFrom(null);
    setTo(null);
  };

  const openDetail = async (managerId, name) => {
    try {
      setDetailLoading(true);
      setDetail({ name, loading: true });
      const res = await api.get(`/director-managers/manager/${managerId}`, {
        params: { period, from: toApiDate(from), to: toApiDate(to) },
      });
      setDetail({ name, ...res.data });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load manager detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="dma-page">
      <div className="dma-header">
        <div className="dma-header-left">
          <div className="dma-header-icon">
            <FiUsers />
          </div>
          <div>
            <h2>Manager analytics</h2>
            <p>Edit load per assignment/class/teacher, and report-send reliability, per manager</p>
          </div>
        </div>
        <button type="button" className="dma-refresh-btn" onClick={loadData} disabled={loading}>
          <FiRefreshCw />
          Refresh
        </button>
      </div>

      <div className="dma-filters">
        <div className="dma-period-group" role="group" aria-label="Time period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.hint}
              className={`dma-period${!customRange && period === p.key ? " dma-period--active" : ""}`}
              onClick={() => selectPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="dma-filter-wrap">
          <FiCalendar className="dma-filter-icon" size={13} />
          <DatePicker
            selected={from}
            onChange={setFrom}
            dateFormat="yyyy-MM-dd"
            className="dma-datepicker-input"
            placeholderText="From"
            isClearable
            portalId="root"
          />
        </div>
        <div className="dma-filter-wrap">
          <FiCalendar className="dma-filter-icon" size={13} />
          <DatePicker
            selected={to}
            onChange={setTo}
            dateFormat="yyyy-MM-dd"
            className="dma-datepicker-input"
            placeholderText="To"
            isClearable
            minDate={from || undefined}
            portalId="root"
          />
        </div>
        {customRange && (
          <button type="button" className="dma-clear-btn" onClick={() => { setFrom(null); setTo(null); }}>
            <FiX /> Clear dates
          </button>
        )}
      </div>

      <div className="dma-summary-row">
        <SummaryPill icon={<FiUsers />} label="Managers" value={formatNum(overall?.managerCount)} />
        <SummaryPill icon={<FiBookOpen />} label="Classrooms" value={formatNum(overall?.classroomCount)} />
        <SummaryPill icon={<FiUser />} label="Teachers managed" value={formatNum(overall?.teacherCount)} />
        <SummaryPill icon={<FiFileText />} label="Assignments" value={formatNum(overall?.assignmentCount)} />
        <SummaryPill icon={<FiEdit3 />} label="Total edits" value={formatNum(allEdits(overall))} />
        <SummaryPill icon={<FiEdit3 />} label="Correction edits" value={formatNum(overall?.totalEdits)} />
        <SummaryPill icon={<FiMove />} label="Mapping edits" value={formatNum(overall?.placementChanges)} />
        <SummaryPill icon={<FiSend />} label="Reports sent" value={formatNum(overall?.reportsSent)} tone="good" />
        <SummaryPill icon={<FiClock />} label="Reports late" value={formatNum(overall?.reportsLate)} tone="warn" />
        <SummaryPill icon={<FiAlertTriangle />} label="Reports unsent" value={formatNum(overall?.reportsUnsent)} tone="warn" />
      </div>

      <div className="dma-search">
        <FiSearch />
        <input placeholder="Search managers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <p className="dma-loading">Loading manager analytics…</p>}

      {!loading && !rows.length && (
        <p className="dma-loading">{search ? `Nothing matches "${search}".` : "No managers with data in this range."}</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="dma-table-card">
            <div className="dma-table-wrap">
              <table className="dma-table sah-table--cards">
                <thead>
                  <tr>
                    <th>Manager</th>
                    <th>Classes</th>
                    <th>Teachers</th>
                    <th>Assignments</th>
                    <th title="Edits this manager made themselves: a question's mark or feedback changed. Their assistants' corrections are not counted here.">
                      Correction Edits
                    </th>
                    <th title="Edits this manager made themselves: an annotated question dragged to a new place and confirmed.">
                      Mapping Edits
                    </th>
                    <th>Sent</th>
                    <th>Late</th>
                    <th>Unsent</th>
                    <th title="Average of edit quality and report reliability">Health</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.managerId}>
                      <td data-label="Manager">
                        <strong>{row.name}</strong>
                        <span className="dma-muted dma-block">{row.email || "—"}</span>
                      </td>
                      <td data-label="Classes">{formatNum(row.classroomCount)}</td>
                      <td data-label="Teachers">{formatNum(row.teacherCount)}</td>
                      <td data-label="Assignments">{formatNum(row.assignmentCount)}</td>
                      <td data-label="Correction Edits">{formatNum(row.totalEdits)}</td>
                      <td data-label="Mapping Edits">{formatNum(row.placementChanges)}</td>
                      <td data-label="Sent" className="dma-good">{formatNum(row.reportsSent)}</td>
                      <td data-label="Late" className={row.reportsLate > 0 ? "dma-warn" : undefined}>
                        {formatNum(row.reportsLate)}
                      </td>
                      <td data-label="Unsent" className={row.reportsUnsent > 0 ? "dma-warn" : undefined}>
                        {formatNum(row.reportsUnsent)}
                      </td>
                      <td data-label="Health">
                        <HealthBar score={row.healthScore} band={row.healthBand} />
                      </td>
                      <td>
                        <button type="button" className="dma-detail-btn" onClick={() => openDetail(row.managerId, row.name)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
        </>
      )}

      {detail && (
        <ManagerDetailModal
          detail={detail}
          loading={detailLoading}
          from={from}
          to={to}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ── manager drill-down ───────────────────────────────────────────────────────

function ManagerDetailModal({ detail, loading, from, to, onClose }) {
  const [tab, setTab] = useState("assignments");
  const [reportFilter, setReportFilter] = useState(null);
  const [assignmentDrill, setAssignmentDrill] = useState(null);
  const [assignmentDrillLoading, setAssignmentDrillLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const summary = detail.summary;
  const rows = detail[tab] || [];
  const reportRows = detail.reportRows || [];
  const filteredReportRows = reportFilter ? reportRows.filter((r) => r.status === reportFilter) : reportRows;

  const openAssignment = async (assignmentId) => {
    if (!assignmentId) return;
    try {
      setAssignmentDrillLoading(true);
      setAssignmentDrill({ loading: true });
      const res = await api.get(`/director-managers/assignment/${assignmentId}`, {
        params: { from: toApiDate(from), to: toApiDate(to) },
      });
      setAssignmentDrill(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load submission detail");
      setAssignmentDrill(null);
    } finally {
      setAssignmentDrillLoading(false);
    }
  };

  return createPortal(
    <div className="dma-modal-backdrop" onClick={onClose}>
      <div className="dma-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Manager detail">
        <div className="dma-modal-header">
          <div>
            <p className="dma-modal-eyebrow">Manager</p>
            <h3>{detail.name || "Loading…"}</h3>
            {summary ? (
              <p className="dma-modal-sub">
                {formatNum(summary.classroomCount)} classes · {formatNum(summary.teacherCount)} teachers · {formatNum(summary.assignmentCount)} assignments
              </p>
            ) : null}
          </div>
          <button type="button" className="dma-modal-close" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>

        {loading && !summary ? <p className="dma-loading">Loading detail…</p> : null}

        {summary && (
          <div className="dma-modal-body">
            <div className="dma-summary-row dma-summary-row--compact">
              <div className="dma-summary-pill">
                <span className="dma-summary-icon">
                  <FiUserCheck />
                </span>
                <div>
                  <p className="dma-summary-label">Health</p>
                  <HealthBar score={summary.healthScore} band={summary.healthBand} />
                </div>
              </div>
              <SummaryPill icon={<FiEdit3 />} label="Total edits" value={formatNum(allEdits(summary))} />
              <SummaryPill icon={<FiEdit3 />} label="Correction edits" value={formatNum(summary.totalEdits)} />
              <SummaryPill icon={<FiMove />} label="Mapping edits" value={formatNum(summary.placementChanges)} />
              <StatFilterTile
                icon={<FiSend />}
                label="Sent"
                value={formatNum(summary.reportsSent)}
                tone="good"
                active={reportFilter === "sent"}
                onClick={() => setReportFilter(reportFilter === "sent" ? null : "sent")}
              />
              <StatFilterTile
                icon={<FiClock />}
                label="Late"
                value={formatNum(summary.reportsLate)}
                tone="warn"
                active={reportFilter === "late"}
                onClick={() => setReportFilter(reportFilter === "late" ? null : "late")}
              />
              <StatFilterTile
                icon={<FiAlertTriangle />}
                label="Unsent"
                value={formatNum(summary.reportsUnsent)}
                tone="warn"
                active={reportFilter === "unsent"}
                onClick={() => setReportFilter(reportFilter === "unsent" ? null : "unsent")}
              />
            </div>

            <h4 className="dma-modal-section">Edits</h4>
            <p className="dma-muted" style={{ marginTop: -4, marginBottom: 10 }}>
              What this manager changed themselves, measured per save — not their
              assistants' work. Correction edits and mapping edits are counted
              separately, and a question that was both re-graded and moved appears
              in both.
            </p>
            <div className="dma-tabs">
              {EDIT_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`dma-tab${tab === t.key ? " dma-tab--active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label} ({(detail[t.key] || []).length})
                </button>
              ))}
            </div>

            <div className="dma-table-wrap">
              <table className="dma-table sah-table--cards">
                <thead>
                  <tr>
                    <th>{tab === "assignments" ? "Assignment" : tab === "classrooms" ? "Class" : "Teacher"}</th>
                    {tab === "assignments" && <th>Due</th>}
                    {tab !== "assignments" && <th>Assignments</th>}
                    <th title="Corrections this manager made themselves - a mark or feedback changed">
                      Correction Edits
                    </th>
                    <th title="Annotations this manager dragged to a new place and confirmed">
                      Mapping Edits
                    </th>
                    <th title="Mark-mass this manager moved from the AI's original marking">Marks Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="dma-loading">
                        No data in this range.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const key = r.assignmentId || r.classroomId || r.teacherId;
                      const title = tab === "assignments" ? r.title : tab === "classrooms" ? r.className : r.teacherName;
                      return (
                        <tr key={key}>
                          <td data-label={tab === "assignments" ? "Assignment" : tab === "classrooms" ? "Class" : "Teacher"}>
                            <strong>{title}</strong>
                            {tab === "assignments" && <span className="dma-muted dma-block">{r.className}</span>}
                          </td>
                          {tab === "assignments" && <td data-label="Due">{formatDate(r.dueDate)}</td>}
                          {tab !== "assignments" && <td data-label="Assignments">{formatNum(r.assignmentCount)}</td>}
                          <td data-label="Correction Edits">
                            {tab === "assignments" && r.source !== "external" ? (
                              <button type="button" className="dma-link-btn" onClick={() => openAssignment(r.assignmentId)}>
                                {formatNum(r.totalEdits)}
                              </button>
                            ) : (
                              formatNum(r.totalEdits)
                            )}
                          </td>
                          <td data-label="Mapping Edits">{formatNum(r.placementChanges)}</td>
                          <td data-label="Marks Δ">{formatNum(r.marksDelta)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h4 className="dma-modal-section">Reports {reportFilter ? `— ${REPORT_STATUS_LABEL[reportFilter]}` : ""}</h4>
            {filteredReportRows.length === 0 ? (
              <p className="dma-loading">No report activity in this range.</p>
            ) : (
              <div className="dma-table-wrap">
                <table className="dma-table sah-table--cards">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Class</th>
                      <th>Expected</th>
                      <th>Sent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReportRows.map((r, i) => (
                      <tr key={`${r.stream}-${r.assignmentId || r.classroomId}-${i}`}>
                        <td data-label="Report">
                          <strong>{r.assignmentTitle}</strong>
                          <span className="dma-muted dma-block">{r.label}</span>
                        </td>
                        <td data-label="Class">{r.className}</td>
                        <td data-label="Expected">{formatDateTime(r.expectedAt)}</td>
                        <td data-label="Sent">{formatDateTime(r.sentAt)}</td>
                        <td data-label="Status">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="dma-modal-section">Capacity</h4>
            <CapacityBlock capacity={summary.capacity} />
          </div>
        )}
      </div>

      {assignmentDrill && (
        <AssignmentDrillModal
          detail={assignmentDrill}
          loading={assignmentDrillLoading}
          onClose={() => setAssignmentDrill(null)}
        />
      )}
    </div>,
    document.body
  );
}

// ── per-submission drill-down ────────────────────────────────────────────────

function AssignmentDrillModal({ detail, loading, onClose }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const assignment = detail?.assignment;

  return createPortal(
    <div className="dma-modal-backdrop dma-modal-backdrop--nested" onClick={onClose}>
      <div className="dma-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Assignment submissions">
        <div className="dma-modal-header">
          <div>
            <p className="dma-modal-eyebrow">Assignment</p>
            <h3>{assignment?.title || "Loading…"}</h3>
            {assignment ? <p className="dma-modal-sub">{assignment.className} · Due {formatDate(assignment.dueDate)}</p> : null}
          </div>
          <button type="button" className="dma-modal-close" onClick={onClose} aria-label="Close">
            <FiX />
          </button>
        </div>

        {loading && !assignment ? <p className="dma-loading">Loading submissions…</p> : null}

        {assignment && (
          <div className="dma-table-wrap">
            <table className="dma-table sah-table--cards">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Edited by</th>
                  <th title="Marks or feedback changed on this paper, by everyone who touched it">
                    Correction Edits
                  </th>
                  <th title="Annotations dragged to a new place on this paper, by everyone who touched it">
                    Mapping Edits
                  </th>
                  <th>Marks Δ</th>
                  <th>Edited at</th>
                </tr>
              </thead>
              <tbody>
                {(detail.submissions || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="dma-loading">
                      No submissions in this range.
                    </td>
                  </tr>
                ) : (
                  detail.submissions.map((s) => (
                    <tr key={s.submissionId}>
                      <td data-label="Student">{s.studentName}</td>
                      <td data-label="Edited by">{s.editedByName || "—"}</td>
                      <td data-label="Correction Edits">{formatNum(s.totalEdits)}</td>
                      <td data-label="Mapping Edits">{formatNum(s.placementChanges)}</td>
                      <td data-label="Marks Δ">{formatNum(s.marksDelta)}</td>
                      <td data-label="Edited at">{formatDateTime(s.editedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
