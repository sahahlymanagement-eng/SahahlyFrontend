/* eslint-disable react-refresh/only-export-components -- Extracted UI library shares formatting helpers and hooks with its components. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ============================================================
   Icons — inline so there is no icon-library dependency
   ============================================================ */

const paths = {
  library: "M4 5h5v14H4zM11 5h4v14h-4zM17 6l3 12-2 .5L15 6.5z",
  mark: "M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 16h5",
  paper: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 15h6M9 18h4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 4V2.5M12 21.5V20M4 12H2.5M21.5 12H20M6.3 6.3L5.2 5.2M18.8 18.8l-1.1-1.1M6.3 17.7l-1.1 1.1M18.8 5.2l-1.1 1.1",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  plus: "M12 5v14M5 12h14",
  pencil: "M13 5l6 6M4 16l.8-3.2L14.5 3l3.5 3.5L8.2 16.3 4 16zM4 20h16",
  check: "M4 12.5l5 5L20 6.5",
  upload: "M12 16V4M7 9l5-5 5 5M4 17v3h16v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM11 8v6M8 11h6M16.5 16.5L21 21",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM8 11h6M16.5 16.5L21 21",
  save: "M5 4h11l3 3v13H5zM8 4v6h7V4M8 14h8v6H8z",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 3l9 17H3zM12 9v5M12 17h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  bolt: "M13 3L5 14h5l-1 7 8-11h-5z",
  coins: "M12 5c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3zM5 8v4c0 1.7 3 3 7 3s7-1.3 7-3V8M5 12v4c0 1.7 3 3 7 3s7-1.3 7-3v-4",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  target: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  stack: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  drag: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  image: "M4 6h16v12H4zM8 11l2.5 3 2-2.5L16 15M9 9h.01",
  send: "M4 12l15-7-4 15-3.5-5.5z",
};

export function Icon({ name, size = 16, strokeWidth = 1.9 }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/* ============================================================
   Theme
   ============================================================ */

export function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute("data-theme") || "dark"
  );

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("sahahly-theme", next);
      } catch {
        // Private browsing — the theme just won't persist.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

/* ============================================================
   Toasts
   ============================================================ */

const ToastContext = createContext(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const push = useCallback((toast) => {
    const id = nextId.current++;
    const entry = typeof toast === "string" ? { title: toast } : toast;
    setToasts((current) => [...current, { id, kind: "info", ...entry }]);
    setTimeout(() => {
      setToasts((current) => current.filter((row) => row.id !== id));
    }, entry.duration || 4200);
  }, []);

  const glyph = { ok: "\u2713", bad: "!", info: "i" };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <i>{glyph[toast.kind] || glyph.info}</i>
            <div className="grow">
              <strong>{toast.title}</strong>
              {toast.body && <p>{toast.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ============================================================
   Status
   ============================================================ */

const STEP_LABELS = {
  queued: "Queued",
  reading_pdfs: "Reading PDFs",
  indexing_question_paper: "Indexing the question paper",
  extracting_mark_scheme: "Extracting mark points",
  pairing: "Pairing QP with the mark scheme",
  reading_script: "Reading the student script",
  marking: "Marking against the stored pack",
  uploading_script: "Uploading the script",
  uploading_scripts: "Uploading the scripts",
  submitting_batch: "Submitting the batch job",
  waiting_in_batch: "Waiting in Gemini's batch queue",
  collecting_results: "Collecting batch results",
};

export function statusLabel(item) {
  if (!item) return "";
  if (item.status === "ready") return item.studentFilename || item.paperCount != null ? "Completed" : "Reviewed";
  if (item.status === "needs_review") return "Needs review";
  if (item.status === "partial") return "Partly done";
  if (item.status === "cancelled") return "Cancelled";
  if (item.status === "error") return "Failed";
  const step = String(item.step || "");
  if (step.startsWith("indexing_question_paper")) {
    const pages = step.replace("indexing_question_paper", "").trim();
    return pages ? `Indexing question paper ${pages}` : "Indexing the question paper";
  }
  if (step.startsWith("extracting_mark_scheme")) {
    const pages = step.replace("extracting_mark_scheme", "").trim();
    return pages ? `Extracting mark points ${pages}` : "Extracting mark points";
  }
  return STEP_LABELS[item.step] || item.status || "Working";
}

export function statusKind(status) {
  if (status === "ready") return "ok";
  if (status === "error") return "bad";
  if (status === "partial" || status === "needs_review") return "warn";
  if (status === "cancelled") return "neutral";
  return "busy";
}

export function StatusChip({ item }) {
  const kind = statusKind(item?.status);
  return (
    <span className={`chip ${kind}`}>
      {kind === "busy" && <i />}
      {statusLabel(item)}
    </span>
  );
}

/* ============================================================
   Numbers, bars, rings
   ============================================================ */

/** Counts up to its target so figures feel alive when a poll lands. */
export function AnimatedNumber({ value, format = (n) => n.toLocaleString("en-US") }) {
  const [shown, setShown] = useState(value || 0);
  const fromRef = useRef(value || 0);

  useEffect(() => {
    const target = Number(value) || 0;
    const from = fromRef.current;
    if (from === target) return;

    // Big jumps (a poll landing) animate; tiny ones just snap.
    if (Math.abs(target - from) < 2) {
      fromRef.current = target;
      setShown(target);
      return;
    }

    let raf;
    const started = performance.now();
    const duration = 550;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  if (!Number.isFinite(Number(value))) return <>—</>;
  return <>{format(Math.round(shown))}</>;
}

export function Bar({ value, max, tone, live = false }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`bar ${live ? "live" : ""}`}>
      <i className={tone || ""} style={{ width: `${live ? 34 : pct}%` }} />
    </div>
  );
}

export function toneFor(ratio) {
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.5) return "warn";
  return "bad";
}

export function Ring({ obtained, max, label = "scored" }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, obtained / max)) : 0;
  const tone = toneFor(ratio);
  const colour = { good: "var(--success)", warn: "var(--warning)", bad: "var(--danger)" }[tone];
  return (
    <div className="ring" style={{ "--pct": ratio * 100, "--ring": colour }}>
      <div className="ring-text">
        <b>{Math.round(ratio * 100)}%</b>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function Stat({ icon, tone, label, value, foot }) {
  return (
    <div className="stat">
      <div className="stat-top">
        {icon && (
          <span className={`stat-icon ${tone || ""}`}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

/* ============================================================
   Loading / empty
   ============================================================ */

export function Loading({ text = "Loading…" }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius }) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="skeleton-stack">
      <Skeleton height={18} width="45%" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={12} width={`${88 - i * 12}%`} />
      ))}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

/* ============================================================
   File drops
   ============================================================ */

function onlyPdfs(fileList) {
  return Array.from(fileList || []).filter(
    (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function FileDrop({ label, hint, file, onFile }) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      className={`drop ${file ? "has-file" : ""} ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = onlyPdfs(e.dataTransfer.files)[0];
        if (dropped) onFile(dropped);
      }}
    >
      <span className="drop-kicker">{label}</span>
      <strong>{file ? file.name : dragging ? "Release to attach" : "Drop a PDF or click to browse"}</strong>
      <span className="muted">{file ? `${Math.round(file.size / 1024)} KB` : hint}</span>
      {file && <span className="drop-check">{"\u2713"}</span>}
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
    </label>
  );
}

export function MultiFileDrop({ label, hint, files, onFiles, max }) {
  const [dragging, setDragging] = useState(false);

  const add = (incoming) => {
    const next = [...files];
    for (const file of onlyPdfs(incoming)) {
      if (next.some((existing) => existing.name === file.name && existing.size === file.size)) {
        continue;
      }
      next.push(file);
    }
    onFiles(max ? next.slice(0, max) : next);
  };

  const totalKb = useMemo(
    () => Math.round(files.reduce((sum, file) => sum + file.size, 0) / 1024),
    [files]
  );

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label
        className={`drop ${files.length ? "has-file" : ""} ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <span className="drop-kicker">{label}</span>
        <strong>
          {dragging
            ? "Release to add them"
            : files.length
              ? `${files.length} PDF${files.length === 1 ? "" : "s"} ready`
              : "Drop PDFs or click to browse"}
        </strong>
        <span className="muted">
          {files.length
            ? `${totalKb.toLocaleString("en-US")} KB total · drop more to add`
            : hint}
        </span>
        {files.length > 0 && <span className="drop-check">{files.length}</span>}
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <>
          <ul className="file-list">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`}>
                <span className="grow">{file.name}</span>
                <span className="muted">{Math.round(file.size / 1024)} KB</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onFiles(files.filter((row) => row !== file))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link-button" onClick={() => onFiles([])}>
            Clear all {files.length}
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Formatters
   ============================================================ */

export function formatTokens(count) {
  if (!Number.isFinite(count)) return "—";
  return count.toLocaleString("en-US");
}

export function formatCompactTokens(count) {
  if (!Number.isFinite(count)) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function formatEgp(amount) {
  if (!Number.isFinite(amount)) return "—";
  // Marking one paper often costs well under a piastre, so keep small change visible.
  const decimals = amount > 0 && amount < 0.01 ? 4 : 2;
  return `EGP ${amount.toFixed(decimals)}`;
}

export function formatUsd(amount) {
  if (!Number.isFinite(amount)) return "—";
  const decimals = amount > 0 && amount < 0.01 ? 5 : 4;
  return `$${amount.toFixed(decimals)}`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
