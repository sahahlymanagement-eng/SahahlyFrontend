import { useCallback, useEffect, useState } from "react";
import { FiClock, FiRefreshCw, FiTrash2, FiUser, FiUsers } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../../api/api";

const dateText = (value) => value ? new Date(value).toLocaleString() : "—";

function QueueCard({ item, position, onCancel }) {
  if (!item) return null;
  const running = item.status === "running";
  return (
    <div className="ma-card" style={{ padding: 18, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <strong>{running ? "Running now" : `Queue position ${position}`}: {item.assignmentName || item.assignmentId}</strong>
          <div className="ma-muted">{item.classroomName || "Classroom not provided"}</div>
        </div>
        <span className={`ma-badge ${running ? "ma-badge--info" : "ma-badge--pending"}`}>{item.stage || item.status}</span>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <span><FiUsers /> {item.studentCount || 0} student{item.studentCount === 1 ? "" : "s"}</span>
        <span><FiClock /> Added {dateText(item.createdAt)}</span>
        <span>{item.flow === "provider" ? item.providerSlug : item.flow}</span>
      </div>
      {item.studentCount === 1 && item.lateStudentName && (
        <div><FiUser /> Late submission: <strong>{item.lateStudentName}</strong></div>
      )}
      {item.error && <div style={{ color: "var(--danger)" }}>{item.error}</div>}
      {!running && onCancel && (
        <div><button className="msv-btn-ai" onClick={() => onCancel(item._id)}><FiTrash2 /> Remove from queue</button></div>
      )}
    </div>
  );
}

export default function AutomaticBatchQueue() {
  const [data, setData] = useState({ running: null, queued: [], history: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    try {
      const response = await api.get("/automatic-batch-queue");
      setData(response.data || { running: null, queued: [], history: [] });
    } catch (err) {
      if (!quiet) toast.error(err.response?.data?.message || "Could not load automatic batch queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => load(), 0);
    const timer = setInterval(() => load(true), 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);

  const cancel = async (id) => {
    try {
      await api.delete(`/automatic-batch-queue/${id}`);
      toast.success("Removed from automatic queue");
      load(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not remove queued batch");
    }
  };

  return (
    <div className="ma-root"><main className="ma-main">
      <header className="ma-topbar"><div className="ma-topbar-left">
        <h1 className="ma-topbar-title">Automatic Batch Queue</h1>
        <span className="ma-topbar-sub">One automatic assignment runs at a time. Normal batch marking remains independent.</span>
      </div><button className="msv-btn-ai" onClick={() => load()}><FiRefreshCw /> Refresh</button></header>
      <section style={{ padding: 24, display: "grid", gap: 18 }}>
        {loading ? <div className="ma-card" style={{ padding: 24 }}>Loading queue…</div> : <>
          <h2 style={{ margin: 0 }}>Running</h2>
          {data.running ? <QueueCard item={data.running} /> : <div className="ma-card" style={{ padding: 18 }}>No automatic batch is running.</div>}
          <h2 style={{ margin: 0 }}>Waiting ({data.queued?.length || 0})</h2>
          {data.queued?.length ? data.queued.map((item, index) => <QueueCard key={item._id} item={item} position={index + 1} onCancel={cancel} />) : <div className="ma-card" style={{ padding: 18 }}>Nothing is waiting.</div>}
          <h2 style={{ margin: 0 }}>Recent history</h2>
          {(data.history || []).slice(0, 20).map((item) => <QueueCard key={item._id} item={item} />)}
        </>}
      </section>
    </main></div>
  );
}
