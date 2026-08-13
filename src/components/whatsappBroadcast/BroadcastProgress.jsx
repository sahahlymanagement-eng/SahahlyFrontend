import { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiClock,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiSlash,
  FiTrash2,
} from "react-icons/fi";
import {
  ERROR_LABEL,
  RECIPIENT_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  formatDateTime,
  maskPhone,
} from "./format";

const LIVE_STATUSES = ["queued", "running", "cancelling"];

/**
 * Live view of one broadcast: progress, controls, and per-recipient outcomes.
 *
 * Polling follows the interval the server hands back rather than a fixed timer.
 * A large campaign is paced over hours or days, so a fixed 2s poll would fire tens
 * of thousands of pointless requests; when the send window is closed the server
 * says "come back in five minutes" instead.
 */
export default function BroadcastProgress({
  detail,
  recipients,
  recipientFilter,
  busy,
  onRefresh,
  onFilterChange,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onDelete,
}) {
  const broadcast = detail?.broadcast;
  const progress = detail?.progress;
  const [confirmCancel, setConfirmCancel] = useState(false);

  const pollAfterMs = detail?.pollAfterMs ?? null;
  useEffect(() => {
    if (!pollAfterMs) return undefined;
    const t = setTimeout(onRefresh, pollAfterMs);
    return () => clearTimeout(t);
  }, [pollAfterMs, onRefresh, detail]);

  if (!broadcast) return null;

  const isLive = LIVE_STATUSES.includes(broadcast.status);
  const total = progress?.total || broadcast.totalCount || 0;
  const done = (progress?.sent || 0) + (progress?.failed || 0) + (progress?.skipped || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className="mws-card">
      <div className="mws-card-header">
        <h2 className="mws-card-title">
          {broadcast.title || "Untitled broadcast"}
          <span className={`mws-badge ${STATUS_TONE[broadcast.status] || "mws-badge--muted"}`}>
            {STATUS_LABEL[broadcast.status] || broadcast.status}
          </span>
        </h2>
        <div className="wbc-actions">
          <button type="button" className="mws-btn mws-btn--ghost" onClick={onRefresh} disabled={busy}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </button>
          {isLive && broadcast.status !== "cancelling" ? (
            <button type="button" className="mws-btn mws-btn--ghost" onClick={onPause} disabled={busy}>
              <FiPause aria-hidden="true" /> Pause
            </button>
          ) : null}
          {broadcast.status === "paused" ? (
            <button type="button" className="mws-btn mws-btn--primary" onClick={onResume} disabled={busy}>
              <FiPlay aria-hidden="true" /> Resume
            </button>
          ) : null}
          {(isLive || broadcast.status === "paused") && broadcast.status !== "cancelling" ? (
            <button
              type="button"
              className="mws-btn mws-btn--ghost"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
            >
              <FiSlash aria-hidden="true" /> Cancel
            </button>
          ) : null}
          {broadcast.failedCount > 0 && !isLive ? (
            <button type="button" className="mws-btn mws-btn--ghost" onClick={onRetryFailed} disabled={busy}>
              <FiRefreshCw aria-hidden="true" /> Retry failed
            </button>
          ) : null}
          {!isLive && broadcast.status !== "paused" ? (
            <button
              type="button"
              className="mws-icon-btn mws-icon-btn--danger"
              onClick={onDelete}
              disabled={busy}
              title="Delete this broadcast"
              aria-label="Delete this broadcast"
            >
              <FiTrash2 />
            </button>
          ) : null}
        </div>
      </div>

      {confirmCancel ? (
        <div className="wbc-confirm">
          <p>
            <FiAlertTriangle aria-hidden="true" /> Cancel this broadcast? Everyone still queued
            will be skipped. Anyone already mid-send will still receive it —{" "}
            <strong>a sent WhatsApp message cannot be recalled.</strong> To fix a typo instead,
            use <strong>Pause</strong>, which keeps the queue.
          </p>
          <div className="wbc-actions">
            <button
              type="button"
              className="mws-btn mws-btn--primary"
              onClick={() => {
                setConfirmCancel(false);
                onCancel();
              }}
              disabled={busy}
            >
              Yes, cancel it
            </button>
            <button
              type="button"
              className="mws-btn mws-btn--ghost"
              onClick={() => setConfirmCancel(false)}
            >
              Keep sending
            </button>
          </div>
        </div>
      ) : null}

      <div className="wbc-progress">
        <div className="wbc-progress-bar">
          <span className="wbc-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="wbc-progress-label">
          {done} of {total} processed ({pct}%)
        </span>
      </div>

      <div className="wbc-stat-row">
        <div className="wbc-stat wbc-stat--ok">
          <span className="wbc-stat-value">{progress?.sent ?? 0}</span>
          <span className="wbc-stat-label">Sent</span>
        </div>
        <div className={`wbc-stat ${progress?.failed ? "wbc-stat--warn" : ""}`}>
          <span className="wbc-stat-value">{progress?.failed ?? 0}</span>
          <span className="wbc-stat-label">Failed</span>
        </div>
        <div className="wbc-stat">
          <span className="wbc-stat-value">{progress?.skipped ?? 0}</span>
          <span className="wbc-stat-label">Skipped</span>
        </div>
        <div className="wbc-stat">
          <span className="wbc-stat-value">{progress?.remaining ?? 0}</span>
          <span className="wbc-stat-label">Remaining</span>
        </div>
      </div>

      {detail?.nextWindowOpensAt ? (
        <p className="mws-note">
          <FiClock aria-hidden="true" /> Outside the sending hours — this resumes automatically
          around {formatDateTime(detail.nextWindowOpensAt)}.
        </p>
      ) : null}

      {broadcast.lastError ? (
        <p className="mws-error">
          <FiAlertTriangle aria-hidden="true" /> {broadcast.lastError}
        </p>
      ) : null}

      <p className="mws-note">
        “Sent” means WhatsApp accepted the message for delivery — it is not a read receipt.
      </p>

      <div className="wbc-tabs" role="tablist">
        {[
          ["", "All"],
          ["sent", "Sent"],
          ["failed", "Failed"],
          ["skipped", "Skipped"],
          ["queued", "Queued"],
        ].map(([key, label]) => (
          <button
            key={key || "all"}
            type="button"
            role="tab"
            aria-selected={recipientFilter === key}
            className={`wbc-tab ${recipientFilter === key ? "wbc-tab--on" : ""}`}
            onClick={() => onFilterChange(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {recipients?.length ? (
        <div className="wbc-table-scroll">
          <table className="mws-table sah-table--cards">
            <thead>
              <tr>
                <th>Row</th>
                <th>Name</th>
                <th>Number</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r._id}>
                  <td data-label="Row">{r.rowNumber ?? "—"}</td>
                  <td data-label="Name">{r.name || "—"}</td>
                  <td data-label="Number" className="mws-mono">
                    {maskPhone(r.phoneDigits)}
                  </td>
                  <td data-label="Status">
                    <span className={`mws-badge ${RECIPIENT_TONE[r.status] || "mws-badge--muted"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td data-label="Detail">
                    {r.errorCode ? ERROR_LABEL[r.errorCode] || r.errorCode : "—"}
                    {r.sentAt ? <div className="mws-note">{formatDateTime(r.sentAt)}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mws-empty">Nothing to show for this filter yet.</p>
      )}
    </section>
  );
}
