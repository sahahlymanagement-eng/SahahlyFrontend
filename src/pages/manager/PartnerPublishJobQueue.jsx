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
import { getPartnerPublishJobs, unblockPartnerPublishDelivery } from "../../api/partnerReports";
import { PARTNERS } from "../../utils/partnerReportProviders";
import "./ManagerAssignments.css";

// Mirrors pages/manager/ReturnJobQueue.jsx — the external-provider
// counterpart, for the queue behind "Publish to IGSpaces" (parent reports)
// and "Publish All" (marks + annotated PDF, kind: marking_publish). One
// monitor tab for both, since both drain through the same
// PartnerPublishJobItem queue / cron/partnerPublishJobWorkerCron.js.

const SPIN_STYLE = { animation: "ma-spin 0.9s linear infinite" };

const KIND_LABEL = {
  assignment_report: "Assignment report",
  monthly_report: "Monthly report",
  marking_publish: "Marks + PDF",
};

function providerLabel(slug) {
  return PARTNERS.find((p) => p.slug === slug)?.label || slug || "Partner";
}

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
  running: { label: "Publishing now", badge: "ma-badge--blue", icon: <FiLoader style={SPIN_STYLE} /> },
  done: { label: "Published", badge: "ma-badge--green", icon: <FiCheck /> },
  failed: { label: "Failed", badge: "ma-badge--red", icon: <FiX /> },
};

function StatusPill({ status, permanent }) {
  if (status === "failed" && permanent) {
    return (
      <span className="ma-badge ma-badge--red" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <FiLock /> Blocked
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

function StatTile({ icon, label, value, tone }) {
  return (
    <div
      className="ma-card"
      style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, minWidth: 160, flex: "1 1 160px" }}
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
  return (
    <>
      <tr>
        <td data-label="Student">
          <strong>{item.studentName || item.studentKey || "Student"}</strong>
        </td>
        <td className="ma-muted" data-label="Time">
          {item.status === "queued" && <>Queued {relativeTimeText(item.createdAt, now)}</>}
          {item.status === "running" && <>Started {relativeTimeText(item.startedAt || item.createdAt, now)}</>}
          {(item.status === "done" || item.status === "failed") && (
            <>
              {item.status === "done" ? "Published" : "Failed"} {relativeTimeText(item.finishedAt, now)}
              {finishedDuration && ` · took ${finishedDuration}`}
            </>
          )}
        </td>
        <td data-label="Status" style={{ textAlign: "right" }}>
          <StatusPill status={item.status} permanent={item.permanent} />
        </td>
      </tr>
      {item.error && (
        <tr className="ma-item-note-row">
          <td colSpan={3}>
            <div style={{ color: "var(--danger)", fontSize: 13 }}>{item.error}</div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Persistent list of IGSpaces report deliveries that failed permanently (4xx) — see IGSpacesReportDelivery.lastErrorPermanent. */
function BlockedDeliveriesBanner({ deliveries, canUnblock, onUnblock, now }) {
  const [collapsed, setCollapsed] = useState(true);
  if (!deliveries.length) return null;

  const headerText = `${deliveries.length} delivery${deliveries.length === 1 ? "" : "ies"} blocked — failed permanently`;

  return (
    <div
      className="ma-card ma-group-card"
      style={{ padding: 0, overflow: "hidden", borderLeft: "4px solid var(--danger)" }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          all: "unset", cursor: "pointer", boxSizing: "border-box", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 8, padding: "12px 16px", width: "100%", flexWrap: "wrap",
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
            IGSpaces rejected these reports permanently (a 4xx — bad classroom mapping, unknown student, auth). They
            won't be retried automatically until the underlying issue is fixed and unblocked, or the content changes.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {deliveries.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{providerLabel(d.provider)}</strong>
                  <span className="ma-muted">
                    {" "}· {KIND_LABEL[d.kind] || d.kind} · {d.studentKey}
                    {d.assignmentId != null ? ` · assignment #${d.assignmentId}` : ""}
                    {d.period?.year ? ` · ${d.period.year}-${String(d.period.month).padStart(2, "0")}` : ""}
                    {" "}· blocked {relativeTimeText(d.blockedAt, now)}
                  </span>
                  {d.reason && <div className="ma-muted" style={{ fontSize: 12 }}>{d.reason}</div>}
                </div>
                {canUnblock && (
                  <button className="msv-btn-ai" onClick={() => onUnblock(d.id)}>I fixed it — Unblock</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * While still running: wall-clock span so far (earliest item queued/started to now).
 * Once settled: sum of each item's own processing time (finishedAt - startedAt), not
 * the wall-clock span of the group — items publish one at a time, so the span between
 * the first and last finish is mostly idle time between submissions, not work done.
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

function PublishGroup({ group, now, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const total = group.items.length;
  const doneCount = group.counts.done;
  const failedCount = group.counts.failed;
  const activeCount = group.counts.running + group.counts.queued;
  const percent = total > 0 ? Math.round(((doneCount + failedCount) / total) * 100) : 0;
  const duration = groupDurationText(group, now);

  const scopeLabel =
    group.kind === "monthly_report"
      ? `${group.period.year}-${String(group.period.month).padStart(2, "0")}`
      : group.assignmentId != null
      ? `Assignment #${group.assignmentId}`
      : "Ungrouped";

  return (
    <div className="ma-card ma-group-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 16, width: "100%", boxSizing: "border-box", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {open ? <FiChevronDown /> : <FiChevronRight />}
          <div>
            <strong>{providerLabel(group.provider)} · {KIND_LABEL[group.kind] || group.kind}</strong>
            <div className="ma-muted">{scopeLabel} · {total} item{total === 1 ? "" : "s"}</div>
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
          <span className="ma-group-stat-chip">{doneCount}/{total} done</span>
          <div className="ma-group-progress" title={`${percent}%`}>
            <div
              className="ma-group-progress-fill"
              style={{ width: `${percent}%`, background: failedCount > 0 ? "var(--danger)" : "var(--success, #2f9e5e)" }}
            />
          </div>
        </div>
      </button>
      {open && (
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

function groupPublishItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = [item.provider, item.kind, item.assignmentId ?? "", item.period?.year ?? "", item.period?.month ?? ""].join("|");
    if (!map.has(key)) {
      map.set(key, {
        provider: item.provider,
        kind: item.kind,
        assignmentId: item.assignmentId,
        period: item.period || {},
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

export default function PartnerPublishJobQueue() {
  const [data, setData] = useState({ running: [], queued: [], history: [], blockedDeliveries: [], canUnblock: false });
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
      const response = await getPartnerPublishJobs({ _ts: Date.now() });
      if (loadId !== latestLoadRef.current) return;
      setData(response || { running: [], queued: [], history: [], blockedDeliveries: [], canUnblock: false });
      setLoadError(null);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (loadId !== latestLoadRef.current) return;
      const message =
        err.code === "ECONNABORTED" || err.code === "ETIMEDOUT"
          ? "The queue took too long to respond. Please try refreshing."
          : err.response?.data?.message || "Could not load the publish queue. Please try refreshing.";
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

  const unblock = async (deliveryId) => {
    try {
      await unblockPartnerPublishDelivery(deliveryId);
      toast.success("Unblocked — the next publish attempt will retry this delivery.");
      setData((current) => ({
        ...current,
        blockedDeliveries: (current.blockedDeliveries || []).filter((d) => String(d.id) !== String(deliveryId)),
      }));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not clear the block");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const allItems = useMemo(() => [...(data.running || []), ...(data.queued || []), ...(data.history || [])], [data]);

  const failedRecentCount = useMemo(() => (data.history || []).filter((i) => i.status === "failed").length, [data.history]);
  const doneRecentCount = useMemo(() => (data.history || []).filter((i) => i.status === "done").length, [data.history]);

  const visibleItems = useMemo(() => {
    let items = allItems;
    if (needsAttentionOnly) {
      items = items.filter((i) => i.status === "failed" || i.permanent);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((i) =>
        [i.studentName, i.studentKey, providerLabel(i.provider), KIND_LABEL[i.kind]].some((f) => String(f || "").toLowerCase().includes(q))
      );
    }
    return items;
  }, [allItems, search, needsAttentionOnly]);

  const groups = useMemo(() => groupPublishItems(visibleItems), [visibleItems]);

  return (
    <div className="ma-root"><main className="ma-main">
      <header className="ma-topbar"><div className="ma-topbar-left">
        <h1 className="ma-topbar-title">Partner Publish Queue</h1>
        <span className="ma-topbar-sub">
          Every &quot;Publish to IGSpaces&quot; and &quot;Publish All&quot; run finishes its work here in the
          background, across every partner. Grouped so you can tell at a glance whether a run is done.
        </span>
        {lastRefreshedAt && <span className="ma-topbar-sub">Last refreshed: {lastRefreshedAt.toLocaleTimeString()}</span>}
      </div><button className="msv-btn-ai" disabled={refreshing} onClick={() => load()}><FiRefreshCw /> {refreshing ? "Refreshing…" : "Refresh"}</button></header>
      <section
        style={{ padding: 24, paddingBottom: 64, display: "flex", flexDirection: "column", gap: 18, flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}
      >
        {loadError && <div className="ma-card" role="alert" style={{ padding: 18, color: "var(--danger)" }}>{loadError}{lastRefreshedAt && " Showing the last loaded queue."}</div>}

        {loading ? <div className="ma-card" style={{ padding: 24 }}>Loading queue…</div> : (!loadError || lastRefreshedAt) && <>
          <BlockedDeliveriesBanner
            deliveries={data.blockedDeliveries || []}
            canUnblock={data.canUnblock}
            onUnblock={unblock}
            now={now}
          />

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", flexShrink: 0 }}>
            <StatTile icon={<FiLoader style={SPIN_STYLE} />} label="Publishing now" value={data.running?.length || 0} tone="var(--primary)" />
            <StatTile icon={<FiClock />} label="Waiting" value={data.queued?.length || 0} tone="var(--muted)" />
            <StatTile icon={<FiCheck />} label="Published recently" value={doneRecentCount} tone="var(--success, #2f9e5e)" />
            <StatTile icon={<FiX />} label="Failed recently" value={failedRecentCount} tone="var(--danger)" />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
            <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
              <FiSearch style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student, partner or report kind…"
                style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 8, border: "1px solid var(--border)", boxSizing: "border-box", background: "var(--surface, #1c2b33)", color: "var(--text-primary)" }}
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
              <PublishGroup
                key={`${group.provider}|${group.kind}|${group.assignmentId}|${group.period?.year}|${group.period?.month}`}
                group={group}
                now={now}
                defaultOpen={group.counts.running + group.counts.queued + group.counts.failed > 0}
              />
            ))
          ) : (
            <div className="ma-card" style={{ padding: 24, textAlign: "center" }}>
              {search || needsAttentionOnly ? "Nothing matches that filter." : "All caught up — nothing is publishing right now."}
            </div>
          )}
        </>}
      </section>
    </main></div>
  );
}
