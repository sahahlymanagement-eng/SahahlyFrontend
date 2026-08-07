import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FiUser,
  FiUsers,
  FiBookOpen,
  FiFileText,
  FiCheckCircle,
  FiEdit3,
  FiCpu,
  FiDollarSign,
  FiSearch,
  FiRefreshCw,
  FiCalendar,
  FiX,
  FiUploadCloud,
  FiAlertTriangle,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";
import HealthBar from "../../components/HealthBar";
import "./DirectorTeachers.css";

const TABS = [
  { key: "teachers", label: "Teachers", icon: <FiUser /> },
  { key: "classrooms", label: "Classrooms", icon: <FiBookOpen /> },
];

const PERIODS = [
  { key: "week", label: "Weekly", hint: "Last 7 days" },
  { key: "month", label: "Monthly", hint: "Last 30 days" },
  { key: "all", label: "All time", hint: "No date limit" },
];

const PAGE_SIZE = 20;

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

/** Token counts run into the hundreds of millions — full digits are unreadable. */
function formatCompact(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** Rates are null when there was nothing to divide by — never show 0% for that. */
function formatPct(value) {
  return value == null ? "—" : `${value}%`;
}

function formatAvg(value) {
  return value == null ? "—" : Number(value).toLocaleString();
}

function formatEgp(value, decimals = 0) {
  return `${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} EGP`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function rateTone(value, { good = 85, ok = 60 } = {}) {
  if (value == null) return "";
  if (value >= good) return "dt-good";
  if (value >= ok) return "dt-ok";
  return "dt-warn";
}

/** Serialise a Date to the yyyy-MM-dd the API expects, in local time. */
function toApiDate(date) {
  if (!date) return undefined;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function RateBar({ value, tone }) {
  return (
    <div className="dt-progress-wrap">
      <strong className={tone}>{formatPct(value)}</strong>
      <div className="dt-progress-track">
        <div
          className={`dt-progress-fill ${tone}`}
          style={{ width: `${value == null ? 0 : Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function SummaryPill({ icon, label, value, sub, tone }) {
  return (
    <div className={`dt-summary-pill${tone ? ` dt-summary-pill--${tone}` : ""}`}>
      <span className="dt-summary-icon">{icon}</span>
      <div>
        <p className="dt-summary-label">{label}</p>
        <p className="dt-summary-value">{value}</p>
        {sub ? <p className="dt-summary-sub">{sub}</p> : null}
      </div>
    </div>
  );
}

/** Edits are asked for three ways at once, so one cell carries all of them. */
function EditsCell({ row, perClass }) {
  return (
    <div className="dt-stack">
      <strong>{formatNum(row.totalEdits)}</strong>
      <span className="dt-muted">
        {formatAvg(row.editsPerAssignment)} / assignment
        {perClass ? ` · ${formatAvg(row.editsPerClassroom)} / class` : ""}
      </span>
    </div>
  );
}

/** Teachers flagged worst-decile on edit load, late marking, or unsent
 * reports (relative to the other teachers in this period, not a fixed cutoff). */
function AtRiskPanel({ teachers, onOpen }) {
  const flagged = teachers.filter((t) => t.atRisk);
  if (!flagged.length) return null;

  return (
    <div className="dt-at-risk">
      <div className="dt-at-risk-header">
        <FiAlertTriangle />
        <strong>{flagged.length} teacher{flagged.length === 1 ? "" : "s"} at risk</strong>
        <span className="dt-muted">worst 10% on at least one metric this period</span>
      </div>
      <div className="dt-at-risk-list">
        {flagged.map((t) => (
          <button
            key={t.teacherId}
            type="button"
            className="dt-at-risk-item"
            onClick={() => onOpen("teacher", t.teacherId, t.teacherName)}
          >
            <span className="dt-at-risk-name">{t.teacherName}</span>
            <span className="dt-at-risk-reasons">
              {t.atRiskReasons.map((r) => (
                <span key={r} className="dt-at-risk-chip">
                  {r}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DirectorTeachers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("teachers");
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
      const res = await api.get("/director-teachers/overview", {
        params: { period, from: toApiDate(from), to: toApiDate(to) },
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load teacher analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // A new tab, search or window makes the old page number meaningless.
  useEffect(() => {
    setPage(1);
  }, [tab, search, period, from, to]);

  const rows = useMemo(() => {
    const all = data?.[tab] || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;

    return all.filter((r) =>
      [r.teacherName, r.email, r.className, r.section]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [data, tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = data?.totals;

  // An explicit date range overrides the preset, so the chips go quiet.
  const customRange = Boolean(from || to);

  const selectPeriod = (key) => {
    setPeriod(key);
    setFrom(null);
    setTo(null);
  };

  const openDetail = async (kind, id, title) => {
    try {
      setDetailLoading(true);
      setDetail({ kind, title, loading: true });
      const res = await api.get(`/director-teachers/${kind}/${id}`, {
        params: { period, from: toApiDate(from), to: toApiDate(to) },
      });
      setDetail({ kind, title, ...res.data });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="dt-page">
      <div className="dt-header">
        <div className="dt-header-left">
          <div className="dt-header-icon">
            <FiUsers />
          </div>
          <div>
            <h2>Teachers</h2>
            <p>
              Volume, AI spend and correction load per teacher — and per
              classroom underneath them
            </p>
          </div>
        </div>
        <button
          type="button"
          className="dt-refresh-btn"
          onClick={loadData}
          disabled={loading}
        >
          <FiRefreshCw />
          Refresh
        </button>
      </div>

      <div className="dt-filters">
        <div className="dt-period-group" role="group" aria-label="Time period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.hint}
              className={`dt-period${
                !customRange && period === p.key ? " dt-period--active" : ""
              }`}
              onClick={() => selectPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="dt-filter-wrap">
          <FiCalendar className="dt-filter-icon" size={13} />
          <DatePicker
            selected={from}
            onChange={setFrom}
            dateFormat="yyyy-MM-dd"
            className="dt-datepicker-input"
            placeholderText="From"
            isClearable
            portalId="root"
          />
        </div>
        <div className="dt-filter-wrap">
          <FiCalendar className="dt-filter-icon" size={13} />
          <DatePicker
            selected={to}
            onChange={setTo}
            dateFormat="yyyy-MM-dd"
            className="dt-datepicker-input"
            placeholderText="To"
            isClearable
            minDate={from || undefined}
            portalId="root"
          />
        </div>
        {customRange && (
          <button
            type="button"
            className="dt-clear-btn"
            onClick={() => {
              setFrom(null);
              setTo(null);
            }}
          >
            <FiX /> Clear dates
          </button>
        )}
      </div>

      <div className="dt-summary-row">
        <SummaryPill
          icon={<FiUser />}
          label="Teachers"
          value={formatNum(totals?.teacherCount)}
          sub={`${formatNum(totals?.activeTeacherCount)} with work in this range`}
        />
        <SummaryPill
          icon={<FiBookOpen />}
          label="Classrooms"
          value={formatNum(totals?.classroomCount)}
          sub={`${formatNum(totals?.studentCount)} students enrolled`}
        />
        <SummaryPill
          icon={<FiFileText />}
          label="Assignments"
          value={formatNum(totals?.assignmentCount)}
          sub={`${formatNum(totals?.papersMarked)} papers marked`}
        />
        <SummaryPill
          icon={<FiUploadCloud />}
          label="Submission rate"
          value={formatPct(totals?.submissionRate)}
          sub={`${formatNum(totals?.submittedPapers)} of ${formatNum(
            totals?.expectedPapers
          )} expected`}
          tone={totals?.submissionRate != null && totals.submissionRate < 60 ? "warn" : "good"}
        />
        <SummaryPill
          icon={<FiCheckCircle />}
          label="Corrected PDFs"
          value={formatNum(totals?.correctedPdfs)}
          sub={`${formatPct(totals?.returnRate)} of marked papers returned`}
        />
        <SummaryPill
          icon={<FiEdit3 />}
          label="Edits"
          value={formatNum(totals?.totalEdits)}
          sub={`${formatAvg(totals?.editsPerAssignment)} per assignment`}
        />
        <SummaryPill
          icon={<FiCpu />}
          label="Tokens used"
          value={formatCompact(totals?.totalTokens)}
          sub={`${formatNum(totals?.aiRequests)} AI requests`}
        />
        <SummaryPill
          icon={<FiDollarSign />}
          label="Expenses"
          value={formatEgp(totals?.costEgp)}
          sub={`$${(Number(totals?.costUsd) || 0).toFixed(2)} · ${formatEgp(
            totals?.costPerPaper,
            2
          )} per paper`}
        />
      </div>

      <div className="dt-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`dt-tab${tab === t.key ? " dt-tab--active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label} ({(data?.[t.key] || []).length})
          </button>
        ))}
      </div>

      <div className="dt-search">
        <FiSearch />
        <input
          placeholder={tab === "teachers" ? "Search teachers…" : "Search classrooms…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="dt-note">
        <strong>Submission rate</strong> is measured as papers the marking
        pipeline processed against the classroom's current roster — nothing in
        the system records who turned work in, so it reads low while an
        assignment is still being marked. Assignments that are not due yet are
        left out of it entirely. <strong>Corrected PDFs</strong> counts
        annotated papers actually returned through Google Classroom.
      </p>

      <AtRiskPanel teachers={data?.teachers || []} onOpen={openDetail} />

      {loading && <p className="dt-loading">Loading teacher analytics…</p>}

      {!loading && !rows.length && (
        <p className="dt-loading">
          {search ? `Nothing matches "${search}".` : "No teachers with data in this range."}
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="dt-table-card">
            <div className="dt-table-wrap">
              <table className="dt-table sah-table--cards">
                <thead>
                  <tr>
                    <th>{tab === "teachers" ? "Teacher" : "Classroom"}</th>
                    {tab === "teachers" && <th>Classes</th>}
                    <th>Students</th>
                    <th>Assignments</th>
                    <th title="Papers processed vs the classroom roster">Submission</th>
                    <th title="Papers marked by the AI, excluding submissions with no PDF">
                      Marked
                    </th>
                    <th title="Annotated PDFs returned through Google Classroom">
                      Corrected PDFs
                    </th>
                    <th title="Every correction made to AI marking, including repeats">
                      Edits
                    </th>
                    <th>Tokens</th>
                    <th>Expenses</th>
                    <th title="Average of edit quality and report reliability">Health</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const isTeacher = tab === "teachers";
                    const id = isTeacher ? row.teacherId : row.classroomId;
                    return (
                      <tr key={id}>
                        <td data-label={isTeacher ? "Teacher" : "Classroom"}>
                          <strong>
                            {isTeacher ? row.teacherName : row.className}
                          </strong>
                          <span className="dt-muted dt-block">
                            {isTeacher
                              ? row.email || "—"
                              : [row.section, row.teacherName]
                                  .filter(Boolean)
                                  .join(" · ") || "No teacher assigned"}
                          </span>
                        </td>
                        {isTeacher && (
                          <td data-label="Classes">{formatNum(row.classroomCount)}</td>
                        )}
                        <td data-label="Students">{formatNum(row.studentCount)}</td>
                        <td data-label="Assignments">{formatNum(row.assignmentCount)}</td>
                        <td data-label="Submission">
                          <RateBar
                            value={row.submissionRate}
                            tone={rateTone(row.submissionRate)}
                          />
                          <span className="dt-muted">
                            {formatNum(row.submittedPapers)} / {formatNum(row.expectedPapers)}
                          </span>
                        </td>
                        <td data-label="Marked">
                          <div className="dt-stack">
                            <strong>{formatNum(row.papersMarked)}</strong>
                            {row.papersNoPdf > 0 ? (
                              <span
                                className="dt-muted"
                                title="Turned in with no PDF attached — auto-awarded 0"
                              >
                                {formatNum(row.papersNoPdf)} without a PDF
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td data-label="Corrected PDFs">
                          <div className="dt-stack">
                            <strong>{formatNum(row.correctedPdfs)}</strong>
                            <span className={`dt-muted ${rateTone(row.returnRate)}`}>
                              {formatPct(row.returnRate)} returned
                            </span>
                          </div>
                        </td>
                        <td data-label="Edits">
                          <EditsCell row={row} perClass={isTeacher} />
                        </td>
                        <td data-label="Tokens">
                          <div className="dt-stack">
                            <strong>{formatCompact(row.totalTokens)}</strong>
                            <span className="dt-muted">
                              {formatNum(row.aiRequests)} requests
                            </span>
                          </div>
                        </td>
                        <td data-label="Expenses">
                          <div className="dt-stack">
                            <strong>{formatEgp(row.costEgp)}</strong>
                            <span className="dt-muted">
                              ${(Number(row.costUsd) || 0).toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td data-label="Health">
                          <HealthBar score={row.healthScore} band={row.healthBand} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="dt-detail-btn"
                            onClick={() =>
                              openDetail(
                                isTeacher ? "teacher" : "classroom",
                                id,
                                isTeacher ? row.teacherName : row.className
                              )
                            }
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}

      {detail && (
        <DetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
          onOpenClassroom={(id, title) => openDetail("classroom", id, title)}
        />
      )}
    </div>
  );
}

// ── drill-down ───────────────────────────────────────────────────────────────

/**
 * Rendered through a portal into <body>, NOT in place.
 *
 * `.director-page-inner` (pages/director/directorShell.css) runs `ast-fade-up`
 * with fill-mode `both`, and that animation's final keyframe is
 * `transform: translateY(0)`. A computed transform other than `none` sticks
 * around permanently under `both` and makes the element a containing block for
 * `position: fixed` children — so an in-place backdrop anchors to the padded
 * content column beside the sidebar instead of the viewport, and the modal
 * lands off-centre. Portalling past that ancestor is the fix; the alternative
 * (dropping the shell animation) would change every director page.
 */
function DetailModal({ detail, loading, onClose, onOpenClassroom }) {
  const isTeacher = detail.kind === "teacher";
  const subject = isTeacher ? detail.teacher : detail.classroom;

  // Escape closes, and the page behind must not scroll under the modal.
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

  return createPortal(
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div
        className="dt-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isTeacher ? "Teacher detail" : "Classroom detail"}
      >
        <div className="dt-modal-header">
          <div>
            <p className="dt-modal-eyebrow">
              {isTeacher ? "Teacher" : "Classroom"}
            </p>
            <h3>{detail.title || "Loading…"}</h3>
            {subject ? (
              <p className="dt-modal-sub">
                {isTeacher
                  ? `${formatNum(subject.classroomCount)} classes · ${formatNum(
                      subject.studentCount
                    )} students · ${formatNum(subject.assignmentCount)} assignments`
                  : [subject.section, subject.teacherName].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="dt-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>

        {loading && !subject ? <p className="dt-loading">Loading detail…</p> : null}

        {subject && (
          <div className="dt-modal-body">
            <div className="dt-summary-row dt-summary-row--compact">
              <SummaryPill
                icon={<FiUploadCloud />}
                label="Submission"
                value={formatPct(subject.submissionRate)}
                sub={`${formatNum(subject.submittedPapers)} of ${formatNum(
                  subject.expectedPapers
                )}`}
              />
              <SummaryPill
                icon={<FiCheckCircle />}
                label="Corrected PDFs"
                value={formatNum(subject.correctedPdfs)}
                sub={`${formatPct(subject.returnRate)} returned`}
              />
              <SummaryPill
                icon={<FiEdit3 />}
                label="Edits"
                value={formatNum(subject.totalEdits)}
                sub={`${formatAvg(subject.editsPerAssignment)} per assignment`}
              />
              <SummaryPill
                icon={<FiCpu />}
                label="Tokens"
                value={formatCompact(subject.totalTokens)}
                sub={`${formatNum(subject.aiRequests)} requests`}
              />
              <SummaryPill
                icon={<FiDollarSign />}
                label="Expenses"
                value={formatEgp(subject.costEgp)}
                sub={`$${(Number(subject.costUsd) || 0).toFixed(2)}`}
              />
              <div className="dt-summary-pill">
                <span className="dt-summary-icon">
                  <FiCheckCircle />
                </span>
                <div>
                  <p className="dt-summary-label">Health</p>
                  <HealthBar score={subject.healthScore} band={subject.healthBand} />
                </div>
              </div>
            </div>

            {isTeacher && (detail.classrooms || []).length > 0 && (
              <>
                <h4 className="dt-modal-section">Classrooms</h4>
                <div className="dt-table-wrap">
                  <table className="dt-table sah-table--cards">
                    <thead>
                      <tr>
                        <th>Classroom</th>
                        <th>Students</th>
                        <th>Assignments</th>
                        <th>Submission</th>
                        <th>Corrected PDFs</th>
                        <th>Edits</th>
                        <th>Expenses</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.classrooms.map((c) => (
                        <tr key={c.classroomId}>
                          <td data-label="Classroom">
                            <strong>{c.className}</strong>
                            {c.section ? (
                              <span className="dt-muted"> · {c.section}</span>
                            ) : null}
                          </td>
                          <td data-label="Students">{formatNum(c.studentCount)}</td>
                          <td data-label="Assignments">{formatNum(c.assignmentCount)}</td>
                          <td data-label="Submission">
                            <span className={rateTone(c.submissionRate)}>
                              {formatPct(c.submissionRate)}
                            </span>
                          </td>
                          <td data-label="Corrected PDFs">{formatNum(c.correctedPdfs)}</td>
                          <td data-label="Edits">{formatNum(c.totalEdits)}</td>
                          <td data-label="Expenses">{formatEgp(c.costEgp)}</td>
                          <td>
                            <button
                              type="button"
                              className="dt-detail-btn"
                              onClick={() => onOpenClassroom(c.classroomId, c.className)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h4 className="dt-modal-section">Assignments</h4>
            {(detail.assignments || []).length === 0 ? (
              <p className="dt-loading">No assignments in this range.</p>
            ) : (
              <div className="dt-table-wrap">
                <table className="dt-table sah-table--cards">
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th>Due</th>
                      <th>Submission</th>
                      <th>Marked</th>
                      <th>Corrected PDFs</th>
                      <th>Edits</th>
                      <th>Tokens</th>
                      <th>Expenses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.assignments.map((a) => (
                      <tr key={a.assignmentId}>
                        <td data-label="Assignment">
                          <strong>{a.title || "Untitled"}</strong>
                          <span className="dt-muted dt-block">{a.className}</span>
                        </td>
                        <td data-label="Due">{formatDate(a.dueDate)}</td>
                        <td data-label="Submission">
                          <span className={rateTone(a.submissionRate)}>
                            {formatPct(a.submissionRate)}
                          </span>
                          <span className="dt-muted dt-block">
                            {a.isDue
                              ? `${formatNum(a.papersProcessed)} / ${formatNum(a.rosterSize)}`
                              : "Not due yet"}
                          </span>
                        </td>
                        <td data-label="Marked">{formatNum(a.papersMarked)}</td>
                        <td data-label="Corrected PDFs">{formatNum(a.correctedPdfs)}</td>
                        <td data-label="Edits">{formatNum(a.totalEdits)}</td>
                        <td data-label="Tokens">{formatCompact(a.totalTokens)}</td>
                        <td data-label="Expenses">{formatEgp(a.costEgp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
