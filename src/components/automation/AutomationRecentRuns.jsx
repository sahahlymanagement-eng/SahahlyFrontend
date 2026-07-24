import { FiClock, FiRefreshCw } from "react-icons/fi";
import { humanize, runCounts, statusTone } from "./automationStatus";

/**
 * Recent runs across the classroom, so a manager can see at a glance which
 * assignments have been through the pipeline without selecting each one.
 *
 * The assignment reference may come back populated or as a bare id depending on
 * how the run doc was queried, so the title falls back through both.
 */

const assignmentTitle = (run) =>
  run.assignmentTitle ||
  run.assignmentId?.title ||
  run.assignment?.title ||
  (typeof run.assignmentId === "string" ? run.assignmentId : "—");

export default function AutomationRecentRuns({ runs, loading, onRefresh }) {
  return (
    <section className="atm-card">
      <header className="atm-card-header">
        <h2 className="atm-card-title">
          <FiClock aria-hidden="true" /> Recent runs
        </h2>
        <button
          type="button"
          className="sah-btn sah-btn--secondary atm-btn--sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <FiRefreshCw aria-hidden="true" className={loading ? "atm-spin" : undefined} /> Refresh
        </button>
      </header>

      {loading && !runs.length ? (
        <p className="atm-empty">Loading runs…</p>
      ) : !runs.length ? (
        <p className="atm-empty">Nothing has run yet.</p>
      ) : (
        <div className="sah-table-scroll">
          <table className="atm-table sah-table--cards">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Marked</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const counts = runCounts(run);
                return (
                  <tr key={run._id || `${run.assignmentId}-${run.startedAt}`}>
                    <td data-label="Assignment">{assignmentTitle(run)}</td>
                    <td data-label="Status">
                      <span className={`atm-badge atm-badge--${statusTone(run.status)}`}>
                        {humanize(run.status) || "Unknown"}
                      </span>
                      {run.dryRun && (
                        <span className="atm-badge atm-badge--muted atm-badge--inline">Dry</span>
                      )}
                    </td>
                    <td data-label="Stage">{humanize(run.stage) || "—"}</td>
                    <td data-label="Marked">
                      {counts.saved != null || counts.total != null
                        ? `${counts.saved ?? "?"} / ${counts.total ?? "?"}`
                        : "—"}
                    </td>
                    <td data-label="Updated">
                      {run.updatedAt ? new Date(run.updatedAt).toLocaleString() : "—"}
                    </td>
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
