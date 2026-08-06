import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import { toast } from "react-toastify";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FiTarget,
  FiSearch,
  FiRefreshCw,
  FiCalendar,
  FiEdit3,
  FiFileText,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertTriangle,
  FiX,
  FiUsers,
  FiBookOpen,
  FiUser,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";
import "./DirectorAccuracyMetrics.css";

const TABS = [
  { key: "assignments", label: "Assignments", icon: <FiFileText /> },
  { key: "classes", label: "Classes", icon: <FiBookOpen /> },
  { key: "teachers", label: "Teachers", icon: <FiUser /> },
  { key: "assistants", label: "Assistants", icon: <FiUsers /> },
];

const PAGE_SIZE = 20;

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

/** Accuracy is null when there were no questions to judge — never show 100%. */
function formatPct(value) {
  return value == null ? "—" : `${value}%`;
}

/** Colour band for an accuracy percentage. Null reads as neutral, not bad. */
function accuracyTone(value) {
  if (value == null) return "";
  if (value >= 90) return "dam-good";
  if (value >= 75) return "dam-ok";
  return "dam-warn";
}

/** Serialise a Date to the yyyy-MM-dd the API expects, in local time. */
function toApiDate(date) {
  if (!date) return undefined;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function AccuracyBar({ value }) {
  return (
    <div className="dam-progress-wrap">
      <div className="dam-progress-label">
        <strong className={accuracyTone(value)}>{formatPct(value)}</strong>
      </div>
      <div className="dam-progress-track">
        <div
          className={`dam-progress-fill ${accuracyTone(value)}`}
          style={{ width: `${value == null ? 0 : value}%` }}
        />
      </div>
    </div>
  );
}

function SummaryPill({ icon, label, value, sub, tone }) {
  return (
    <div className={`dam-summary-pill${tone ? ` dam-summary-pill--${tone}` : ""}`}>
      <span className="dam-summary-icon">{icon}</span>
      <div>
        <p className="dam-summary-label">{label}</p>
        <p className="dam-summary-value">{value}</p>
        {sub ? <p className="dam-summary-sub">{sub}</p> : null}
      </div>
    </div>
  );
}

export default function DirectorAccuracyMetrics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("assignments");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/director-accuracy/overview", {
        params: { from: toApiDate(from), to: toApiDate(to) },
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load accuracy metrics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // A new tab or a new search means the old page number is meaningless.
  useEffect(() => {
    setPage(1);
  }, [tab, search, from, to]);

  const rows = useMemo(() => {
    const all = data?.[tab] || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;

    return all.filter((r) =>
      [r.title, r.className, r.teacherName, r.name, r.providerName, r.email]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [data, tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const overall = data?.overall;

  const openDetail = async (assignmentId) => {
    try {
      setDetailLoading(true);
      setDetail({ loading: true });
      const res = await api.get(`/director-accuracy/assignment/${assignmentId}`, {
        params: { from: toApiDate(from), to: toApiDate(to) },
      });
      setDetail(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load assignment detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="dam-page">
      <div className="dam-header">
        <div className="dam-header-left">
          <div className="dam-header-icon">
            <FiTarget />
          </div>
          <div>
            <h2>Accuracy Metrics</h2>
            <p>
              How often AI marking survives review, measured by the corrections
              assistants make
            </p>
          </div>
        </div>
        <button
          type="button"
          className="dam-refresh-btn"
          onClick={loadData}
          disabled={loading}
        >
          <FiRefreshCw />
          Refresh
        </button>
      </div>

      <div className="dam-filters">
        <div className="dam-filter-wrap">
          <FiCalendar className="dam-filter-icon" size={13} />
          <DatePicker
            selected={from}
            onChange={setFrom}
            dateFormat="yyyy-MM-dd"
            className="dam-datepicker-input"
            placeholderText="From"
            isClearable
            portalId="root"
          />
        </div>
        <div className="dam-filter-wrap">
          <FiCalendar className="dam-filter-icon" size={13} />
          <DatePicker
            selected={to}
            onChange={setTo}
            dateFormat="yyyy-MM-dd"
            className="dam-datepicker-input"
            placeholderText="To"
            isClearable
            minDate={from || undefined}
            portalId="root"
          />
        </div>
        {(from || to) && (
          <button
            type="button"
            className="dam-clear-btn"
            onClick={() => {
              setFrom(null);
              setTo(null);
            }}
          >
            <FiX /> Clear dates
          </button>
        )}
      </div>

      <div className="dam-summary-row">
        <SummaryPill
          icon={<FiTarget />}
          label="Question accuracy"
          value={formatPct(overall?.accuracyRate)}
          sub={`${formatNum(overall?.questionsEdited)} of ${formatNum(
            overall?.questionsTotal
          )} questions edited`}
          tone={overall?.accuracyRate != null && overall.accuracyRate < 75 ? "warn" : "good"}
        />
        <SummaryPill
          icon={<FiFileText />}
          label="Papers untouched"
          value={formatPct(overall?.paperAccuracyRate)}
          sub={`${formatNum(overall?.papersWithEdits)} of ${formatNum(
            overall?.papers
          )} papers corrected`}
        />
        <SummaryPill
          icon={<FiEdit3 />}
          label="Corrections made"
          value={formatNum(overall?.totalEdits)}
          sub={`${formatNum(overall?.marksChanged)} marks · ${formatNum(
            overall?.reasonOnlyChanges
          )} feedback only`}
        />
        <SummaryPill
          icon={<FiTrendingUp />}
          label="AI too strict"
          value={formatNum(overall?.marksIncreased)}
          sub="Marks raised on review"
        />
        <SummaryPill
          icon={<FiTrendingDown />}
          label="AI too generous"
          value={formatNum(overall?.marksDecreased)}
          sub="Marks lowered on review"
          tone="warn"
        />
        <SummaryPill
          icon={<FiAlertTriangle />}
          label="Questions AI missed"
          value={formatNum(overall?.questionsAdded)}
          sub={`${formatNum(overall?.questionsRemoved)} removed by reviewers`}
          tone="warn"
        />
      </div>

      <div className="dam-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`dam-tab${tab === t.key ? " dam-tab--active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label} ({(data?.[t.key] || []).length})
          </button>
        ))}
      </div>

      <div className="dam-search">
        <FiSearch />
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tab === "assistants" && (
        <p className="dam-note">
          Corrections are credited to whoever actually saved them, measured per
          save. A paper edited by an assistant and then a quality reviewer is
          split between them, so these figures do not add up to the papers'
          totals — if one person changes a mark and another changes it back,
          both did work while the paper ends up matching the AI.
        </p>
      )}

      {loading && <p className="dam-loading">Loading accuracy metrics…</p>}

      {!loading && !rows.length && (
        <p className="dam-loading">
          {search
            ? `Nothing matches "${search}".`
            : "No marked papers with a recorded AI comparison in this range."}
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="dam-table-card">
            <div className="dam-table-wrap">
              <table className="dam-table sah-table--cards">
                <thead>
                  <tr>
                    <th>{TABS.find((t) => t.key === tab)?.label.replace(/s$/, "")}</th>
                    <th>Accuracy</th>
                    <th title="Every correction made, including repeats and reverts">
                      Corrections
                    </th>
                    <th>Papers</th>
                    <th title="Distinct questions that needed at least one correction">
                      Questions
                    </th>
                    <th>Too strict</th>
                    <th>Too generous</th>
                    <th>Missed</th>
                    {tab === "assignments" && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={rowKey(row, tab)}>
                      <td data-label="Name">
                        <strong>{primaryLabel(row, tab)}</strong>
                        {secondaryLabel(row, tab) ? (
                          <span className="dam-muted">
                            {" "}
                            · {secondaryLabel(row, tab)}
                          </span>
                        ) : null}
                        {tab === "assistants" && row.attribution === "delegated" ? (
                          <span
                            className="dam-chip dam-chip--muted"
                            title="External partner work: attributed from the grading delegation, not measured per save"
                          >
                            delegated
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Accuracy">
                        <AccuracyBar value={row.accuracyRate} />
                      </td>
                      <td data-label="Corrections">{formatNum(row.totalEdits)}</td>
                      <td data-label="Papers">
                        {formatNum(row.papers)}
                        <span className="dam-muted">
                          {" "}
                          ({formatPct(row.paperAccuracyRate)} clean)
                        </span>
                      </td>
                      <td data-label="Questions">
                        {formatNum(row.questionsTouched)}
                        <span className="dam-muted">
                          {" "}
                          / {formatNum(row.questionsTotal)}
                        </span>
                      </td>
                      <td className="dam-good" data-label="Too strict">
                        {formatNum(row.marksIncreased)}
                      </td>
                      <td className="dam-warn" data-label="Too generous">
                        {formatNum(row.marksDecreased)}
                      </td>
                      <td data-label="Missed">{formatNum(row.questionsAdded)}</td>
                      {tab === "assignments" && (
                        <td>
                          {row.source === "classroom" ? (
                            <button
                              type="button"
                              className="dam-detail-btn"
                              onClick={() => openDetail(row.assignmentId)}
                            >
                              Details
                            </button>
                          ) : (
                            <span className="dam-muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
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
        <div className="dam-modal-backdrop" onClick={() => setDetail(null)}>
          <div
            className="dam-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Assignment accuracy detail"
          >
            <div className="dam-modal-header">
              <div>
                <p className="dam-modal-eyebrow">Assignment accuracy</p>
                <h3>{detail.assignment?.title || "Loading…"}</h3>
                {detail.assignment ? (
                  <p className="dam-modal-sub">
                    {detail.assignment.className}
                    {detail.assignment.section ? ` · ${detail.assignment.section}` : ""}
                    {" · "}
                    {detail.assignment.teacherName}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="dam-modal-close"
                onClick={() => setDetail(null)}
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>

            {detailLoading && !detail.assignment ? (
              <p className="dam-loading">Loading detail…</p>
            ) : null}

            {detail.assignment && (
              <div className="dam-modal-body">
                <div className="dam-summary-row dam-summary-row--compact">
                  <SummaryPill
                    icon={<FiTarget />}
                    label="Question accuracy"
                    value={formatPct(detail.totals?.accuracyRate)}
                  />
                  <SummaryPill
                    icon={<FiEdit3 />}
                    label="Total edits"
                    value={formatNum(detail.totals?.totalEdits)}
                  />
                  <SummaryPill
                    icon={<FiFileText />}
                    label="Papers"
                    value={formatNum(detail.totals?.papers)}
                  />
                </div>

                <div className="dam-table-wrap">
                  <table className="dam-table sah-table--cards">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Accuracy</th>
                        <th>Edits</th>
                        <th>Marks moved</th>
                        <th>Edited by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.submissions || []).map((s) => (
                        <tr key={s.submissionId}>
                          <td data-label="Student">{s.studentName}</td>
                          <td data-label="Accuracy">
                            <AccuracyBar value={s.accuracyRate} />
                          </td>
                          <td data-label="Edits">{formatNum(s.totalEdits)}</td>
                          <td data-label="Marks moved">{formatNum(s.marksDelta)}</td>
                          <td data-label="Edited by">
                            {s.editedByName || <span className="dam-muted">—</span>}
                            {s.attribution === "backfill" && s.editedByName ? (
                              <span
                                className="dam-chip dam-chip--muted"
                                title="Historical row — attributed to the assigned assistant, not recorded at edit time"
                              >
                                estimated
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── row shape differs per tab; keep the table generic ────────────────────────

function rowKey(row, tab) {
  if (tab === "assignments") return `${row.source}:${row.assignmentId}`;
  if (tab === "classes") return row.classroomId;
  if (tab === "teachers") return row.teacherId;
  return row.personId;
}

function primaryLabel(row, tab) {
  if (tab === "assignments") return row.title;
  if (tab === "classes") return row.className;
  if (tab === "teachers") return row.teacherName;
  return row.name;
}

function secondaryLabel(row, tab) {
  if (tab === "assignments") {
    return row.source === "external"
      ? row.providerName
      : [row.className, row.teacherName].filter(Boolean).join(" · ");
  }
  if (tab === "classes") return row.teacherName;
  if (tab === "teachers") return `${row.classroomCount || 0} classes`;
  return row.email;
}
