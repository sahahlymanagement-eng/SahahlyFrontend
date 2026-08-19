import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import {
  FiTarget,
  FiCheckSquare,
  FiSearch,
  FiRefreshCw,
  FiEdit3,
  FiMove,
  FiFileText,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertTriangle,
  FiX,
  FiUsers,
  FiBookOpen,
  FiUser,
  FiClipboard,
  FiPlusCircle,
  FiHash,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";
import "./DirectorAccuracyMetrics.css";

/**
 * The Assignments Metrics tab.
 *
 * Kept as a named constant because it is the one tab that is NOT a slice of the
 * /overview payload: it has its own endpoint, its own columns and its own
 * drilldown, so every place that branches on it has to branch on the same
 * string. See services/assignmentMetricsService.js for why it is a separate
 * call — its per-question drilldown re-diffs marking blobs and could never be
 * part of the org-wide overview.
 */
const ASSIGNMENT_METRICS_TAB = "assignmentMetrics";

const TABS = [
  { key: "assignments", label: "Assignments", icon: <FiFileText /> },
  { key: "classes", label: "Classes", icon: <FiBookOpen /> },
  { key: "teachers", label: "Teachers", icon: <FiUser /> },
  { key: "assistants", label: "Assistants", icon: <FiUsers /> },
  { key: ASSIGNMENT_METRICS_TAB, label: "Assignments Metrics", icon: <FiClipboard /> },
];

const PAGE_SIZE = 20;

function formatNum(n) {
  return (Number(n) || 0).toLocaleString();
}

/**
 * Every edit a human made, of either kind.
 *
 * Correction edits (mark/feedback changed) and mapping edits (annotation
 * dragged into place) are counted on separate axes and a question can land in
 * both, so this is a headline workload figure — not a partition, and never a
 * denominator for either column.
 */
function allEdits(row) {
  return (Number(row?.totalEdits) || 0) + (Number(row?.placementChanges) || 0);
}

/** An average with nothing measured is unknown — "0.0" would read as spotless. */
function formatAvg(value) {
  return value == null ? "—" : Number(value).toFixed(1);
}

/** A zero is real information here; blank it out and the column reads as broken. */
function formatCount(value) {
  return formatNum(value);
}

/** A rate is null when there was nothing to judge — never show 100%. */
function formatPct(value) {
  return value == null ? "—" : `${value}%`;
}

/**
 * The accuracy denominator, spelled out: mark edits against every mark on the
 * table. The same 50-mark exam sat by two students is judged out of 100, so
 * 15 edits across the pair read 85% — not 70% twice. Null rather than "0 of 0"
 * when no mark scheme was captured, matching the "—" the rate itself shows.
 */
function marksHint(row) {
  const total = Number(row?.maxMarksTotal) || 0;
  if (!total) return null;
  return `${formatNum(row?.marksChanged)} of ${formatNum(total)} marks edited`;
}

/** Colour band for an accuracy percentage. Null reads as neutral, not bad. */
function accuracyTone(value) {
  if (value == null) return "";
  if (value >= 90) return "dam-good";
  if (value >= 75) return "dam-ok";
  return "dam-warn";
}

function AccuracyBar({ value, hint }) {
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
      {hint ? <span className="dam-subline">{hint}</span> : null}
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
  const period = useDashboardPeriod();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("assignments");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Assignments Metrics has its own endpoint and its own drilldown.
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [questionDetail, setQuestionDetail] = useState(null);
  const [questionLoading, setQuestionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/director-accuracy/overview", {
        params: period.params,
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load accuracy metrics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period.params.from, period.params.to]);

  const loadMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      const res = await api.get("/director-accuracy/assignment-metrics", {
        params: period.params,
      });
      setMetrics(res.data);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to load assignment metrics"
      );
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, [period.params.from, period.params.to]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetched on demand rather than with the overview: it is a second query the
  // other four tabs never need, and a director who only wants accuracy rates
  // should not pay for it.
  useEffect(() => {
    if (tab === ASSIGNMENT_METRICS_TAB) loadMetrics();
  }, [tab, loadMetrics]);

  // A new tab or a new search means the old page number is meaningless.
  useEffect(() => {
    setPage(1);
  }, [tab, search, period.params.from, period.params.to]);

  const rows = useMemo(() => {
    const all =
      tab === ASSIGNMENT_METRICS_TAB
        ? metrics?.assignments || []
        : data?.[tab] || [];
    const q = search.trim().toLowerCase();
    if (!q) return all;

    return all.filter((r) =>
      [
        r.title,
        r.className,
        r.teacherName,
        r.assistantName,
        r.name,
        r.providerName,
        r.email,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [data, metrics, tab, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const overall = data?.overall;
  const onMetricsTab = tab === ASSIGNMENT_METRICS_TAB;
  const busy = onMetricsTab ? metricsLoading : loading;

  /**
   * Per-question drilldown. `source` decides which collection the backend
   * reads: classroom assignments are keyed by ObjectId, partner assignments by
   * the partner's own numeric id.
   */
  const openQuestionDetail = async (row) => {
    const source = row.source === "classroom" ? "classroom" : row.provider;
    try {
      setQuestionLoading(true);
      setQuestionDetail({ loading: true });
      const res = await api.get(
        `/director-accuracy/assignment-metrics/${source}/${row.assignmentId}`,
        { params: period.params }
      );
      setQuestionDetail(res.data);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to load question metrics"
      );
      setQuestionDetail(null);
    } finally {
      setQuestionLoading(false);
    }
  };

  const openDetail = async (assignmentId) => {
    try {
      setDetailLoading(true);
      setDetail({ loading: true });
      const res = await api.get(`/director-accuracy/assignment/${assignmentId}`, {
        params: period.params,
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
          onClick={() => {
            loadData();
            if (onMetricsTab) loadMetrics();
          }}
          disabled={busy}
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

      <div className="dam-summary-row">
        <SummaryPill
          icon={<FiTarget />}
          label="Mark accuracy"
          value={formatPct(overall?.accuracyRate)}
          sub={marksHint(overall) || "No mark scheme captured"}
          tone={overall?.accuracyRate != null && overall.accuracyRate < 75 ? "warn" : "good"}
        />
        <SummaryPill
          icon={<FiCheckSquare />}
          label="Question accuracy"
          value={formatPct(overall?.questionAccuracyRate)}
          sub={`${formatNum(overall?.questionsEdited)} of ${formatNum(
            overall?.questionsTotal
          )} questions edited`}
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
          label="Total edits"
          value={formatNum(allEdits(overall))}
          sub="Correction + mapping edits"
        />
        <SummaryPill
          icon={<FiEdit3 />}
          label="Correction edits"
          value={formatNum(overall?.totalEdits)}
          sub={`${formatNum(overall?.marksChanged)} marks · ${formatNum(
            overall?.reasonOnlyChanges
          )} feedback only`}
        />
        <SummaryPill
          icon={<FiMove />}
          label="Mapping edits"
          value={formatNum(overall?.placementChanges)}
          sub="Annotations moved to the right place"
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
            {t.label} (
            {t.key === ASSIGNMENT_METRICS_TAB
              ? (metrics?.assignments || []).length
              : (data?.[t.key] || []).length}
            )
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

      {!onMetricsTab && (
        <p className="dam-note">
          <strong>Accuracy</strong> is <strong>1 − (mark edits ÷ marks
          available)</strong>. The denominator is every paper's own mark total
          added up, not one copy of the mark scheme — a 50-mark exam sat by two
          students is judged out of 100, so 15 mark edits across the pair read
          85% rather than 70% each. The numerator counts questions whose mark a
          human changed, one mark of the total each, whether the mark moved by 1
          or by 6; feedback-only rewrites and mapping edits leave a paper's marks
          alone and never move this rate. <strong>Question accuracy</strong>,
          shown beside the questions count, is the older measure: the share of
          questions that came through review untouched, feedback rewrites
          included.
        </p>
      )}

      {tab === "assistants" && (
        <p className="dam-note">
          Correction edits (a question's mark or feedback changed) and mapping
          edits (an annotated question dragged to a new place and confirmed) are
          counted separately — a question that was both re-graded and moved
          appears in both columns, and only correction edits move the accuracy
          rate. Both are credited to whoever actually saved them, measured per
          save. A paper edited by an assistant and then a quality reviewer is
          split between them, so these figures do not add up to the papers'
          totals — if one person changes a mark and another changes it back,
          both did work while the paper ends up matching the AI.
        </p>
      )}

      {onMetricsTab && (
        <p className="dam-note">
          One row per assignment, heaviest correction load first. The two edit
          types are kept on separate columns and never summed:{" "}
          <strong>correction edits</strong> mean the AI marked a question wrong,{" "}
          <strong>mapping edits</strong> mean it marked it right but drew the
          badge in the wrong place. A question can be in both, and an assignment
          averaging 8 mapping and 0.5 correction edits is an annotation problem,
          not a marking one — adding them would make both read the same. Both
          divide by the papers that have a comparable AI original, not by every
          graded paper, which would flatter any assignment holding papers whose AI
          result was never pinned. Both count <em>every touch across every save</em>,
          so the <strong>distinct</strong> line shows how many separate questions
          were actually wrong and <strong>× re-saved</strong> how much is repeat
          saving; either column is flagged when it exceeds the exam's question
          count, which distinct work cannot. <strong>Questions</strong> is the size
          of the fullest paper in the set. Open an assignment to see which
          individual questions cost the edits.
        </p>
      )}

      {busy && (
        <p className="dam-loading">
          {onMetricsTab ? "Loading assignment metrics…" : "Loading accuracy metrics…"}
        </p>
      )}

      {!busy && !rows.length && (
        <p className="dam-loading">
          {search
            ? `Nothing matches "${search}".`
            : onMetricsTab
            ? "No graded papers in this range."
            : "No marked papers with a recorded AI comparison in this range."}
        </p>
      )}

      {!busy && rows.length > 0 && onMetricsTab && (
        <AssignmentMetricsTable rows={visible} onOpen={openQuestionDetail} />
      )}

      {!busy && rows.length > 0 && !onMetricsTab && (
        <>
          <div className="dam-table-card">
            <div className="dam-table-wrap">
              <table className="dam-table sah-table--cards">
                <thead>
                  <tr>
                    <th>{TABS.find((t) => t.key === tab)?.label.replace(/s$/, "")}</th>
                    <th title="1 − (mark edits ÷ marks available). Every paper adds its own mark scheme to the denominator, so a 50-mark exam sat by two students is judged out of 100 and 15 mark edits across the pair read 85%.">
                      Accuracy
                    </th>
                    <th title="Every change to a question's mark or feedback, including repeats and reverts. Two questions re-graded on one paper is 2.">
                      Correction Edits
                    </th>
                    <th title="Every annotated question dragged to a new place and confirmed. One annotation moved is 1.">
                      Mapping Edits
                    </th>
                    <th>Papers</th>
                    <th title="Distinct questions that needed at least one correction, and the share that came through untouched">
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
                        <AccuracyBar value={row.accuracyRate} hint={marksHint(row)} />
                      </td>
                      <td data-label="Correction Edits">
                        {formatNum(row.totalEdits)}
                      </td>
                      <td data-label="Mapping Edits">
                        {formatNum(row.placementChanges)}
                      </td>
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
                          / {formatNum(row.questionsTotal)} (
                          {formatPct(row.questionAccuracyRate)} clean)
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
        </>
      )}

      {!busy && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {detail && (
        <AssignmentAccuracyDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
        />
      )}

      {questionDetail && (
        <AssignmentQuestionMetricsModal
          detail={questionDetail}
          loading={questionLoading}
          onClose={() => setQuestionDetail(null)}
        />
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
/** Escape-to-close and background scroll-lock, shared by both modals here. */
function useModalChrome(onClose) {
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
}

function AssignmentAccuracyDetailModal({ detail, loading, onClose }) {
  useModalChrome(onClose);

  return createPortal(
    <div className="dam-modal-backdrop" onClick={onClose}>
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
            onClick={onClose}
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>

        {loading && !detail.assignment ? (
          <p className="dam-loading">Loading detail…</p>
        ) : null}

        {detail.assignment && (
          <div className="dam-modal-body">
            <div className="dam-summary-row dam-summary-row--compact">
              <SummaryPill
                icon={<FiTarget />}
                label="Mark accuracy"
                value={formatPct(detail.totals?.accuracyRate)}
                sub={marksHint(detail.totals)}
              />
              <SummaryPill
                icon={<FiCheckSquare />}
                label="Question accuracy"
                value={formatPct(detail.totals?.questionAccuracyRate)}
              />
              <SummaryPill
                icon={<FiEdit3 />}
                label="Total edits"
                value={formatNum(allEdits(detail.totals))}
              />
              <SummaryPill
                icon={<FiEdit3 />}
                label="Correction edits"
                value={formatNum(detail.totals?.totalEdits)}
              />
              <SummaryPill
                icon={<FiMove />}
                label="Mapping edits"
                value={formatNum(detail.totals?.placementChanges)}
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
                    <th title="1 − (mark edits ÷ this paper's total marks)">
                      Accuracy
                    </th>
                    <th title="Marks or feedback changed on this paper">
                      Correction Edits
                    </th>
                    <th title="Annotations dragged to a new place on this paper">
                      Mapping Edits
                    </th>
                    <th>Marks moved</th>
                    <th>Edited by</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.submissions || []).map((s) => (
                    <tr key={s.submissionId}>
                      <td data-label="Student">{s.studentName}</td>
                      <td data-label="Accuracy">
                        <AccuracyBar value={s.accuracyRate} hint={marksHint(s)} />
                      </td>
                      <td data-label="Correction Edits">
                        {formatNum(s.totalEdits)}
                      </td>
                      <td data-label="Mapping Edits">
                        {formatNum(s.placementChanges)}
                      </td>
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
    </div>,
    document.body
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

// ── Assignments Metrics ──────────────────────────────────────────────────────

/**
 * One row per assignment: what went out, how big the paper was, and how much
 * hand-correction each PDF cost. Its own table rather than more columns on the
 * generic one above, because none of these are accuracy rates — they are counts
 * and averages, and folding them in would mean a dozen columns that mean
 * nothing to each other.
 */
function AssignmentMetricsTable({ rows, onOpen }) {
  return (
    <div className="dam-table-card">
      <div className="dam-table-wrap">
        <table className="dam-table dam-table--metrics sah-table--cards">
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Teacher</th>
              <th>Assistant</th>
              <th title="Papers we produced a mark for, and how many of those actually went back to the student or the partner">
                PDFs graded / published
              </th>
              <th title="Questions on the fullest paper in this set">Questions</th>
              <th title="A question's mark, feedback or existence changed — the AI marked it wrong. Per graded PDF, over the papers with a comparable AI original. Counts every touch across every save, so the second line gives the distinct-question count, which cannot exceed the exam size.">
                Correction edits / PDF
              </th>
              <th title="A question's annotation was dragged to a different page or height — the AI marked it right but drew the badge in the wrong place. Counted independently: a question can be in both columns.">
                Mapping edits / PDF
              </th>
              <th title="Questions the AI never produced that a reviewer typed in, counted across every paper">
                Added manually
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td data-label="Assignment">
                  <strong>{row.title}</strong>
                  <span className="dam-muted"> · {row.className}</span>
                  {row.section ? (
                    <span className="dam-muted"> · {row.section}</span>
                  ) : null}
                  {row.source === "partner" ? (
                    <span
                      className="dam-chip dam-chip--muted"
                      title="Grading partner assignment — no classroom or teacher of ours"
                    >
                      partner
                    </span>
                  ) : null}
                </td>
                <td data-label="Teacher">{row.teacherName}</td>
                <td data-label="Assistant">
                  {row.assistantName || <span className="dam-muted">—</span>}
                </td>
                <td data-label="PDFs graded / published">
                  <strong>{formatCount(row.papersGraded)}</strong>
                  <span className="dam-muted">
                    {" "}
                    / {formatCount(row.papersPublished)}
                  </span>
                  {row.papersMeasured !== row.papersGraded ? (
                    <span
                      className="dam-chip dam-chip--muted"
                      title={`Average edits is measured over ${formatCount(
                        row.papersMeasured
                      )} of these papers — the rest have no pinned AI original to compare against`}
                    >
                      {formatCount(row.papersMeasured)} measured
                    </span>
                  ) : null}
                </td>
                <td data-label="Questions">{formatCount(row.questionsInExam)}</td>
                <td data-label="Correction edits / PDF">
                  <strong className={row.correctionExceedsExamSize ? "dam-warn" : undefined}>
                    {formatAvg(row.avgCorrectionEditsPerPaper)}
                  </strong>
                  {row.avgQuestionsEditedPerPaper != null ? (
                    <span
                      className="dam-subline"
                      title="Distinct questions corrected on an average paper. Bounded by the exam size, so this is the figure to read as marking quality."
                    >
                      {formatAvg(row.avgQuestionsEditedPerPaper)} distinct
                      {row.editRepeatFactor != null && row.editRepeatFactor > 1 ? (
                        <span
                          className="dam-muted"
                          title={`Each corrected question was saved ${formatAvg(
                            row.editRepeatFactor
                          )}× on average — that multiple is what lifts the count above the distinct figure`}
                        >
                          {" "}
                          · {formatAvg(row.editRepeatFactor)}× re-saved
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {row.correctionExceedsExamSize ? (
                    <span
                      className="dam-chip dam-chip--warn"
                      title={`Higher than the ${formatCount(
                        row.questionsInExam
                      )} questions on the paper, so it cannot be breadth of corrections — these papers were saved repeatedly and every save re-counted its changes`}
                    >
                      repeat saves
                    </span>
                  ) : null}
                </td>
                <td data-label="Mapping edits / PDF">
                  <strong className={row.mappingExceedsExamSize ? "dam-warn" : undefined}>
                    {formatAvg(row.avgMappingEditsPerPaper)}
                  </strong>
                  {row.placementChanges > 0 ? (
                    <span
                      className="dam-subline"
                      title="Every annotation moved across this assignment"
                    >
                      {formatCount(row.placementChanges)} total
                    </span>
                  ) : null}
                  {row.mappingExceedsExamSize ? (
                    <span
                      className="dam-chip dam-chip--warn"
                      title={`Higher than the ${formatCount(
                        row.questionsInExam
                      )} questions on the paper, so the same annotations were re-saved rather than many being misplaced — usually badge coordinates being re-derived on save`}
                    >
                      repeat saves
                    </span>
                  ) : null}
                </td>
                <td data-label="Added manually">
                  {row.questionsAdded > 0 ? (
                    <strong className="dam-warn">
                      {formatCount(row.questionsAdded)}
                    </strong>
                  ) : (
                    <span className="dam-muted">0</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="dam-detail-btn"
                    onClick={() => onOpen(row)}
                  >
                    Questions
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Papers alongside the marks behind them.
 *
 * The two answer different questions — how often reviewers had to touch this
 * question, versus how much mark weight the AI got wrong — and a question can
 * top one and be unremarkable on the other, so neither stands in for the other.
 */
function MarkCell({ papers, marks, tone }) {
  if (!papers) return <span className="dam-muted">0</span>;
  return (
    <span className={tone}>
      <strong>{formatCount(papers)}</strong>
      <span className="dam-muted"> ({formatAvg(marks)}m)</span>
    </span>
  );
}

/**
 * Per-question drilldown for one assignment.
 *
 * The edit columns come from two different sources and can legitimately
 * disagree — see services/assignmentMetricsService.js. `Edits` is every paper
 * the question was ever touched on, accumulated across saves, so it remembers a
 * correction that was later undone. `Added +` and `Misused` diff the current
 * result against the AI's, so they do not. The notes under the table say so
 * wherever that gap is visible.
 */
function AssignmentQuestionMetricsModal({ detail, loading, onClose }) {
  useModalChrome(onClose);

  const totals = detail.totals;
  const questions = detail.questions || [];

  return createPortal(
    <div className="dam-modal-backdrop" onClick={onClose}>
      <div
        className="dam-modal dam-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Assignment question metrics"
      >
        <div className="dam-modal-header">
          <div>
            <p className="dam-modal-eyebrow">Question metrics</p>
            <h3>{detail.assignment?.title || "Loading…"}</h3>
            {detail.assignment ? (
              <p className="dam-modal-sub">
                {detail.assignment.className}
                {detail.assignment.section ? ` · ${detail.assignment.section}` : ""}
                {" · "}
                {detail.assignment.teacherName}
                {detail.assignment.assistantName
                  ? ` · ${detail.assignment.assistantName}`
                  : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="dam-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>

        {loading && !detail.assignment ? (
          <p className="dam-loading">Loading question metrics…</p>
        ) : null}

        {detail.assignment && (
          <div className="dam-modal-body">
            <div className="dam-summary-row dam-summary-row--compact">
              <SummaryPill
                icon={<FiFileText />}
                label="PDFs graded"
                value={formatCount(totals?.papersGraded)}
                sub={`${formatCount(totals?.papersPublished)} published`}
              />
              <SummaryPill
                icon={<FiHash />}
                label="Questions"
                value={formatCount(totals?.questionsInExam)}
              />
              <SummaryPill
                icon={<FiEdit3 />}
                label="Correction edits / PDF"
                value={formatAvg(totals?.avgCorrectionEditsPerPaper)}
                sub={`${formatAvg(totals?.avgQuestionsEditedPerPaper)} distinct${
                  totals?.editRepeatFactor != null && totals.editRepeatFactor > 1
                    ? ` · ${formatAvg(totals.editRepeatFactor)}× re-saved`
                    : ""
                }`}
                tone={totals?.correctionExceedsExamSize ? "warn" : undefined}
              />
              <SummaryPill
                icon={<FiMove />}
                label="Mapping edits / PDF"
                value={formatAvg(totals?.avgMappingEditsPerPaper)}
                sub={`${formatCount(
                  totals?.questionsWithMappingFixes
                )} of ${formatCount(totals?.questionsInExam)} questions moved`}
                tone={totals?.mappingExceedsExamSize ? "warn" : undefined}
              />
              <SummaryPill
                icon={<FiTrendingUp />}
                label="Marks added"
                value={formatCount(totals?.marksIncreased)}
                sub="Papers where a mark was raised"
              />
              <SummaryPill
                icon={<FiTrendingDown />}
                label="Marks misused"
                value={formatCount(totals?.marksDecreased)}
                sub="Papers where a mark was taken back"
                tone="warn"
              />
              <SummaryPill
                icon={<FiPlusCircle />}
                label="Added manually"
                value={formatCount(totals?.questionsAdded)}
                sub="Questions the AI never produced"
                tone={totals?.questionsAdded > 0 ? "warn" : undefined}
              />
            </div>

            {!questions.length ? (
              <p className="dam-loading">
                No questions to show — no graded paper in this range carries a
                question set.
              </p>
            ) : (
              <div className="dam-table-wrap">
                <table className="dam-table dam-table--metrics sah-table--cards">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th title="Marks available for this question">Max</th>
                      <th title="Papers on which this question's mark, feedback or existence was changed — the AI marked it wrong. Counted across every save, so a correction later reverted still counts.">
                        Correction edits
                      </th>
                      <th title="Papers on which this question's annotation was dragged to a different page or height — the AI marked it right but drew the badge in the wrong place. Independent of the correction column: a question can be in both.">
                        Mapping edits
                      </th>
                      <th title="Papers where a reviewer raised the AI's mark, and the marks they gave back">
                        Added +
                      </th>
                      <th title="Papers where a reviewer took marks back off the AI, and how many marks">
                        Misused
                      </th>
                      <th title="Papers where only the feedback text was rewritten">
                        Feedback only
                      </th>
                      <th title="Papers where the AI never produced this question and a reviewer typed it in">
                        Added manually
                      </th>
                      <th>Edited by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q) => (
                      <tr key={q.key}>
                        <td data-label="Question">
                          <strong>{q.label}</strong>
                          {q.occurrence > 1 ? (
                            <span
                              className="dam-muted"
                              title="This paper prints the same question number more than once; this is the nth of them"
                            >
                              {" "}
                              #{q.occurrence}
                            </span>
                          ) : null}
                          {q.papers !== totals?.papersGraded ? (
                            <span
                              className="dam-muted"
                              title="Papers this question appears on"
                            >
                              {" "}
                              · {formatCount(q.papers)} papers
                            </span>
                          ) : null}
                        </td>
                        <td data-label="Max">
                          {q.maxMarks == null ? (
                            <span className="dam-muted">—</span>
                          ) : (
                            formatAvg(q.maxMarks)
                          )}
                        </td>
                        <td data-label="Correction edits">
                          <strong>{formatCount(q.correctionEdits)}</strong>
                          {q.correctionRate != null ? (
                            <span className="dam-muted"> ({q.correctionRate}%)</span>
                          ) : null}
                        </td>
                        <td data-label="Mapping edits">
                          <strong>{formatCount(q.mappingEdits)}</strong>
                          {q.mappingRate != null ? (
                            <span className="dam-muted"> ({q.mappingRate}%)</span>
                          ) : null}
                        </td>
                        <td data-label="Added +">
                          <MarkCell
                            papers={q.marksAddedPapers}
                            marks={q.marksAdded}
                            tone="dam-good"
                          />
                        </td>
                        <td data-label="Misused">
                          <MarkCell
                            papers={q.marksRemovedPapers}
                            marks={q.marksRemoved}
                            tone="dam-warn"
                          />
                        </td>
                        <td data-label="Feedback only">
                          {formatCount(q.reasonOnlyPapers)}
                        </td>
                        <td data-label="Added manually">
                          {q.addedManually ? (
                            <span
                              className="dam-chip dam-chip--warn"
                              title={`Typed in by a reviewer on ${formatCount(
                                q.addedManuallyPapers
                              )} paper(s) — the AI never produced it`}
                            >
                              {formatCount(q.addedManuallyPapers)} added
                            </span>
                          ) : (
                            <span className="dam-muted">—</span>
                          )}
                        </td>
                        <td data-label="Edited by">
                          {q.editors?.length ? (
                            <span className="dam-editors">
                              {q.editors.map((e) => (
                                <span
                                  key={e.personId}
                                  className="dam-chip"
                                  title={`${e.name} corrected this question on ${formatCount(
                                    e.papers
                                  )} paper(s)`}
                                >
                                  {e.name} · {formatCount(e.papers)}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="dam-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="dam-note">
              The two edit types are independent axes, not a split of one total: a
              question re-marked <em>and</em> dragged into place counts 1 on each,
              and one that was only dragged counts 0 corrections. A high{" "}
              <strong>correction</strong> rate means the AI cannot mark this
              question; a high <strong>mapping</strong> rate means it cannot find
              where the answer is written. Those are different fixes.
              <br />
              Both columns accumulate across saves, so an edit that was later
              undone still counts. <strong>Added +</strong> and{" "}
              <strong>Misused</strong> instead compare the paper as it stands now
              against the AI's original, so they cannot see an undone correction —
              which is why they can total less than the correction column.
            </p>

            {totals?.papersWithoutBaseline > 0 && (
              <p className="dam-note dam-note--warn">
                {formatCount(totals.papersWithoutBaseline)} of{" "}
                {formatCount(totals.papersGraded)} papers have no pinned AI
                original to compare against
                {detail.assignment?.source === "partner"
                  ? " — publishing to a partner clears it"
                  : ""}
                . Their <strong>correction edits</strong> still count — that
                column comes from persisted data — but they contribute nothing to
                mapping edits, Added +, Misused or Added manually, so those
                columns understate this assignment.
              </p>
            )}

            {detail.attributionAvailable === false && (
              <p className="dam-note">
                <strong>Edited by</strong> is empty for grading partners: that
                flow records one net diff per paper with no per-save history, so
                there is nothing to attribute to a person. Guessing the delegated
                assistant would be inventing data.
              </p>
            )}

            {detail.truncated && (
              <p className="dam-note dam-note--warn">
                Showing the first {formatCount(detail.paperLimit)} papers only —
                this assignment has more, so every count above is a floor.
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
