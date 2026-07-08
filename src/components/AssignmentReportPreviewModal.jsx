import { FiSend, FiX, FiUser, FiPhone } from "react-icons/fi";

/**
 * Preview modal for Assignment Reports.
 *
 * Mirrors the parent/teacher report flow: the dashboard first hits
 * POST /manager-assignments/report-preview to get the exact WhatsApp text
 * that will be sent (one message per student), renders it here, and only on
 * confirm does it POST /manager-assignments/send-report. The server rebuilds
 * the identical text from the same body — the previewed string is never sent
 * back.
 *
 * previews: [{ name, phone, parentPhone, message, error }]
 */
export default function AssignmentReportPreviewModal({
  open,
  loading,
  error,
  previews = [],
  sending = false,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  const sendable = previews.filter((p) => p && !p.error);
  const failed = previews.filter((p) => p && p.error);

  return (
    <div className="arp-overlay" onClick={onClose}>
      <div className="arp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="arp-header">
          <div className="arp-header-titles">
            <span className="arp-title">Report Preview</span>
            <span className="arp-subtitle">
              {loading
                ? "Generating messages…"
                : `${sendable.length} message${sendable.length !== 1 ? "s" : ""} ready to send${
                    failed.length ? ` · ${failed.length} skipped` : ""
                  }`}
            </span>
          </div>
          <button type="button" className="arp-close" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="arp-body">
          {loading && <p className="arp-status">Building the exact WhatsApp text for each student…</p>}

          {!loading && error && <p className="arp-status arp-status--error">{error}</p>}

          {!loading && !error && previews.length === 0 && (
            <p className="arp-status">No messages to preview.</p>
          )}

          {!loading &&
            !error &&
            previews.map((p, i) => (
              <div
                key={`${p.name || "student"}-${i}`}
                className={`arp-card ${p.error ? "arp-card--error" : ""}`}
              >
                <div className="arp-card-head">
                  <span className="arp-card-name">
                    <FiUser size={12} /> {p.name || "Unnamed student"}
                  </span>
                  <span className="arp-card-phones">
                    {p.phone && (
                      <span className="arp-phone">
                        <FiPhone size={11} /> {p.phone}
                      </span>
                    )}
                    {p.parentPhone && (
                      <span className="arp-phone">
                        <FiPhone size={11} /> Parent: {p.parentPhone}
                      </span>
                    )}
                  </span>
                </div>
                {p.error ? (
                  <p className="arp-card-error">⚠ {p.error}</p>
                ) : (
                  <pre className="arp-message">{p.message}</pre>
                )}
              </div>
            ))}
        </div>

        <div className="arp-footer">
          <button type="button" className="arp-btn arp-btn--ghost" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            className="arp-btn arp-btn--send"
            onClick={onConfirm}
            disabled={sending || loading || !!error || sendable.length === 0}
          >
            <FiSend size={14} />
            {sending
              ? "Sending…"
              : `Send ${sendable.length} Report${sendable.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
