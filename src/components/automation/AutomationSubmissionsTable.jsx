import { useMemo } from "react";
import { FiCheckSquare, FiRefreshCw, FiSquare, FiUsers, FiX } from "react-icons/fi";
import Pagination from "../Pagination";
import { getSubmissionStatusDisplay } from "../../utils/submissionStatusBadge";
import { isEligibleRow } from "./automationStatus";

/**
 * The roster, with the checkboxes that scope a run.
 *
 * Rows that already have saved marking stay selectable, so a single one can be
 * deliberately re-marked with Force; only rows with nothing to mark are inert.
 *
 * The whole roster is loaded up front and paginated here rather than page by
 * page: it is the only way "select all unmarked" and the eligible/marked counts
 * can be exact, and it is the same call the Submission Viewer already makes for
 * its own select-all.
 */

// getSubmissionStatusDisplay speaks the Submission Viewer's `.ma-badge` tones;
// map them onto this tab's own badge variants rather than pulling in that page's
// stylesheet for six class names.
const TONE_TO_BADGE = {
  green: "success",
  blue: "info",
  orange: "warning",
  yellow: "warning",
  red: "danger",
  gray: "neutral",
};

export default function AutomationSubmissionsTable({
  rows,
  loading,
  error,
  search,
  onSearch,
  page,
  totalPages,
  onPageChange,
  selection,
  markedIds,
  counts,
  busy,
  onSelectPage,
  onDeselectPage,
  onSelectAllUnmarked,
  onClearSelection,
  onReload,
}) {
  const pageEligibleIds = useMemo(
    () => rows.filter(isEligibleRow).map((s) => s.submissionId),
    [rows]
  );

  const pageSelectedCount = pageEligibleIds.filter((id) => selection.isSelected(id)).length;
  const allPageSelected = pageEligibleIds.length > 0 && pageSelectedCount === pageEligibleIds.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;

  return (
    <section className="atm-card">
      <header className="atm-card-header">
        <h2 className="atm-card-title">
          <FiUsers aria-hidden="true" /> Submissions
        </h2>
        <button
          type="button"
          className="sah-btn sah-btn--secondary atm-btn--sm"
          onClick={onReload}
          disabled={loading}
        >
          <FiRefreshCw aria-hidden="true" className={loading ? "atm-spin" : undefined} />
          Refresh
        </button>
      </header>

      <div className="atm-toolbar">
        <input
          className="sah-input atm-search"
          placeholder="Search students…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />

        <div className="atm-toolbar-actions">
          <button
            type="button"
            className="sah-btn sah-btn--ghost atm-btn--sm"
            onClick={allPageSelected ? onDeselectPage : onSelectPage}
            disabled={busy || !pageEligibleIds.length}
          >
            {allPageSelected ? <FiSquare aria-hidden="true" /> : <FiCheckSquare aria-hidden="true" />}
            {allPageSelected ? "Deselect page" : "Select page"}
          </button>
          <button
            type="button"
            className="sah-btn sah-btn--ghost atm-btn--sm"
            onClick={onSelectAllUnmarked}
            disabled={busy || !counts.unmarked}
          >
            Select all unmarked ({counts.unmarked})
          </button>
          <button
            type="button"
            className="sah-btn sah-btn--ghost atm-btn--sm"
            onClick={onClearSelection}
            disabled={busy || !selection.selectedCount}
          >
            <FiX aria-hidden="true" /> Clear
          </button>
        </div>
      </div>

      <p className="atm-counts">
        <strong>{counts.total}</strong> students · <strong>{counts.eligible}</strong> submitted ·{" "}
        <strong>{counts.marked}</strong> already marked ·{" "}
        <strong>{selection.selectedCount}</strong> selected
      </p>

      {error ? (
        <p className="atm-empty atm-empty--error">{error}</p>
      ) : loading && !rows.length ? (
        <p className="atm-empty">Loading submissions…</p>
      ) : !rows.length ? (
        <p className="atm-empty">
          {search ? `No students match "${search}".` : "No students found for this assignment."}
        </p>
      ) : (
        <>
          <div className="sah-table-scroll">
            <table className="atm-table sah-table--cards">
              <thead>
                <tr>
                  <th className="atm-check-col">
                    <input
                      type="checkbox"
                      aria-label="Select every submitted row on this page"
                      checked={allPageSelected}
                      disabled={busy || !pageEligibleIds.length}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected;
                      }}
                      onChange={allPageSelected ? onDeselectPage : onSelectPage}
                    />
                  </th>
                  <th>Student</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Marking</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const eligible = isEligibleRow(s);
                  const selected = eligible && selection.isSelected(s.submissionId);
                  const marked = !!s.submissionId && markedIds.has(s.submissionId);
                  const { tone, label } = getSubmissionStatusDisplay(s);

                  return (
                    <tr
                      key={s._id || s.submissionId}
                      className={`${selected ? "atm-row--selected" : ""}${
                        eligible ? "" : " atm-row--inert"
                      }`}
                    >
                      <td className="atm-check-col">
                        {eligible ? (
                          <input
                            type="checkbox"
                            aria-label={`Include ${s.name || "student"} in the run`}
                            checked={selected}
                            disabled={busy}
                            onChange={() => selection.toggle(s.submissionId)}
                          />
                        ) : null}
                      </td>

                      <td data-label="Student">
                        <span className="atm-student">{s.name || "—"}</span>
                        {s.email && <span className="atm-student-sub">{s.email}</span>}
                      </td>

                      <td data-label="Status">
                        <span className={`atm-badge atm-badge--${TONE_TO_BADGE[tone] || "neutral"}`}>
                          {label}
                        </span>
                      </td>

                      <td data-label="Submitted">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                      </td>

                      <td data-label="Marking">
                        {!eligible ? (
                          <span className="atm-muted">Nothing to mark</span>
                        ) : marked ? (
                          <span className="atm-badge atm-badge--success">Marked</span>
                        ) : (
                          <span className="atm-badge atm-badge--muted">Not marked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </>
      )}
    </section>
  );
}
