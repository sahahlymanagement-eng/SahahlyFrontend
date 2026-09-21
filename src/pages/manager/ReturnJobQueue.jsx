import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiLoader,
  FiLock,
  FiRefreshCw,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import "./ManagerAssignments.css";

const SPIN_STYLE = { animation: "ma-spin 0.9s linear infinite" };

/** "2m ago" for anything recent, falling back to a plain date once it's old enough that "ago" stops being useful. */
function relativeTimeText(value, now) {
  if (!value) return "—";
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleString();
}

function formatSeconds(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const remainingSeconds = s % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function durationText(from, to) {
  if (!from || !to) return null;
  return formatSeconds((new Date(to).getTime() - new Date(from).getTime()) / 1000);
}

const STATUS_CONFIG = {
  queued: { label: "Waiting", badge: "ma-badge--gray", icon: <FiClock /> },
  running: { label: "Returning now", badge: "ma-badge--blue", icon: <FiLoader style={SPIN_STYLE} /> },
  done: { label: "Returned", badge: "ma-badge--green", icon: <FiCheck /> },
  failed: { label: "Failed", badge: "ma-badge--red", icon: <FiX /> },
};

function StatusPill({ status, classroomBlocked }) {
  // A classroomBlocked failure is a permanent, known cause (this coursework
  // wasn't created by Sahahly) — visually distinct from an ordinary transient
  // failure so it doesn't read as "just retry and it'll work."
  if (status === "failed" && classroomBlocked) {
    return (
      <span className="ma-badge ma-badge--red" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <FiLock /> Classroom blocked
      </span>
    );
  }
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  return (
    <span className={`ma-badge ${conf.badge}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {conf.icon} {conf.label}
    </span>
  );
}

/** One stat tile in the top summary bar. */
function StatTile({ icon, label, value, tone }) {
  return (
    <div
      className="ma-card"
      style={{
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 160,
        flex: "1 1 160px",
      }}
    >
      <span style={{ fontSize: 22, color: tone, display: "flex" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
        <div className="ma-muted" style={{ fontSize: 13 }}>{label}</div>
      </div>
    </div>
  );
}

function ItemRow({ item, now }) {
  const finishedDuration = item.startedAt && item.finishedAt ? durationText(item.startedAt, item.finishedAt) : null;
  const noteRow = (item.attachmentWarning || item.error) && (
    <tr className="ma-item-note-row">
      <td colSpan={3}>
        {item.attachmentWarning && (
          <div style={{ color: "var(--warning, #c07a00)", fontSize: 13 }}>{item.attachmentWarning}</div>
        )}
        {item.error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{item.error}</div>}
      </td>
    </tr>
  );
  return (
    <>
      <tr>
        <td data-label="Student">
          <strong>{item.studentName || "Student"}</strong>
          {item.gradeOnly && <div className="ma-muted" style={{ fontSize: 12 }}>grade only — nothing to attach</div>}
        </td>
        <td className="ma-muted" data-label="Time">
          {item.status === "queued" && <>Queued {relativeTimeText(item.createdAt, now)}</>}
          {item.status === "running" && <>Started {relativeTimeText(item.startedAt || item.createdAt, now)}</>}
          {(item.status === "done" || item.status === "failed") && (
            <>
              {item.status === "done" ? "Returned" : "Failed"} {relativeTimeText(item.finishedAt, now)}
              {finishedDuration && ` · took ${finishedDuration}`}
            </>
          )}
        </td>
        <td data-label="Status">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            {item.quotaExhausted && (
              <span style={{ color: "var(--warning, #c07a00)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <FiAlertTriangle /> Google quota
              </span>
            )}
            <StatusPill status={item.status} classroomBlocked={item.classroomBlocked} />
          </div>
        </td>
      </tr>
      {noteRow}
    </>
  );
}

/**
 * Persistent list of classrooms Google refuses to attach PDFs to (their
 * coursework wasn't created by Sahahly) — shown regardless of recent
 * activity, since a blocked classroom stays blocked whether or not anyone
 * has clicked Return All on it since it was discovered. This is the primary,
 * always-visible way to notice one of these, rather than relying on someone
 * re-attempting a futile return to regenerate a failed item in history.
 */
function BlockedAssignmentsBanner({ assignments, canUnblock, onUnblock, now }) {
  const [collapsed, setCollapsed] = useState(true);
  if (!assignments.length) return null;

  const headerText = `${assignments.length} classroom${assignments.length === 1 ? "" : "s"} blocked — not created by Sahahly`;

  return (
    <div
      className="ma-card ma-group-card"
      style={{ padding: 0, overflow: "hidden", borderLeft: "4px solid var(--danger)" }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          all: "unset",
          cursor: "pointer",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "12px 16px",
          width: "100%",
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", fontWeight: 700 }}>
          {collapsed ? <FiChevronRight /> : <FiChevronDown />}
          <FiLock /> {headerText}
        </span>
        <span className="ma-muted" style={{ fontWeight: 400, fontSize: 12 }}>
          {collapsed ? "Click to show" : "Click to hide"}
        </span>
      </button>
      {!collapsed && (
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
          <div className="ma-muted" style={{ fontSize: 13 }}>
            Google refuses to attach marked PDFs (or return grades) for these until the assignment is recreated
            through Sahahly. Return All is disabled for them in the Submission Viewer.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {assignments.map((a) => (
              <div
                key={a.assignmentId}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
              >
                <div>
                  <strong>{a.assignmentTitle}</strong>
                  <span className="ma-muted"> · {a.classroomName} · blocked {relativeTimeText(a.blockedAt, now)}</span>
                </div>
                {canUnblock && (
                  <button className="msv-btn-ai" onClick={() => onUnblock(a.assignmentId)}>
                    I fixed it — Unblock
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Everything queued/running/done/failed for one assignment, as one collapsible block. */
/**
 * While still running: wall-clock span so far (earliest item queued/started to now).
 * Once settled: sum of each item's own processing time (finishedAt - startedAt), not
 * the wall-clock span of the group — items return one at a time, so the span between
 * the first and last return is mostly idle time between submissions, not work done.
 */
function groupDurationText(group, now) {
  const stillActive = group.counts.running + group.counts.queued > 0;
  if (stillActive) {
    const starts = group.items.map((i) => i.startedAt || i.createdAt).filter(Boolean).map((d) => new Date(d).getTime());
    if (!starts.length) return null;
    return { label: "Running for", value: durationText(Math.min(...starts), now) };
  }

  const totalSeconds = group.items.reduce((sum, i) => {
    if (!i.startedAt || !i.finishedAt) return sum;
    return sum + Math.max(0, (new Date(i.finishedAt).getTime() - new Date(i.startedAt).getTime()) / 1000);
  }, 0);
  if (totalSeconds <= 0) return null;
  return { label: "Took", value: formatSeconds(totalSeconds) };
}

function AssignmentGroup({ group, now, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const total = group.items.length;
  const doneCount = group.counts.done;
  const failedCount = group.counts.failed;
  const activeCount = group.counts.running + group.counts.queued;
  const settledCount = doneCount + failedCount;
  const percent = total > 0 ? Math.round((settledCount / total) * 100) : 0;
  const duration = groupDurationText(group, now);

  return (
    <div className="ma-card ma-group-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 16,
          width: "100%",
          boxSizing: "border-box",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {open ? <FiChevronDown /> : <FiChevronRight />}
          <div>
            <strong>{group.assignmentTitle}</strong>
            <div className="ma-muted">
              {group.classroomName} · {total} student{total === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div className="ma-group-stats">
          {activeCount > 0 && (
            <span className="ma-group-stat-chip ma-group-stat-chip--active">
              <FiLoader style={SPIN_STYLE} /> {activeCount} in progress
            </span>
          )}
          {failedCount > 0 && (
            <span className="ma-group-stat-chip ma-group-stat-chip--danger">
              <FiX /> {failedCount} failed
            </span>
          )}
          {duration && (
            <span className="ma-group-stat-chip">
              <FiClock /> {duration.label} {duration.value}
            </span>
          )}
          <span className="ma-group-stat-chip">{doneCount}/{total} returned</span>
          <div className="ma-group-progress" title={`${percent}%`}>
            <div
              className="ma-group-progress-fill"
              style={{ width: `${percent}%`, background: failedCount > 0 ? "var(--danger)" : "var(--success, #2f9e5e)" }}
            />
          </div>
        </div>
      </button>
      {open && (
        // On desktop this stays bounded with its own scrollbar so a run of
        // 20-30 students doesn't push the rest of the page down; on
        // tablet/phone (see .ma-group-body) it grows to full height instead,
        // since a second small scroller inside an already-short viewport is
        // easy to miss.
        <div className="ma-group-body">
          <table className="ma-item-table sah-table--cards">
            <thead>
              <tr>
                <th>Student</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <ItemRow key={item._id} item={item} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Group flat items by assignment, with per-group status counts, active/failing groups first. */
function groupByAssignment(items) {
  const map = new Map();
  for (const item of items) {
    const key = String(item.assignmentId);
    if (!map.has(key)) {
      map.set(key, {
        assignmentId: item.assignmentId,
        assignmentTitle: item.assignmentTitle || "Untitled assignment",
        classroomName: item.classroomName || "Classroom not provided",
        items: [],
        counts: { queued: 0, running: 0, done: 0, failed: 0 },
      });
    }
    const group = map.get(key);
    group.items.push(item);
    group.counts[item.status] = (group.counts[item.status] || 0) + 1;
  }

  const groups = [...map.values()];
  for (const group of groups) {
    group.items.sort((a, b) => {
      const rank = { running: 0, queued: 1, failed: 2, done: 3 };
      const byStatus = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (byStatus !== 0) return byStatus;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  // Groups that still need eyes on them (in progress, or something failed)
  // float to the top; fully-settled groups sink to the bottom.
  groups.sort((a, b) => {
    const aActive = a.counts.running + a.counts.queued > 0;
    const bActive = b.counts.running + b.counts.queued > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aFailed = a.counts.failed > 0;
    const bFailed = b.counts.failed > 0;
    if (aFailed !== bFailed) return aFailed ? -1 : 1;
    return 0;
  });

  return groups;
}

export default function ReturnJobQueue() {
  const [data, setData] = useState({ running: [], queued: [], history: [], blockedAssignments: [], canUnblock: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const latestLoadRef = useRef(0);
  const activeLoadRef = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (activeLoadRef.current) return;
    const controller = new AbortController();
    activeLoadRef.current = controller;
    const loadId = ++latestLoadRef.current;
    if (!quiet) setRefreshing(true);
    try {
      const response = await api.get("/return-job-queue", {
        timeout: 30000,
        signal: controller.signal,
        params: { _ts: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      if (loadId !== latestLoadRef.current) return;
      setData(response.data || { running: [], queued: [], history: [], blockedAssignments: [], canUnblock: false });
      setLoadError(null);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (loadId !== latestLoadRef.current) return;
      const message =
        err.code === "ECONNABORTED" || err.code === "ETIMEDOUT"
          ? "The queue took too long to respond. Please try refreshing."
          : err.response?.data?.message || "Could not load the return job queue. Please try refreshing.";
      setLoadError(message);
      if (!quiet) toast.error(message);
    } finally {
      if (loadId === latestLoadRef.current) {
        activeLoadRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => load(), 0);
    const timer = setInterval(() => load(true), 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      latestLoadRef.current += 1;
      activeLoadRef.current?.abort();
      activeLoadRef.current = null;
    };
  }, [load]);

  const unblock = async (assignmentId) => {
    try {
      await api.post(`/return-job-queue/${assignmentId}/unblock`);
      toast.success("Unblocked — the next Return All attempt will re-check this classroom.");
      setData((current) => ({
        ...current,
        blockedAssignments: (current.blockedAssignments || []).filter(
          (a) => String(a.assignmentId) !== String(assignmentId)
        ),
      }));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not clear the block");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const allItems = useMemo(
    () => [...(data.running || []), ...(data.queued || []), ...(data.history || [])],
    [data]
  );

  const failedRecentCount = useMemo(
    () => (data.history || []).filter((i) => i.status === "failed").length,
    [data.history]
  );
  const doneRecentCount = useMemo(
    () => (data.history || []).filter((i) => i.status === "done").length,
    [data.history]
  );

  const visibleItems = useMemo(() => {
    let items = allItems;
    if (needsAttentionOnly) {
      items = items.filter((i) => i.status === "failed" || i.attachmentWarning || i.quotaExhausted);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((i) =>
        [i.studentName, i.assignmentTitle, i.classroomName].some((f) => String(f || "").toLowerCase().includes(q))
      );
    }
    return items;
  }, [allItems, search, needsAttentionOnly]);

  const groups = useMemo(() => groupByAssignment(visibleItems), [visibleItems]);

  return (
    <div className="ma-root"><main className="ma-main">
      <header className="ma-topbar"><div className="ma-topbar-left">
        <h1 className="ma-topbar-title">Return Job Queue</h1>
        <span className="ma-topbar-sub">
          Every classroom&apos;s &quot;Return All&quot; finishes its Google Classroom work here in the background.
          Grouped by assignment so you can tell at a glance whether a run is done.
        </span>
        {lastRefreshedAt && <span className="ma-topbar-sub">Last refreshed: {lastRefreshedAt.toLocaleTimeString()}</span>}
      </div><button className="msv-btn-ai" disabled={refreshing} onClick={() => load()}><FiRefreshCw /> {refreshing ? "Refreshing…" : "Refresh"}</button></header>
      <section
        style={{
          padding: 24,
          paddingBottom: 64,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {loadError && <div className="ma-card" role="alert" style={{ padding: 18, color: "var(--danger)" }}>{loadError}{lastRefreshedAt && " Showing the last loaded queue."}</div>}

        {loading ? <div className="ma-card" style={{ padding: 24 }}>Loading queue…</div> : (!loadError || lastRefreshedAt) && <>
          <BlockedAssignmentsBanner
            assignments={data.blockedAssignments || []}
            canUnblock={data.canUnblock}
            onUnblock={unblock}
            now={now}
          />

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", flexShrink: 0 }}>
            <StatTile icon={<FiLoader style={SPIN_STYLE} />} label="Returning now" value={data.running?.length || 0} tone="var(--primary)" />
            <StatTile icon={<FiClock />} label="Waiting" value={data.queued?.length || 0} tone="var(--muted)" />
            <StatTile icon={<FiCheck />} label="Returned recently" value={doneRecentCount} tone="var(--success, #2f9e5e)" />
            <StatTile icon={<FiX />} label="Failed recently" value={failedRecentCount} tone="var(--danger)" />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
            <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
              <FiSearch style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student, assignment or classroom…"
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 32px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  boxSizing: "border-box",
                  background: "var(--surface, #1c2b33)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <button
              className="msv-btn-ai"
              style={needsAttentionOnly ? undefined : { background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              onClick={() => setNeedsAttentionOnly((v) => !v)}
            >
              <FiAlertTriangle /> {needsAttentionOnly ? "Showing: needs attention" : "Show only what needs attention"}
            </button>
          </div>

          {groups.length ? (
            groups.map((group) => (
              <AssignmentGroup
                key={group.assignmentId}
                group={group}
                now={now}
                defaultOpen={group.counts.running + group.counts.queued + group.counts.failed > 0}
              />
            ))
          ) : (
            <div className="ma-card" style={{ padding: 24, textAlign: "center" }}>
              {search || needsAttentionOnly
                ? "Nothing matches that filter."
                : "All caught up — nothing is returning right now."}
            </div>
          )}
        </>}
      </section>
    </main></div>
  );
}
