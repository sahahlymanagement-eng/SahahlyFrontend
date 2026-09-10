import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import AnnotatedPreview from "../AnnotatedPreview.jsx";
import {
  Icon,
  Loading,
  Ring,
  StatusChip,
  formatEgp,
  formatTokens,
  useToast,
} from "../ui.jsx";

/**
 * A single marked paper: the annotated PDF with draggable placement handles.
 *
 * Edits are held locally until "Save & regenerate", which persists the
 * placement and then asks the server for a freshly rendered PDF. Dragging alone
 * never triggers a re-render — that would mean a round trip per pixel.
 */
export default function PaperDetail({ gradingId }) {
  const toast = useToast();
  const [grading, setGrading] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [edits, setEdits] = useState({});
  const [columnEdit, setColumnEdit] = useState(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [next, place] = await Promise.all([
        api.grading(gradingId),
        api.placement(gradingId).catch(() => null),
      ]);
      setGrading(next);
      setPlacement(place);
    } catch (err) {
      setError(err.message);
    }
  }, [gradingId]);

  useEffect(() => {
    // Fetch the persisted external result for this route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const questions = useMemo(() => {
    if (!placement?.questions) return [];
    return placement.questions.map((q) => ({ ...q, ...(edits[q.id] || {}) }));
  }, [placement, edits]);

  const columnPercent = columnEdit ?? placement?.columnPercent ?? 23;
  const dirty = Object.keys(edits).length > 0 || columnEdit != null;

  const onPlacementChange = useCallback((change) => {
    if (change.columnPercent != null) {
      setColumnEdit(change.columnPercent);
      return;
    }
    setEdits((prev) => {
      const next = { ...prev[change.id] };
      if (change.page != null) next.page = change.page;
      if (change.yPercent != null) next.yPercent = Math.round(change.yPercent * 100) / 100;
      if (change.noteHeightPercent != null) {
        next.noteHeightPercent = Math.round(change.noteHeightPercent * 100) / 100;
      }
      return { ...prev, [change.id]: next };
    });
  }, []);

  // Ctrl/Cmd+S is the reflex for "commit my layout".
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { columnPercent, questions: {} };
      for (const q of questions) {
        body.questions[q.id] = {
          page: q.page,
          yPercent: q.yPercent,
          ...(q.noteHeightPercent != null ? { noteHeightPercent: q.noteHeightPercent } : {}),
        };
      }
      await api.savePlacement(gradingId, body);
      setEdits({});
      setColumnEdit(null);
      // New URL, so the preview reloads the freshly rendered PDF.
      setRevision((n) => n + 1);
      await load();
      toast({ kind: "ok", title: "Layout saved", body: "The PDF has been re-rendered." });
    } catch (err) {
      setError(err.message);
      toast({ kind: "bad", title: "Could not save the layout", body: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!window.confirm("Discard your layout edits and go back to the marker's positions?")) return;
    setSaving(true);
    try {
      await api.resetPlacement(gradingId);
      setEdits({});
      setColumnEdit(null);
      setRevision((n) => n + 1);
      await load();
      toast({ kind: "ok", title: "Positions reset" });
    } catch (err) {
      setError(err.message);
      toast({ kind: "bad", title: "Could not reset", body: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (!grading) {
    return error ? <p className="error">{error}</p> : <Loading text="Loading paper…" />;
  }

  const backHref = grading.runId ? `#/runs/${grading.runId}` : "#/grade";

  if (grading.status !== "ready") {
    return (
      <section className="panel">
        <div className="card-head">
          <div>
            <a className="back" href={backHref}>
              <Icon name="chevronLeft" size={14} /> Back
            </a>
            <h1>{grading.studentName || grading.studentFilename}</h1>
          </div>
          <StatusChip item={grading} />
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          {grading.error ||
            "This paper has not finished marking, so there is nothing to annotate yet."}
        </p>
      </section>
    );
  }

  const pdfUrl = api.annotatedPdfUrl(gradingId, { revision });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <a className="back" href={backHref}>
          <Icon name="chevronLeft" size={14} /> Back to run
        </a>
        <div className="card-head">
          <div>
            <p className="eyebrow">Marked script</p>
            <h1>{grading.studentName || grading.studentFilename}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              {formatTokens(grading.tokenUsage?.totalTokens)} tokens ·{" "}
              {formatEgp(grading.cost?.egp)}
              {grading.studentPageCount ? ` · ${grading.studentPageCount} pages` : ""}
            </p>
          </div>
          <StatusChip item={grading} />
        </div>
      </div>

      <section className="panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <Ring obtained={grading.obtainedMarks} max={grading.maxMarks} />
          <div className="grow">
            <div className="stat-value" style={{ fontSize: "1.5rem", marginBottom: 4 }}>
              {grading.obtainedMarks} / {grading.maxMarks}
            </div>
            <p className="muted small">
              {grading.result?.overallSummary || "No overall comment stored for this paper."}
            </p>
          </div>
          <div className="actions">
            <a
              className="button ghost"
              href={api.annotatedPdfUrl(gradingId, { revision })}
              target="_blank"
              rel="noopener noreferrer"
              title="Open marked PDF in a new browser tab"
            >
              <Icon name="paper" size={15} />
              Open PDF in browser
            </a>
            <a
              className="button ghost"
              href={api.annotatedPdfUrl(gradingId, { download: true, revision })}
            >
              <Icon name="download" size={15} />
              Download marked PDF
            </a>
          </div>
        </div>
      </section>

      <details className="panel">
        <summary>Question-by-question marks and explanations ({grading.result.questions.length})</summary>
        <ul className="q-list">{grading.result.questions.map(q => <li key={q.id}><div className="q-toggle static"><strong>{q.label}</strong><span className="grow">{q.examinerNotes}</span><strong>{q.obtained}/{q.maxMarks}</strong></div><div className="q-body"><p>Student page {q.page} · {q.answerIsBlank ? 'Blank answer' : q.studentAnswer}</p><p>Awarded: {q.awardedPoints.join('; ') || 'None'}</p><p>Missed: {q.missedPoints.join('; ') || 'None'}</p></div></li>)}</ul>
      </details>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Placement editor</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              Move anything that landed in the wrong place, then regenerate the PDF.
            </p>
          </div>
        </div>

        {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

        {dirty && (
          <div className="ap-dirty">
            <Icon name="alert" size={15} />
            <strong>Unsaved layout changes.</strong>
            <span>The PDF keeps the previous positions until you regenerate it.</span>
          </div>
        )}

        <div className="ap-actions" style={{ marginBottom: 16 }}>
          <button type="button" onClick={save} disabled={!dirty || saving}>
            {saving ? (
              <>
                <span className="spinner tiny" /> Regenerating…
              </>
            ) : (
              <>
                <Icon name="save" size={15} />
                Save &amp; regenerate
              </>
            )}
          </button>
          <button type="button" className="ghost" onClick={reset} disabled={saving}>
            <Icon name="refresh" size={15} />
            Reset positions
          </button>
          {dirty && <span className="muted small">Ctrl+S also saves</span>}
        </div>

        <AnnotatedPreview
          url={pdfUrl}
          studentPageCount={placement?.studentPageCount ?? grading.studentPageCount ?? 0}
          questions={questions}
          columnPercent={columnPercent}
          onPlacementChange={onPlacementChange}
        />
      </section>
    </div>
  );
}
