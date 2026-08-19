import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import {
  FiBarChart2,
  FiSearch,
  FiRefreshCw,
  FiBookOpen,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
  FiFileText,
  FiCpu,
  FiEdit3,
  FiMove,
  FiX,
  FiUsers,
} from "react-icons/fi";
import "./DirectorAssistantPerformance.css";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

const CAPACITY_STATUS_LABEL = { ok: "OK", near: "Near capacity", over: "Over capacity" };

function CapacityBadge({ status }) {
  if (!status) return <span className="dap-muted">—</span>;
  return <span className={`dap-capacity-badge dap-capacity-badge--${status}`}>{CAPACITY_STATUS_LABEL[status]}</span>;
}

function CapacityRow({ label, usage, ceiling }) {
  const pct = ceiling ? Math.min(100, Math.round((usage / ceiling) * 100)) : 0;
  const tone = pct >= 100 ? "over" : pct >= 85 ? "near" : "ok";
  return (
    <div className="dap-capacity-row">
      <div className="dap-capacity-row-head">
        <span>{label}</span>
        <strong>
          {formatNum(usage)} / {formatNum(ceiling)}
        </strong>
      </div>
      <div className="dap-capacity-track">
        <div className={`dap-capacity-fill dap-capacity-fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CapacityBar({ usage, ceiling }) {
  const pct = ceiling ? Math.min(100, Math.round((usage / ceiling) * 100)) : 0;
  const tone = pct >= 100 ? "over" : pct >= 85 ? "near" : "ok";
  return (
    <div className="dap-capacity-cell">
      <span className="dap-muted">
        {formatNum(usage)} / {formatNum(ceiling)}
      </span>
      <div className="dap-capacity-track">
        <div className={`dap-capacity-fill dap-capacity-fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DirectorAssistantPerformance() {
  const period = useDashboardPeriod();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [period.params.from, period.params.to]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get("/director/assistant-performance", {
        params: period.params,
      });
      setAssistants(res.data?.assistants || []);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to load assistant performance"
      );
      setAssistants([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (personId) => {
    try {
      setDetailLoading(true);
      const res = await api.get("/director/assistant-performance/detail", {
        params: { personId, ...period.params },
      });
      setDetail(res.data);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to load assistant detail"
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assistants;

    return assistants.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        (a.subjects || []).some((s) => s.name?.toLowerCase().includes(q))
    );
  }, [search, assistants]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, a) => {
        acc.papers += a.papersCorrected || 0;
        acc.onTime += a.summary?.onTime || 0;
        acc.missed += a.summary?.missedDeadline || 0;
        acc.pending += a.summary?.pending || 0;
        return acc;
      },
      { papers: 0, onTime: 0, missed: 0, pending: 0 }
    );
  }, [filtered]);

  return (
    <div className="dap-page">
      <div className="dap-header">
        <div className="dap-header-left">
          <div className="dap-header-icon">
            <FiBarChart2 />
          </div>
          <div>
            <h2>Assistant Performance</h2>
            <p>Overview of all assistants and their marking output</p>
          </div>
        </div>
        <button
          type="button"
          className="dap-refresh-btn"
          onClick={loadData}
          disabled={loading}
        >
          <FiRefreshCw />
          Refresh
        </button>
      </div>

      <DashboardPeriodFilter
        from={period.from}
        to={period.to}
        setFrom={period.setFrom}
        setTo={period.setTo}
        resetToThisMonth={period.resetToThisMonth}
        monthLabel={period.monthLabel}
      />

      <div className="dap-summary-row">
        <SummaryPill icon={<FiUsers />} label="Assistants" value={filtered.length} />
        <SummaryPill icon={<FiFileText />} label="Papers corrected" value={formatNum(totals.papers)} />
        <SummaryPill icon={<FiCheckCircle />} label="On time" value={formatNum(totals.onTime)} tone="good" />
        <SummaryPill icon={<FiAlertTriangle />} label="Passed deadline" value={formatNum(totals.missed)} tone="warn" />
        <SummaryPill icon={<FiClock />} label="In progress" value={formatNum(totals.pending)} />
      </div>

      <div className="dap-search">
        <FiSearch />
        <input
          placeholder="Search assistant or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="dap-loading">Loading assistant performance…</p>}

      {!loading && !filtered.length && (
        <p className="dap-loading">
          {search
            ? `No assistants match "${search}".`
            : "No assistants found."}
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="dap-table-card">
          <div className="dap-table-wrap">
            <table className="dap-table sah-table--cards">
              <thead>
                <tr>
                  <th>Assistant</th>
                  <th>Subjects</th>
                  <th>Papers</th>
                  <th>Assignments</th>
                  <th>On time</th>
                  <th>Passed deadline</th>
                  <th>In progress</th>
                  <th>Tokens</th>
                  <th title="Distinct students across classrooms currently open or finished this calendar month, vs. the 125/month ceiling">Students</th>
                  <th title="PDFs still on this assistant's plate (assignments they have not finished), out of every PDF submitted to their assignments this calendar month">PDFs in progress</th>
                  <th>Capacity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.personId}>
                    <td data-label="Assistant">
                      <strong>{a.name}</strong>
                      {a.email ? (
                        <span className="dap-muted"> · {a.email}</span>
                      ) : null}
                    </td>
                    <td data-label="Subjects">
                      {(a.subjects || []).length ? (
                        <div className="dap-subject-chips dap-subject-chips--sm">
                          {a.subjects.map((s) => (
                            <span key={s.id} className="dap-chip">
                              {s.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="dap-muted">—</span>
                      )}
                    </td>
                    <td data-label="Papers">{formatNum(a.papersCorrected)}</td>
                    <td data-label="Assignments">{formatNum(a.summary?.totalAssignments)}</td>
                    <td className="dap-good" data-label="On time">{formatNum(a.summary?.onTime)}</td>
                    <td className="dap-warn" data-label="Passed deadline">{formatNum(a.summary?.missedDeadline)}</td>
                    <td data-label="In progress">{formatNum(a.summary?.pending)}</td>
                    <td data-label="Tokens">{formatNum(a.tokenUsage?.totalTokens)}</td>
                    <td data-label="Students">
                      <CapacityBar usage={a.capacity?.studentsAssigned} ceiling={a.capacity?.studentsCeiling} />
                    </td>
                    <td data-label="PDFs in progress">
                      <CapacityBar usage={a.capacity?.pdfsInProgress} ceiling={a.capacity?.pdfsSubmitted} />
                    </td>
                    <td data-label="Capacity">
                      <CapacityBadge status={a.capacity?.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dap-detail-btn"
                        onClick={() => openDetail(a.personId)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(detail || detailLoading) && (
        <AssistantDetailModal detail={detail} loading={detailLoading} onClose={closeDetail} />
      )}
    </div>
  );
}

/**
 * Portalled to document.body — .director-page-inner runs a fade-up animation
 * with fill-mode `both`, and the animation's final transform sticks around
 * permanently, making that ancestor a containing block for `position: fixed`
 * children. An in-place modal would anchor to the padded content column
 * instead of the viewport and scroll away with the page.
 */
function AssistantDetailModal({ detail, loading, onClose }) {
  const DETAIL_TEACHERS_PAGE_SIZE = 20;
  const DETAIL_CLASSROOMS_PAGE_SIZE = 10;
  const [detailTab, setDetailTab] = useState("overview");
  const [detailTeachersPage, setDetailTeachersPage] = useState(1);
  const [detailClassroomsPage, setDetailClassroomsPage] = useState(1);

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

  const detailTeachers = detail?.assistant?.teachers || [];
  const detailClassrooms = detail?.assistant?.classrooms || [];
  const detailTeacherTotalPages = Math.max(
    1,
    Math.ceil(detailTeachers.length / DETAIL_TEACHERS_PAGE_SIZE)
  );
  const detailClassroomTotalPages = Math.max(
    1,
    Math.ceil(detailClassrooms.length / DETAIL_CLASSROOMS_PAGE_SIZE)
  );
  const visibleDetailTeachers = detailTeachers.slice(
    (detailTeachersPage - 1) * DETAIL_TEACHERS_PAGE_SIZE,
    detailTeachersPage * DETAIL_TEACHERS_PAGE_SIZE
  );
  const visibleDetailClassrooms = detailClassrooms.slice(
    (detailClassroomsPage - 1) * DETAIL_CLASSROOMS_PAGE_SIZE,
    detailClassroomsPage * DETAIL_CLASSROOMS_PAGE_SIZE
  );

  return createPortal(
    <div className="dap-modal-backdrop" onClick={onClose}>
      <div
        className="dap-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Assistant performance detail"
      >
        <div className="dap-modal-header">
          <div>
            <p className="dap-modal-eyebrow">Assistant performance</p>
            <h3>{detail?.assistant?.name || "Loading…"}</h3>
            {detail?.assistant?.email ? (
              <p className="dap-modal-sub">{detail.assistant.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="dap-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>

        {loading && !detail ? (
          <p className="dap-loading">Loading detail…</p>
        ) : null}

        {detail?.assistant && (
          <div className="dap-modal-body">
            {(detail.assistant.subjects || []).length > 0 && (
              <div className="dap-subject-chips">
                {detail.assistant.subjects.map((s) => (
                  <span key={s.id} className="dap-chip">
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            <div className="dap-detail-tabs">
              <button
                type="button"
                className={`dap-detail-tab${detailTab === "overview" ? " dap-detail-tab--active" : ""}`}
                onClick={() => setDetailTab("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={`dap-detail-tab${detailTab === "teachers" ? " dap-detail-tab--active" : ""}`}
                onClick={() => setDetailTab("teachers")}
              >
                Teachers ({detailTeachers.length})
              </button>
              <button
                type="button"
                className={`dap-detail-tab${detailTab === "classrooms" ? " dap-detail-tab--active" : ""}`}
                onClick={() => setDetailTab("classrooms")}
              >
                Classrooms ({detailClassrooms.length})
              </button>
            </div>

            {detailTab === "overview" && (
              <div className="ast-perf-grid">
                <MetricCard
                  icon={<FiFileText />}
                  label="Papers corrected"
                  value={formatNum(detail.assistant.papersCorrected)}
                />
                <MetricCard
                  icon={<FiEdit3 />}
                  label="Total edits"
                  value={formatNum(
                    (detail.assistant.editStats?.totalEdits || 0) +
                      (detail.assistant.editStats?.totalMappingEdits || 0)
                  )}
                />
                <MetricCard
                  icon={<FiEdit3 />}
                  label="Correction edits"
                  value={formatNum(detail.assistant.editStats?.totalEdits)}
                />
                <MetricCard
                  icon={<FiMove />}
                  label="Mapping edits"
                  value={formatNum(detail.assistant.editStats?.totalMappingEdits)}
                />
                <MetricCard
                  icon={<FiCpu />}
                  label="Tokens used"
                  value={formatNum(detail.assistant.tokenUsage?.totalTokens)}
                />
                <MetricCard
                  icon={<FiBookOpen />}
                  label="Classrooms"
                  value={formatNum(detail.assistant.summary?.classroomCount)}
                />
                <MetricCard
                  icon={<FiCheckCircle />}
                  label="On time"
                  value={formatNum(detail.assistant.summary?.onTime)}
                  tone="good"
                />
                <MetricCard
                  icon={<FiAlertTriangle />}
                  label="Passed deadline"
                  value={formatNum(detail.assistant.summary?.missedDeadline)}
                  tone="warn"
                />
                <MetricCard
                  icon={<FiClock />}
                  label="In progress"
                  value={formatNum(detail.assistant.summary?.pending)}
                />
              </div>
            )}

            {detailTab === "overview" && (
              <section className="ast-perf-section">
                <h2>
                  Capacity <CapacityBadge status={detail.assistant.capacity?.status} />
                </h2>
                <div className="dap-capacity-detail">
                  <CapacityRow
                    label="Students assigned"
                    usage={detail.assistant.capacity?.studentsAssigned}
                    ceiling={detail.assistant.capacity?.studentsCeiling}
                  />
                  <CapacityRow
                    label="PDFs in progress / submitted this month"
                    usage={detail.assistant.capacity?.pdfsInProgress}
                    ceiling={detail.assistant.capacity?.pdfsSubmitted}
                  />
                </div>
              </section>
            )}

            {detailTab === "teachers" && detailTeachers.length > 0 && (
              <section className="ast-perf-section">
                <h2>Teachers ({detailTeachers.length})</h2>
                <div className="ast-perf-chip-list">
                  {visibleDetailTeachers.map((t) => (
                    <span key={t.id} className="ast-perf-chip">
                      {t.name}
                      {t.email ? ` · ${t.email}` : ""}
                      {` · ${formatNum(t.papersCorrected)} papers · ${t.submissionPercent || 0}%`}
                    </span>
                  ))}
                </div>
                <InlinePager
                  page={detailTeachersPage}
                  totalPages={detailTeacherTotalPages}
                  onChange={setDetailTeachersPage}
                />
              </section>
            )}

            {detailTab === "teachers" && detailTeachers.length === 0 && (
              <section className="ast-perf-section">
                <p className="dap-loading">No teachers linked yet.</p>
              </section>
            )}

            {detailTab === "classrooms" && detailClassrooms.length > 0 && (
              <section className="ast-perf-section">
                <h2>By classroom</h2>
                <div className="ast-table-card">
                  <div className="ast-table-wrap">
                    <table className="ast-table sah-table--cards">
                      <thead>
                        <tr>
                          <th>Classroom</th>
                          <th>Teacher</th>
                          <th>Assignments</th>
                          <th>Papers</th>
                          <th>% of submissions</th>
                          <th>On time</th>
                          <th>Passed deadline</th>
                          <th>In progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleDetailClassrooms.map((c) => (
                          <tr key={c.classroomId}>
                            <td data-label="Classroom">
                              <strong>{c.classroomName}</strong>
                              {c.section ? (
                                <span className="ast-muted"> · {c.section}</span>
                              ) : null}
                            </td>
                            <td data-label="Teacher">{c.teacherName}</td>
                            <td data-label="Assignments">{c.totalAssignments}</td>
                            <td data-label="Papers">{formatNum(c.papersCorrected)}</td>
                            <td data-label="% of submissions">{c.submissionPercent || 0}%</td>
                            <td className="ast-perf-good" data-label="On time">{c.onTime}</td>
                            <td className="ast-perf-warn" data-label="Passed deadline">{c.missedDeadline}</td>
                            <td data-label="In progress">{c.pending}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <InlinePager
                  page={detailClassroomsPage}
                  totalPages={detailClassroomTotalPages}
                  onChange={setDetailClassroomsPage}
                />
              </section>
            )}

            {detailTab === "classrooms" && detailClassrooms.length === 0 && (
              <section className="ast-perf-section">
                <p className="dap-loading">No classroom data yet.</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function SummaryPill({ icon, label, value, tone }) {
  return (
    <div className={`dap-summary-pill${tone ? ` dap-summary-pill--${tone}` : ""}`}>
      <span className="dap-summary-icon">{icon}</span>
      <div>
        <span className="dap-summary-value">{value}</span>
        <span className="dap-summary-label">{label}</span>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, tone }) {
  return (
    <div className={`ast-perf-card${tone ? ` ast-perf-card--${tone}` : ""}`}>
      <div className="ast-perf-card-top">
        <span className="ast-perf-card-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="ast-perf-card-value">{value}</div>
    </div>
  );
}

function InlinePager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="dap-inline-pager">
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}
