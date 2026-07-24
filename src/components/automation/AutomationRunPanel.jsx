import {
  FiActivity,
  FiAlertTriangle,
  FiCheck,
  FiRefreshCw,
  FiRotateCw,
  FiSkipForward,
  FiXCircle,
} from "react-icons/fi";
import {
  RESUME_STEP_LABELS,
  STAGES,
  canContinue,
  humanize,
  isRunActive,
  progressIndex,
  runCounts,
  statusTone,
} from "./automationStatus";

/**
 * Live view of the current run for the selected assignment.
 *
 * Because the pipeline is fire-and-forget, this panel is the only place the
 * work is visible — and it rehydrates from the same /status poll after a
 * reload, so leaving the tab mid-run loses nothing.
 *
 * A halt is deliberately not styled as a failure: the run stopped on purpose
 * because the mark scheme needs a human, and the manager has already been
 * messaged. Only `failed` gets the error treatment.
 *
 * Both states are resumable. The backend records where to pick up in
 * `resumeStep` — the step *after* a halt (so Continue overrides the mark-scheme
 * objection and carries on), or the step that threw (so Continue retries it) —
 * and Continue runs from there through to the end.
 */

function Stepper({ run }) {
  const reached = progressIndex(run);
  const active = isRunActive(run);
  const stopped = run?.status === "failed" || run?.status === "halted_markscheme";

  return (
    <ol className="atm-stepper">
      {STAGES.map((stage, i) => {
        let state = "pending";
        if (i < reached) state = "done";
        else if (i === reached) state = stopped ? "stopped" : active ? "active" : "done";

        return (
          <li key={stage.key} className={`atm-step atm-step--${state}`}>
            <span className="atm-step-dot" aria-hidden="true">
              {state === "done" ? <FiCheck size={11} /> : state === "stopped" ? "!" : null}
            </span>
            <span className="atm-step-label">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Meta({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="atm-meta">
      <span className="atm-meta-label">{label}</span>
      <span className="atm-meta-value">{value}</span>
    </div>
  );
}

export default function AutomationRunPanel({
  run,
  loading,
  starting,
  busy,
  remark,
  onRefresh,
  onForceRetry,
  onContinue,
}) {
  const active = isRunActive(run);
  const counts = runCounts(run);
  const resumable = canContinue(run);
  const resumeLabel = RESUME_STEP_LABELS[run?.resumeStep] || "the next step";
  // Re-mark is a per-action choice made on the Run card above; say so on the
  // button, since pressing Continue with it armed deletes saved marks.
  const continueLabel = remark ? "Continue and re-mark" : "Continue";
  const scoped =
    run?.selectionMode === "subset" || run?.selectedSubmissionIds?.length
      ? `${run.scopedCount ?? run.selectedSubmissionIds?.length ?? "?"} selected submissions`
      : run
        ? "All eligible submissions"
        : null;

  return (
    <section className="atm-card">
      <header className="atm-card-header">
        <h2 className="atm-card-title">
          <FiActivity aria-hidden="true" /> Run status
          {run?.status && (
            <span className={`atm-badge atm-badge--${statusTone(run.status)} atm-badge--inline`}>
              {humanize(run.status)}
            </span>
          )}
          {run?.dryRun && <span className="atm-badge atm-badge--muted atm-badge--inline">Dry run</span>}
        </h2>
        <button
          type="button"
          className="sah-btn sah-btn--secondary atm-btn--sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <FiRefreshCw aria-hidden="true" className={active || loading ? "atm-spin" : undefined} />
          Refresh
        </button>
      </header>

      {starting ? (
        <p className="atm-empty">Starting the run…</p>
      ) : loading && !run ? (
        <p className="atm-empty">Loading run status…</p>
      ) : !run ? (
        <p className="atm-empty">No automation has run for this assignment yet.</p>
      ) : (
        <>
          <Stepper run={run} />

          <div className="atm-meta-grid">
            <Meta label="Stage" value={humanize(run.stage) || "—"} />
            <Meta label="Scope" value={scoped} />
            <Meta
              label="Marked"
              value={
                counts.saved != null || counts.total != null
                  ? `${counts.saved ?? "?"} / ${counts.total ?? "?"}${
                      counts.failed ? ` · ${counts.failed} failed` : ""
                    }`
                  : null
              }
            />
            <Meta label="Expected pages" value={run.expectedPagesComputed} />
            <Meta
              label="Re-marked"
              value={run.remark ? `${run.remarkedCount || 0} cleared and redone` : null}
            />
            <Meta
              label="Started"
              value={run.startedAt ? new Date(run.startedAt).toLocaleString() : null}
            />
            <Meta
              label="Updated"
              value={run.updatedAt ? new Date(run.updatedAt).toLocaleString() : null}
            />
            <Meta label="Triggered by" value={run.triggeredBy?.name || run.triggeredByName} />
          </div>

          {run.status === "halted_markscheme" && (
            <div className="atm-notice atm-notice--warning">
              <FiAlertTriangle aria-hidden="true" />
              <div>
                <p className="atm-notice-title">
                  Halted — the mark scheme needs review
                  {run.markSchemeStatus ? ` (${humanize(run.markSchemeStatus)})` : ""}
                </p>
                {run.markSchemeSummary && (
                  <p className="atm-notice-text">{run.markSchemeSummary}</p>
                )}
                <p className="atm-notice-text">
                  Nothing was marked, and the manager has been messaged to review it. Fix the mark
                  scheme and run again
                  {resumable
                    ? ` — or continue anyway to accept it as it stands and pick up at ${resumeLabel}.`
                    : "."}
                </p>
                {resumable && (
                  <button
                    type="button"
                    className="sah-btn sah-btn--secondary atm-btn--sm atm-notice-btn"
                    onClick={onContinue}
                    disabled={busy}
                  >
                    <FiSkipForward aria-hidden="true" />{" "}
                    {remark ? continueLabel : "Continue anyway"}
                  </button>
                )}
              </div>
            </div>
          )}

          {run.status === "failed" && (
            <div className="atm-notice atm-notice--danger">
              <FiXCircle aria-hidden="true" />
              <div>
                <p className="atm-notice-title">
                  The run failed{run.resumeStep ? ` at ${resumeLabel}` : ""}
                </p>
                {run.error && <p className="atm-notice-text">{run.error}</p>}
                {resumable && (
                  <p className="atm-notice-text">
                    Continue retries from that step — submissions already marked are skipped.
                  </p>
                )}
                <div className="atm-notice-actions">
                  {resumable && (
                    <button
                      type="button"
                      className="sah-btn sah-btn--secondary atm-btn--sm"
                      onClick={onContinue}
                      disabled={busy}
                    >
                      <FiSkipForward aria-hidden="true" /> {continueLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="sah-btn sah-btn--ghost atm-btn--sm"
                    onClick={onForceRetry}
                    disabled={busy}
                  >
                    <FiRotateCw aria-hidden="true" /> Restart with Force
                  </button>
                </div>
              </div>
            </div>
          )}

          {run.status === "marking_done" && (
            <div className="atm-notice atm-notice--success">
              <FiCheck aria-hidden="true" />
              <div>
                <p className="atm-notice-title">
                  {run.dryRun ? "Dry run finished" : "Marking finished"}
                </p>
                <p className="atm-notice-text">
                  {run.dryRun
                    ? "Nothing was marked or sent — this was a rehearsal of the pipeline."
                    : `Results are saved and visible in the Submission Viewer.${
                        run.remarkedCount
                          ? ` ${run.remarkedCount} previous result(s) were replaced.`
                          : ""
                      }${counts.failed ? ` ${counts.failed} submission(s) failed to mark.` : ""}`}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
