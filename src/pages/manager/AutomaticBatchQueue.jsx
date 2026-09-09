import { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowDown, FiArrowUp, FiClock, FiRefreshCw, FiTrash2, FiUser, FiUsers } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";
import { getRoleName } from "../../utils/authRoutes";
import { getStoredUser } from "../../utils/session";
import { sahahlyModelLabel } from "../../utils/markingCost";

const dateText = (value) => value ? new Date(value).toLocaleString() : "—";

function elapsedText(value, now) {
  if (!value) return "—";
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function durationText(from, to) {
  if (!from || !to) return "Not recorded";
  const seconds = Math.max(
    0,
    Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 1000)
  );
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function providerStateLabel(state) {
  if (!state) return null;
  if (state === "Saving results") return "Saving results";
  return String(state).replace(/^JOB_STATE_/, "").replace(/_/g, " ").toLowerCase();
}

function stageLabel(stage) {
  if (stage === "saving_results") return "Saving results";
  if (stage === "waiting_for_gemini") return "Waiting for Gemini";
  if (stage === "uploading") return "Uploading PDFs";
  if (stage === "submitting") return "Submitting batch";
  if (stage === "stall_retry_queued") return "Retrying after stall";
  return stage || "queued";
}

function QueueCard({ item, position, onCancel, onMove, canMoveUp, canMoveDown, now }) {
  if (!item) return null;
  const running = item.status === "running";
  const singleStudentName = item.studentCount === 1
    ? item.lateStudentName || item.submissions?.[0]?.name || item.submissions?.[0]?.studentName || null
    : null;
  const cardLabel = running
    ? "Running now"
    : position != null
      ? `Queue position ${position}`
      : item.status === "done"
        ? "Completed"
        : item.status === "failed"
          ? "Failed"
          : item.status === "cancelled"
            ? "Cancelled"
            : "Queue item";
  const modelId = item.requestedGeminiModel || item.config?.geminiModel;
  const rawChunkSize = item.config?.chunkSize;
  const chunkText = Number(rawChunkSize) === 0
    ? "Full PDF per request"
    : Number(rawChunkSize) > 0
      ? `${Number(rawChunkSize)} pages per chunk`
      : "Server-default pages per chunk";
  const progress = item.providerProgress || null;
  const progressTotal = Number(progress?.total) || 0;
  const progressCompleted = Number(progress?.completed) || 0;
  const progressPercent = progressTotal > 0
    ? Math.min(100, Math.round((progressCompleted / progressTotal) * 100))
    : null;
  return (
    <div className="ma-card" style={{ padding: 18, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <strong>{cardLabel}: {item.assignmentName || item.assignmentId}</strong>
          <div className="ma-muted">{item.classroomName || "Classroom not provided"}</div>
        </div>
        <span className={`ma-badge ${running ? "ma-badge--info" : "ma-badge--pending"}`}>{stageLabel(item.stage || item.status)}</span>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span><FiUsers /> {item.studentCount || 0} student{item.studentCount === 1 ? "" : "s"}</span>
        <span><FiClock /> Added {dateText(item.createdAt)}</span>
        <span>{item.flow === "provider" ? item.providerSlug : item.flow}</span>
        <span>Model: <strong>{sahahlyModelLabel(modelId)}</strong></span>
        <span>Chunks: <strong>{chunkText}</strong></span>
      </div>
      {running && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <span>Total elapsed: <strong>{elapsedText(item.createdAt, now)}</strong></span>
          {item.startedAt && (
            <span>Running: <strong>{elapsedText(item.startedAt, now)}</strong></span>
          )}
          <span>Gemini state: <strong>{providerStateLabel(item.lastProviderState) || (
            item.stage === "uploading"
              ? "Uploading PDFs (batch not submitted yet)"
              : item.stage === "submitting"
                ? "Submitting batch"
                : item.stage === "saving_results"
                  ? "Saving results"
                  : "Waiting for first status check"
          )}</strong></span>
          <span>Last checked: <strong>{dateText(item.lastCheckedAt)}</strong></span>
          {item.geminiJobId && <span title={item.geminiJobId}>Job: <strong>{item.geminiJobId.slice(0, 12)}…</strong></span>}
        </div>
      )}
      {!running && ["done", "failed", "cancelled"].includes(item.status) && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <span>
            Processing time: <strong>{durationText(item.startedAt, item.finishedAt)}</strong>
          </span>
          {item.createdAt && item.finishedAt && (
            <span title="Includes time spent waiting in the automatic queue">
              Total time since queued: <strong>{durationText(item.createdAt, item.finishedAt)}</strong>
            </span>
          )}
          {item.finishedAt && <span>Finished: <strong>{dateText(item.finishedAt)}</strong></span>}
        </div>
      )}
      {running && progress && progressTotal > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Gemini progress: <strong>{progressCompleted}/{progressTotal} ({progressPercent}%)</strong></span>
            <span>Successful: <strong>{Number(progress.successful) || 0}</strong></span>
            <span>Pending: <strong>{Number(progress.pending) || 0}</strong></span>
            <span>Failed: <strong>{Number(progress.failed) || 0}</strong></span>
          </div>
          <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "var(--surface-muted, #dbe6f5)" }}>
            <div style={{ height: "100%", width: `${progressPercent}%`, background: "var(--primary, #2f8df4)", transition: "width .3s ease" }} />
          </div>
        </div>
      )}
      {singleStudentName && (
        <div>
          <FiUser /> {item.isLateSubmission ? "Late submission" : "Student"}: <strong>{singleStudentName}</strong>
        </div>
      )}
      {item.error && <div style={{ color: "var(--danger)" }}>{item.error}</div>}
      {running && onCancel && (
        <div>
          <button
            className="msv-btn-ai"
            disabled={Boolean(item.cancelRequestedAt)}
            onClick={() => onCancel(item._id, true)}
          >
            <FiTrash2 /> {item.cancelRequestedAt ? "Cancellation requested" : "Cancel running batch"}
          </button>
        </div>
      )}
      {!running && onCancel && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="msv-btn-ai" disabled={!canMoveUp} onClick={() => onMove(item._id, -1)} title="Move earlier"><FiArrowUp /> Move up</button>
          <button className="msv-btn-ai" disabled={!canMoveDown} onClick={() => onMove(item._id, 1)} title="Move later"><FiArrowDown /> Move down</button>
          <button className="msv-btn-ai" onClick={() => onCancel(item._id, false)}><FiTrash2 /> Remove from queue</button>
        </div>
      )}
    </div>
  );
}

export default function AutomaticBatchQueue() {
  const [data, setData] = useState({ running: null, queued: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const latestLoadRef = useRef(0);
  const activeLoadRef = useRef(null);
  const role = getRoleName(getStoredUser());
  const canEdit = role === "director" || role === "admin";

  const load = useCallback(async (quiet = false, force = false) => {
    // A slow response must finish before polling again, otherwise every poll
    // invalidates it and the initial loading screen can remain forever.
    if (activeLoadRef.current && !force) return;
    activeLoadRef.current?.abort();
    const controller = new AbortController();
    activeLoadRef.current = controller;
    const loadId = ++latestLoadRef.current;
    if (!quiet) setRefreshing(true);
    try {
      const response = await api.get("/automatic-batch-queue", {
        timeout: 30000,
        signal: controller.signal,
        params: { _ts: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      if (loadId !== latestLoadRef.current) return;
      setData(response.data || { running: null, queued: [], history: [] });
      setLoadError(null);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (loadId !== latestLoadRef.current) return;
      const message = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT"
        ? "The queue took too long to respond. Please try refreshing."
        : err.response?.data?.message || "Could not load automatic batch queue. Please try refreshing.";
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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const cancel = async (id, isRunning = false) => {
    if (isRunning && !window.confirm("Cancel this running automatic batch? Its current upload step will stop safely before Gemini submission.")) return;
    try {
      const response = await api.delete(`/automatic-batch-queue/${id}`);
      // Invalidate any refresh that started before the delete completed, then
      // reflect the mutation immediately instead of waiting for another GET.
      latestLoadRef.current += 1;
      const updatedItem = response.data?.item;
      setData((current) => {
        const wasRunning = String(current.running?._id || "") === String(id);
        const next = {
          ...current,
          running: wasRunning
            ? (updatedItem?.status === "running" ? updatedItem : null)
            : current.running,
          queued: (current.queued || []).filter((item) => String(item._id) !== String(id)),
        };
        if (updatedItem?.status === "cancelled") {
          next.history = [
            updatedItem,
            ...(current.history || []).filter((item) => String(item._id) !== String(id)),
          ];
        }
        return next;
      });
      toast.success(response.data?.message || (isRunning ? "Cancellation requested" : "Removed from automatic queue"));
      load(true, true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not remove queued batch");
    }
  };

  const move = async (id, direction) => {
    const queued = [...(data.queued || [])];
    const from = queued.findIndex((item) => item._id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= queued.length) return;
    [queued[from], queued[to]] = [queued[to], queued[from]];
    setData((current) => ({ ...current, queued }));
    try {
      await api.put("/automatic-batch-queue/reorder", { itemIds: queued.map((item) => item._id) });
      toast.success("Queue order updated");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not change queue order");
      load(true, true);
    }
  };

  return (
    <div className="ma-root"><main className="ma-main">
      <header className="ma-topbar"><div className="ma-topbar-left">
        <h1 className="ma-topbar-title">Automatic Batch Queue</h1>
        <span className="ma-topbar-sub">One automatic assignment runs at a time. {canEdit ? "Directors can reorder or remove waiting jobs." : "Queue controls are read-only for managers."}</span>
        {lastRefreshedAt && <span className="ma-topbar-sub">Last refreshed: {lastRefreshedAt.toLocaleTimeString()}</span>}
      </div><button className="msv-btn-ai" disabled={refreshing} onClick={() => load()}><FiRefreshCw /> {refreshing ? "Refreshing…" : "Refresh"}</button></header>
      <section
        style={{
          padding: 24,
          paddingBottom: 64,
          display: "grid",
          gap: 18,
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          alignContent: "start",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {loadError && <div className="ma-card" role="alert" style={{ padding: 18, color: "var(--danger)" }}>{loadError}{lastRefreshedAt && " Showing the last loaded queue."}</div>}
        {loading ? <div className="ma-card" style={{ padding: 24 }}>Loading queue…</div> : (!loadError || lastRefreshedAt) && <>
          <h2 style={{ margin: 0 }}>Running</h2>
          {data.running ? <QueueCard item={data.running} now={now} onCancel={canEdit ? cancel : null} /> : <div className="ma-card" style={{ padding: 18 }}>No automatic batch is running.</div>}
          <h2 style={{ margin: 0 }}>Waiting ({data.queued?.length || 0})</h2>
          {data.queued?.length ? data.queued.map((item, index) => <QueueCard key={item._id} item={item} position={index + 1} onCancel={canEdit ? cancel : null} onMove={move} canMoveUp={index > 0} canMoveDown={index < data.queued.length - 1} />) : <div className="ma-card" style={{ padding: 18 }}>Nothing is waiting.</div>}
          <h2 style={{ margin: 0 }}>Recent history</h2>
          {(data.history || []).slice(0, 20).map((item) => <QueueCard key={item._id} item={item} />)}
        </>}
      </section>
    </main></div>
  );
}
