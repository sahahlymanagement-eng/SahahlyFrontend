import { useMemo } from "react";
import Select from "react-select";
import {
  FiClock,
  FiEdit2,
  FiFile,
  FiImage,
  FiRefreshCw,
  FiSend,
  FiSlash,
  FiTrash2,
} from "react-icons/fi";
import { selectStyles } from "../../utils/selectTheme";
import { confirmToast } from "../../utils/confirmToast";
import { attachmentObjectUrl } from "../../api/scheduledWhatsapp";
import {
  CANCELLABLE,
  STATUS_OPTIONS,
  STATUS_TONE,
  describeRecurrence,
  formatBytes,
  formatDateTime,
  groupLabel,
} from "./recurrence";

const SENT_TOOLTIP =
  "Sent means queued and accepted, not delivery-confirmed. The message only lands if the connected number is a member of that group.";

function StatusBadge({ status }) {
  const tone = STATUS_TONE[status] || "neutral";
  return (
    <span
      className={`mws-badge mws-badge--${tone}`}
      title={status === "sent" ? SENT_TOOLTIP : undefined}
    >
      {status || "unknown"}
    </span>
  );
}

/**
 * The attachment that goes out with a row, as a chip that opens the stored file.
 *
 * The bytes endpoint is token-authenticated, so this cannot be a plain link — it
 * fetches a blob, opens that, and releases the object URL once the new tab has
 * had a chance to take it.
 */
function AttachmentChip({ attachment }) {
  const open = async () => {
    try {
      const url = await attachmentObjectUrl(attachment.attachmentId);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      /* Opening the preview is a convenience; the schedule itself is unaffected. */
    }
  };

  return (
    <button
      type="button"
      className="mws-chip mws-chip--attachment"
      onClick={open}
      title={`${attachment.filename}${attachment.size ? ` · ${formatBytes(attachment.size)}` : ""}`}
    >
      {attachment.kind === "image" ? <FiImage aria-hidden="true" /> : <FiFile aria-hidden="true" />}
      <span className="mws-chip-text">{attachment.filename}</span>
    </button>
  );
}

/**
 * Everything queued, with the row actions that manage it.
 *
 * Filters are sent to the server as query params rather than applied locally,
 * so the list stays correct as it grows past whatever the API returns.
 */
export default function ScheduledMessagesTable({
  messages,
  groups,
  loading,
  busy,
  statusFilter,
  groupFilter,
  onStatusFilter,
  onGroupFilter,
  onRefresh,
  onEdit,
  onCancel,
  onSendNow,
  onDelete,
}) {
  const groupOptions = useMemo(
    () => [
      { value: "", label: "All groups" },
      ...groups.map((g) => ({ value: g.chatId, label: groupLabel(g) })),
    ],
    [groups]
  );

  const nameFor = (chatId) =>
    groups.find((g) => g.chatId === chatId)?.name?.trim() || chatId;

  const confirmThen = async (opts, action) => {
    if (await confirmToast(opts.message, opts)) action();
  };

  return (
    <section className="mws-card">
      <header className="mws-card-header">
        <h2 className="mws-card-title">
          <FiClock aria-hidden="true" /> Scheduled messages
        </h2>
        <button
          type="button"
          className="mws-btn mws-btn--ghost"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh now"
        >
          <FiRefreshCw aria-hidden="true" /> Refresh
        </button>
      </header>

      <div className="mws-filters">
        <label className="mws-field">
          <span className="mws-label">Status</span>
          <select
            className="mws-input"
            value={statusFilter}
            onChange={(e) => onStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="mws-field">
          <span className="mws-label">Group</span>
          <Select
            styles={selectStyles}
            menuPortalTarget={document.body}
            options={groupOptions}
            value={groupOptions.find((o) => o.value === groupFilter) || groupOptions[0]}
            onChange={(sel) => onGroupFilter(sel?.value || "")}
          />
        </label>
      </div>

      {loading && messages.length === 0 ? (
        <p className="mws-empty">Loading scheduled messages…</p>
      ) : messages.length === 0 ? (
        <p className="mws-empty">Nothing scheduled yet.</p>
      ) : (
        <div className="sah-table-scroll">
          <table className="mws-table sah-table--cards">
            <thead>
              <tr>
                <th>Group</th>
                <th>Message</th>
                <th>Type</th>
                <th>Next run</th>
                <th>Status</th>
                <th>Last run</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m._id}>
                  <td data-label="Group">{m.groupName?.trim() || nameFor(m.chatId)}</td>

                  <td data-label="Message">
                    <span className="mws-message" title={m.text}>
                      {m.text}
                    </span>
                    {m.attachment?.attachmentId && (
                      <AttachmentChip attachment={m.attachment} />
                    )}
                    {m.status === "failed" && m.lastError && (
                      <span className="mws-error" title={m.lastError}>
                        {m.lastError}
                      </span>
                    )}
                  </td>

                  <td data-label="Type">
                    {m.scheduleType === "recurring" ? (
                      <span className="mws-chip">{describeRecurrence(m)}</span>
                    ) : (
                      <span className="mws-chip">Once</span>
                    )}
                  </td>

                  <td data-label="Next run">{formatDateTime(m.nextRunAt)}</td>

                  <td data-label="Status">
                    <StatusBadge status={m.status} />
                  </td>

                  <td data-label="Last run">
                    {formatDateTime(m.lastRunAt)}
                    {m.runCount > 0 && (
                      <span className="mws-runcount">×{m.runCount}</span>
                    )}
                  </td>

                  <td data-label="Actions">
                    <div className="mws-row-actions">
                      <button
                        type="button"
                        className="mws-icon-btn"
                        disabled={busy}
                        title="Send now (test)"
                        aria-label="Send now"
                        onClick={() =>
                          confirmThen(
                            {
                              message: "Send this message right now?",
                              title: "Send now",
                              confirmLabel: "Send",
                            },
                            () => onSendNow(m)
                          )
                        }
                      >
                        <FiSend />
                      </button>

                      <button
                        type="button"
                        className="mws-icon-btn"
                        disabled={busy}
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => onEdit(m)}
                      >
                        <FiEdit2 />
                      </button>

                      {CANCELLABLE.has(m.status) && (
                        <button
                          type="button"
                          className="mws-icon-btn"
                          disabled={busy}
                          title="Cancel"
                          aria-label="Cancel"
                          onClick={() =>
                            confirmThen(
                              {
                                message: "Cancel this scheduled message?",
                                title: "Cancel schedule",
                                confirmLabel: "Cancel it",
                                cancelLabel: "Keep",
                                danger: true,
                              },
                              () => onCancel(m)
                            )
                          }
                        >
                          <FiSlash />
                        </button>
                      )}

                      <button
                        type="button"
                        className="mws-icon-btn mws-icon-btn--danger"
                        disabled={busy}
                        title="Delete"
                        aria-label="Delete"
                        onClick={() =>
                          confirmThen(
                            {
                              message: "Delete this scheduled message for good?",
                              title: "Delete schedule",
                              confirmLabel: "Delete",
                              danger: true,
                            },
                            () => onDelete(m)
                          )
                        }
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
