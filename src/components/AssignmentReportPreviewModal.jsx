import { useMemo, useState, useEffect } from "react";
import { FiSend, FiX, FiUser, FiPhone, FiSearch } from "react-icons/fi";

/**
 * Preview modal for Assignment Reports (manager / teacher / assistant).
 */
export default function AssignmentReportPreviewModal({
  open,
  loading,
  error,
  previews = [],
  sending = false,
  onClose,
  onConfirm,
  onChangeMessage,
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filteredPreviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return previews;
    return previews.filter((p) => {
      const name = String(p?.name || "").toLowerCase();
      const phone = String(p?.phone || p?.parentPhone || "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [previews, search]);

  if (!open) return null;

  const sendable = previews.filter((p) => p && !p.error && String(p.message || "").trim());
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
                  } · edit text before sending`}
            </span>
          </div>
          <button type="button" className="arp-close" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <div className="arp-body">
          {!loading && !error && previews.length > 1 && (
            <label className="arp-search-wrap">
              <FiSearch size={14} aria-hidden="true" />
              <input
                type="search"
                className="arp-search"
                placeholder="Search by student name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={sending}
              />
            </label>
          )}

          {loading && <p className="arp-status">Building the exact WhatsApp text for each student…</p>}

          {!loading && error && <p className="arp-status arp-status--error">{error}</p>}

          {!loading && !error && previews.length === 0 && (
            <p className="arp-status">No messages to preview.</p>
          )}

          {!loading && !error && previews.length > 0 && filteredPreviews.length === 0 && (
            <p className="arp-status">No students match your search.</p>
          )}

          {!loading &&
            !error &&
            filteredPreviews.map((p) => {
              const i = previews.indexOf(p);
              return (
                <div
                  key={`${p.studentId || p.name || "student"}-${i}`}
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
                    <textarea
                      className="arp-message arp-message--editable"
                      value={p.message || ""}
                      onChange={(e) => onChangeMessage?.(i, e.target.value)}
                      rows={Math.min(24, Math.max(8, String(p.message || "").split("\n").length + 1))}
                      spellCheck
                      disabled={sending}
                      aria-label={`Edit WhatsApp message for ${p.name || "student"}`}
                    />
                  )}
                </div>
              );
            })}
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
