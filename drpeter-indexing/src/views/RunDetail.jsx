import { Fragment, useEffect, useState } from "react";
import { api } from "../api.js";
import {
  AnimatedNumber,
  Bar,
  Icon,
  Loading,
  Stat,
  StatusChip,
  formatDuration,
  formatEgp,
  formatTokens,
  formatUsd,
  statusLabel,
  toneFor,
  useToast,
} from "../ui.jsx";

const OPEN_STATES = new Set(["queued", "processing"]);

const BATCH_STATE_NOTES = {
  JOB_STATE_QUEUED: "Google has accepted the job and is waiting to start it.",
  JOB_STATE_PENDING: "Google is preparing the job.",
  JOB_STATE_RUNNING: "Google is marking the papers now.",
  JOB_STATE_CANCELLING: "Cancelling.",
};

function QuestionBreakdown({ grading }) {
  const questions = grading.result?.questions || [];
  if (grading.loadingResult) {
    return <p className="muted q-body">Loading question detail…</p>;
  }
  if (grading.resultError) {
    return <p className="error q-body">{grading.resultError}</p>;
  }
  if (!questions.length) return <p className="muted q-body">No per-question detail stored.</p>;
  return (
    <div className="q-body">
      {grading.result?.overallSummary && (
        <p style={{ marginBottom: 10 }}>{grading.result.overallSummary}</p>
      )}
      <ul className="q-list">
        {questions.map((q) => (
          <li
            key={q.id}
            className={q.obtained === q.maxMarks ? "full" : q.obtained === 0 ? "zero" : ""}
          >
            <div className="q-toggle static">
              <span className="q-id">{q.label}</span>
              <span className="grow">{q.examinerNotes || q.stem}</span>
              <span className="marks">
                {q.obtained}/{q.maxMarks}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RunDetail({ runId }) {
  const toast = useToast();
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detailById, setDetailById] = useState({});

  useEffect(() => {
    let timer;
    let cancelled = false;

    async function poll() {
      try {
        const next = await api.run(runId);
        if (cancelled) return;
        setRun(next);
        setError("");
        // Batch jobs can sit in Google's queue for a long time, so back off.
        const wait = next.mode === "batch" ? 5000 : 1500;
        if (OPEN_STATES.has(next.status) || next.gradings?.some(g=>g.status==='ready' && g.partnerSubmissionId && g.viewerSyncStatus!=='synced')) timer = setTimeout(poll, wait);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    setRun(null);
    setError("");
    setOpenId(null);
    setDetailById({});
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  async function togglePaper(grading) {
    const nextOpen = openId === grading.id ? null : grading.id;
    setOpenId(nextOpen);
    if (!nextOpen) return;
    if (grading.result || detailById[grading.id]?.result) return;
    if (!grading.hasResult) return;

    setDetailById((prev) => ({
      ...prev,
      [grading.id]: { ...(prev[grading.id] || {}), loadingResult: true, resultError: null },
    }));
    try {
      const full = await api.grading(grading.id);
      setDetailById((prev) => ({
        ...prev,
        [grading.id]: { result: full.result, loadingResult: false, resultError: null },
      }));
    } catch (err) {
      setDetailById((prev) => ({
        ...prev,
        [grading.id]: { loadingResult: false, resultError: err.message },
      }));
    }
  }

  if (!run) {
    return error ? <p className="error">{error}</p> : <Loading text="Loading run…" />;
  }

  const gradings = run.gradings || [];
  const cost = run.cost;
  const working = OPEN_STATES.has(run.status);
  const marked = gradings.filter((g) => g.status === "ready");
  const totalObtained = marked.reduce((sum, g) => sum + (g.obtainedMarks || 0), 0);
  const totalPossible = marked.reduce((sum, g) => sum + (g.maxMarks || 0), 0);
  const done = run.readyCount + run.failedCount;
  const average = totalPossible > 0 ? totalObtained / totalPossible : null;

  async function cancel() {
    try {
      await api.cancelRun(run.id);
      setRun(await api.run(run.id));
      toast({ kind: "ok", title: "Run cancelled" });
    } catch (err) {
      toast({ kind: "bad", title: "Could not cancel", body: err.message });
    }
  }

  async function remove() {
    if (!window.confirm("Delete this run and all of its marked papers?")) return;
    try {
      await api.deleteRun(run.id);
      toast({ kind: "ok", title: "Run deleted" });
      window.location.hash = "#/grade";
    } catch (err) {
      toast({ kind: "bad", title: "Could not delete", body: err.message });
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      {['drpeter','classroom','mariamgabalawy'].includes(run.partnerProvider) && <section className="panel"><h2>Results in the assignment viewer</h2><p>Close this window and use Results beside each student to view and edit their marked paper. Use the existing {run.partnerProvider === 'classroom' ? 'Return All' : 'Publish All'} button to return results.</p></section>}
      <div className="page-head" style={{ marginBottom: 0 }}>
        <a className="back" href="#/grade">
          <Icon name="chevronLeft" size={14} /> Marking
        </a>
        <div className="card-head">
          <div>
            <p className="eyebrow">{run.mode === "batch" ? "Batch · half price" : "Instant · full price"}</p>
            <h1>
              {run.paperCount} paper{run.paperCount === 1 ? "" : "s"} marked
            </h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {run.examTitle || "Exam"}
              {run.gradeModel ? ` · ${run.gradeModel}` : ""}
              {run.durationMs ? ` · ${formatDuration(run.durationMs)}` : ""}
            </p>
          </div>
          <StatusChip item={run} />
        </div>
      </div>

      <div className="panel" style={{ padding: "18px 24px" }}>
        <div className="card-head" style={{ marginBottom: 10, alignItems: "center" }}>
          <strong style={{ fontSize: 13 }}>
            {done} of {run.paperCount} finished
          </strong>
          <span className="muted small">
            {run.readyCount} marked
            {run.failedCount ? ` · ${run.failedCount} failed` : ""}
          </span>
        </div>
        <Bar
          value={done}
          max={run.paperCount}
          tone={run.failedCount ? "warn" : "good"}
          live={working && done === 0}
        />
      </div>

      {working && run.mode === "batch" && (
        <p className="pulse" style={{ marginBottom: 0 }}>
          {BATCH_STATE_NOTES[run.jobState] ||
            "Waiting on Gemini's batch queue. This page keeps polling, and you can safely close it — the run continues on the server."}
        </p>
      )}
      {working && run.mode === "instant" && (
        <p className="pulse" style={{ marginBottom: 0 }}>
          Marking {Math.min(done + 1, run.paperCount)} of {run.paperCount}…
        </p>
      )}
      {run.failedCount > 0 && !working && <button onClick={async () => { try { await api.retryRun(run.id); window.location.reload(); } catch (err) { toast({ kind: "bad", title: "Retry failed", body: err.message }); } }}>Retry failed papers using saved index</button>}
      {run.error && <p className="error">{run.error}</p>}

      <div className="stat-grid" style={{ marginBottom: 0 }}>
        <Stat
          icon="check"
          tone="good"
          label="Marked"
          value={
            <>
              <AnimatedNumber value={run.readyCount} />
              <span style={{ color: "var(--muted)", fontSize: "1rem" }}>/{run.paperCount}</span>
            </>
          }
          foot={run.failedCount ? `${run.failedCount} failed` : "None failed"}
        />
        <Stat
          icon="target"
          tone={average == null ? undefined : toneFor(average)}
          label="Average"
          value={average == null ? "—" : `${Math.round(average * 100)}%`}
          foot={totalPossible > 0 ? `${totalObtained}/${totalPossible} marks` : null}
        />
        <Stat
          icon="bolt"
          tone="accent"
          label="Total tokens"
          value={formatTokens(run.tokenUsage?.totalTokens)}
          foot={`${formatTokens(run.tokenUsage?.promptTokens)} in`}
        />
        <Stat
          icon="coins"
          tone="warn"
          label="Cost"
          value={formatEgp(cost?.egp)}
          foot={cost?.usd != null ? `${formatUsd(cost.usd)} USD` : null}
        />
        <Stat
          icon="clock"
          label="Elapsed"
          value={formatDuration(run.durationMs)}
          foot={run.mode === "batch" ? "Batch queue included" : null}
        />
      </div>

      {cost && (
        <p className="muted small">
          {cost.inputUsdPerMillion != null && cost.outputUsdPerMillion != null
            ? `Billed at ${formatUsd(cost.inputUsdPerMillion)} per 1M input tokens and ${formatUsd(
                cost.outputUsdPerMillion
              )} per 1M output tokens, converted at 1 USD = ${cost.usdToEgp} EGP.`
            : `Converted at 1 USD = ${cost.usdToEgp} EGP.`}
          {cost.estimated
            ? " This model is not in the price table, so the figure is an estimate."
            : ""}
        </p>
      )}

      <div className="actions">
        {working && (
          <button type="button" className="ghost" onClick={cancel}>
            <Icon name="x" size={15} />
            Cancel run
          </button>
        )}
        <a className="button ghost" href="#/grade">
          <Icon name="upload" size={15} />
          Mark another pile
        </a>
        <button type="button" className="danger" onClick={remove}>
          <Icon name="trash" size={15} />
          Delete run
        </button>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Per paper</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Click a row for its per-question awards, or open the marked PDF to check where the
              marks sit on the script.
            </p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Paper</th>
                <th>Status</th>
                <th className="num">Score</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th className="num">Tokens</th>
                <th className="num">Cost (EGP)</th>
                <th className="num">Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gradings.map((grading) => {
                const open = openId === grading.id;
                const detail = detailById[grading.id] || {};
                const enriched = {
                  ...grading,
                  result: grading.result || detail.result || null,
                  loadingResult: detail.loadingResult,
                  resultError: detail.resultError,
                };
                const canExpand = Boolean(grading.result || grading.hasResult);
                const ratio =
                  grading.maxMarks > 0 ? grading.obtainedMarks / grading.maxMarks : null;
                return (
                  <Fragment key={grading.id}>
                    <tr
                      className={`${grading.status === "error" ? "row-bad" : ""} ${
                        canExpand ? "clickable" : ""
                      }`}
                      onClick={() => grading.status === "ready" ? (window.location.hash = `#/papers/${grading.id}`) : canExpand && togglePaper(grading)}
                    >
                      <td>
                        <strong>{grading.studentName || grading.studentFilename}</strong>
                        {grading.studentName && (
                          <div className="muted small">{grading.studentFilename}</div>
                        )}
                      </td>
                      <td>
                        <span className={`chip ${grading.status === "ready" ? "ok" : grading.status === "error" ? "bad" : "busy"}`}>
                          {statusLabel(grading)}
                        </span>
                      </td>
                      <td className="num">
                        {grading.status === "ready" ? (
                          <>
                            <strong>
                              {grading.obtainedMarks}/{grading.maxMarks}
                            </strong>
                            <div
                              className="small"
                              style={{
                                color:
                                  ratio == null
                                    ? "var(--muted)"
                                    : `var(--${
                                        toneFor(ratio) === "good"
                                          ? "success"
                                          : toneFor(ratio) === "warn"
                                            ? "warning"
                                            : "danger"
                                      })`,
                                fontWeight: 700,
                              }}
                            >
                              {grading.percent}%
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{formatTokens(grading.tokenUsage?.promptTokens)}</td>
                      <td className="num">{formatTokens(grading.cost?.outputTokens)}</td>
                      <td className="num">{formatTokens(grading.tokenUsage?.totalTokens)}</td>
                      <td className="num">{formatEgp(grading.cost?.egp)}</td>
                      <td className="num">{formatDuration(grading.durationMs)}</td>
                      <td>
                        {grading.status === "ready" && (
                          <a
                            className="row-link"
                            href={`#/papers/${grading.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Icon name="paper" size={12} />
                            Marked PDF
                          </a>
                        )}
                        {grading.partnerSubmissionId && grading.status === 'ready' && <p className={grading.viewerSyncError?'error':'muted'}>{grading.viewerSyncStatus==='synced'?'Available in student Results':grading.viewerSyncError || 'Saving to student Results…'}</p>}
                        {grading.usageAccountingError && <p role="status" className="error">Token usage is saved locally and waiting to sync: {grading.usageAccountingError} The server will retry automatically.</p>}
                      </td>
                    </tr>
                    {grading.error && (
                      <tr>
                        <td colSpan={9} className="error-cell">
                          {grading.error}
                        </td>
                      </tr>
                    )}
                    {open && (
                      <tr>
                        <td colSpan={9}>
                          <QuestionBreakdown grading={enriched} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td>
                  {run.readyCount} marked
                  {run.failedCount ? `, ${run.failedCount} failed` : ""}
                </td>
                <td className="num">
                  {totalPossible > 0 ? `${totalObtained}/${totalPossible}` : "—"}
                </td>
                <td className="num">{formatTokens(run.tokenUsage?.promptTokens)}</td>
                <td className="num">{formatTokens(cost?.outputTokens)}</td>
                <td className="num">{formatTokens(run.tokenUsage?.totalTokens)}</td>
                <td className="num">
                  <strong>{formatEgp(cost?.egp)}</strong>
                </td>
                <td className="num">{formatDuration(run.durationMs)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
