import { FiInbox, FiRefreshCw } from "react-icons/fi";
import { STATUS_LABEL, STATUS_TONE, formatDateTime } from "./format";

const AUDIENCE_SUFFIX = {
  parent: "parents",
  student: "students",
  both: "parents + students",
};

/**
 * Which list this went to. Broadcasts created before roster sources existed carry
 * no `source`, so the filename they were imported from is the fallback.
 */
function sourceLine(b) {
  if (!b.source?.label) return b.sourceFilename || null;
  const audience = AUDIENCE_SUFFIX[b.source.audience];
  return audience ? `${b.source.label} — ${audience}` : b.source.label;
}

/** Past and running broadcasts. Selecting one opens its live progress view. */
export default function BroadcastsTable({ broadcasts, loading, selectedId, onSelect, onRefresh }) {
  return (
    <section className="mws-card">
      <div className="mws-card-header">
        <h2 className="mws-card-title">
          <FiInbox size={15} /> Broadcasts
        </h2>
        <button type="button" className="mws-btn mws-btn--ghost" onClick={onRefresh} disabled={loading}>
          <FiRefreshCw aria-hidden="true" /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!broadcasts.length ? (
        <p className="mws-empty">
          {loading ? "Loading…" : "No broadcasts yet. Compose one above to get started."}
        </p>
      ) : (
        <div className="wbc-table-scroll">
          <table className="mws-table sah-table--cards">
            <thead>
              <tr>
                <th>Broadcast</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => {
                const done = (b.sentCount || 0) + (b.failedCount || 0) + (b.skippedCount || 0);
                return (
                  <tr
                    key={b._id}
                    className={selectedId === b._id ? "wbc-row--selected" : ""}
                    onClick={() => onSelect(b._id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td data-label="Broadcast">
                      <button type="button" className="wbc-link" onClick={() => onSelect(b._id)}>
                        {b.title || "Untitled broadcast"}
                      </button>
                      {sourceLine(b) ? <div className="mws-note">{sourceLine(b)}</div> : null}
                      {b.attachment?.filename ? (
                        <div className="mws-note">{b.attachment.filename}</div>
                      ) : null}
                    </td>
                    <td data-label="Status">
                      <span className={`mws-badge ${STATUS_TONE[b.status] || "mws-badge--muted"}`}>
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                    </td>
                    <td data-label="Progress">
                      {done}/{b.totalCount || 0}
                      {b.failedCount ? (
                        <span className="mws-badge mws-badge--danger mws-badge--inline">
                          {b.failedCount} failed
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Created">{formatDateTime(b.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
