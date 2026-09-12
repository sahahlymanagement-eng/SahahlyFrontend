import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Bar,
  Empty,
  Icon,
  MultiFileDrop,
  Skeleton,
  StatusChip,
  formatEgp,
  formatTokens,
  useToast,
} from "../ui.jsx";

/** Batch bills every token at half rate, so the quoted price has to follow the mode. */
const BATCH_MULTIPLIER = 0.5;
const MODEL_MEMORY_KEY = "sahahly.gradeModel";

const MODES = [
  {
    id: "batch",
    title: "Batch",
    tag: "half price",
    icon: "stack",
    blurb:
      "One Gemini batch job for the whole pile at 50% of the token cost. Usually back in minutes; Google allows itself up to 24 hours.",
  },
  {
    id: "instant",
    title: "Instant",
    tag: null,
    icon: "bolt",
    blurb:
      "Marks a few papers at a time straight away. Costs double batch, but you get results now.",
  },
];

export default function Grade({ examId }) {
  const toast = useToast();
  const [exams, setExams] = useState(null);
  const [runs, setRuns] = useState(null);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(examId || "");
  const [mode, setMode] = useState("batch");
  const [catalogue, setCatalogue] = useState(null);
  const [model, setModel] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.exams().then(setExams).catch((err) => setError(err.message));
    api.health().then(setHealth).catch(() => {});
    api
      .models()
      .then((data) => {
        setCatalogue(data);
        // Reuse last run's pick so a teacher who moves off the .env default only
        // has to say so once, but never select a model the server has dropped.
        const remembered = localStorage.getItem(MODEL_MEMORY_KEY);
        const known = data.models.some((entry) => entry.id === remembered);
        setModel(known ? remembered : data.defaultModel);
      })
      .catch(() => {});
  }, []);

  function chooseModel(id) {
    setModel(id);
    localStorage.setItem(MODEL_MEMORY_KEY, id);
  }

  useEffect(() => {
    // Keep the picker in sync with explicit assignment navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (examId) setSelected(examId);
  }, [examId]);

  useEffect(() => {
    const load = () => api.runs(selected || null).then(setRuns).catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [selected]);

  const readyExams = useMemo(
    () => (exams || []).filter((exam) => ["ready", "needs_review"].includes(exam.status)),
    [exams]
  );
  const maxPapers = health?.maxPapersPerRun || 60;
  const pack = readyExams.find((exam) => exam.id === selected);
  const canSubmit = Boolean(selected) && files.length > 0;

  // Keep the server's ordering inside each family; only the families are grouped.
  const modelGroups = useMemo(() => {
    const groups = new Map();
    for (const entry of catalogue?.models || []) {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group).push(entry);
    }
    return [...groups];
  }, [catalogue]);

  const chosenModel = (catalogue?.models || []).find((entry) => entry.id === model) || null;
  const modelRate = useMemo(() => {
    if (!chosenModel) return null;
    const multiplier = mode === "batch" ? BATCH_MULTIPLIER : 1;
    const egp = catalogue?.usdToEgp || 0;
    return {
      input: chosenModel.inputUsdPerMillion * multiplier * egp,
      output: chosenModel.outputUsdPerMillion * multiplier * egp,
    };
  }, [chosenModel, mode, catalogue]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    if (!selected) {
      setError("Choose a pre-processed exam from the library.");
      return;
    }
    if (!files.length) {
      setError("Attach at least one answered student PDF.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set("examId", selected);
      data.set("mode", mode);
      if (model) data.set("gradeModel", model);
      for (const file of files) data.append("studentPapers", file);
      const run = await api.createRun(data);
      toast({
        kind: "ok",
        title: `${files.length} paper${files.length === 1 ? "" : "s"} queued`,
        body: `${chosenModel?.label || "Gemini"} · ${
          mode === "batch" ? "submitted as one batch job" : "marking now, a few at a time"
        }.`,
      });
      window.location.hash = `#/runs/${run.id}`;
    } catch (err) {
      setError(err.message);
      toast({ kind: "bad", title: "Could not start the run", body: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Marking</p>
        <h1>
          Mark a <em>pile of scripts</em>
        </h1>
        <p className="subtitle">
          Pick a stored pack and drop in every student PDF you want marked. The marker works off the
          indexed questions and mark points — the saved pack is reused, with original source PDFs attached for visual context.
        </p>
      </div>

      <div className="grid-two">
        <section className="panel">
          <form onSubmit={onSubmit} className="stack">
            <label>
              Pre-processed exam
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Select an indexed exam…</option>
                {readyExams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.title} ({exam.questionCount}q / {exam.totalMarks}m)
                  </option>
                ))}
              </select>
            </label>

            {pack && (
              <div className="pulse" style={{ marginBottom: 0 }}>
                <span>
                  {pack.questionCount} questions · {pack.totalMarks} marks
                  {pack.unmatchedCount ? ` · ${pack.unmatchedCount} unmatched` : " · fully matched"}
                </span>
              </div>
            )}

            {exams && exams.length > 0 && readyExams.length === 0 && (
              <Empty title="No ready packs">
                Pre-process a question paper and mark scheme in the{" "}
                <a href="#/">exam library</a> first.
              </Empty>
            )}

            <fieldset className="modes">
              <legend>How to run it</legend>
              {MODES.map((option) => (
                <label
                  key={option.id}
                  className={`mode ${mode === option.id ? "picked" : ""}`}
                >
                  {option.tag && <span className="mode-tag">{option.tag}</span>}
                  <span className="mode-head">
                    <input
                      type="radio"
                      name="mode"
                      value={option.id}
                      checked={mode === option.id}
                      onChange={() => setMode(option.id)}
                    />
                    <Icon name={option.icon} size={15} />
                    <strong>{option.title}</strong>
                  </span>
                  <span className="muted">{option.blurb}</span>
                </label>
              ))}
            </fieldset>

            <label>
              Marking model
              <select
                value={model}
                onChange={(e) => chooseModel(e.target.value)}
                disabled={!catalogue}
              >
                {!catalogue && <option value="">Loading models…</option>}
                {modelGroups.map(([group, entries]) => (
                  <optgroup key={group} label={group}>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                        {entry.preview ? " · preview" : ""}
                        {entry.isDefault ? " · default" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {chosenModel && (
              <p className="model-note">
                <span>{chosenModel.blurb}</span>
                {modelRate && (
                  <span className="model-rate">
                    {formatEgp(modelRate.input)} in · {formatEgp(modelRate.output)} out
                    <em> per million tokens{mode === "batch" ? ", batch rate" : ""}</em>
                  </span>
                )}
              </p>
            )}

            <MultiFileDrop
              label="Student scripts"
              hint={`Answered PDFs — up to ${maxPapers} per run`}
              files={files}
              onFiles={setFiles}
              max={maxPapers}
            />

            {error && <p className="error">{error}</p>}

            <button type="submit" disabled={busy || !canSubmit}>
              {busy ? (
                <>
                  <span className="spinner tiny" /> Starting…
                </>
              ) : (
                <>
                  <Icon name={mode === "batch" ? "stack" : "bolt"} size={15} />
                  {files.length
                    ? `Mark ${files.length} paper${files.length === 1 ? "" : "s"} · ${mode}`
                    : "Attach scripts to begin"}
                </>
              )}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head" style={{ marginBottom: 14 }}>
            <h2>Recent runs</h2>
            {selected && (
              <button type="button" className="link-button" onClick={() => setSelected("")}>
                Show all exams
              </button>
            )}
          </div>

          {runs === null ? (
            <div className="skeleton-stack">
              <Skeleton height={88} radius={14} />
              <Skeleton height={88} radius={14} />
            </div>
          ) : runs.length === 0 ? (
            <Empty title="Nothing marked yet">
              Your runs, their token usage and their cost in EGP all land here.
            </Empty>
          ) : (
            <ul className="cards">
              {runs.map((run, i) => {
                const working = run.status === "queued" || run.status === "processing";
                const done = run.readyCount + run.failedCount;
                return (
                  <li key={run.id} style={{ animationDelay: `${i * 0.04}s` }}>
                    <a href={`#/runs/${run.id}`}>
                      <div className="card-head">
                        <strong>
                          {run.paperCount} paper{run.paperCount === 1 ? "" : "s"} · {run.mode}
                        </strong>
                        <StatusChip item={run} />
                      </div>
                      <p>{run.examTitle || "Exam"}</p>
                      <div style={{ margin: "9px 0 7px" }}>
                        <Bar
                          value={done}
                          max={run.paperCount}
                          tone={run.failedCount ? "warn" : "good"}
                          live={working && done === 0}
                        />
                      </div>
                      <p className="muted">
                        {run.readyCount}/{run.paperCount} marked
                        {run.failedCount ? ` · ${run.failedCount} failed` : ""}
                        {run.tokenUsage?.totalTokens
                          ? ` · ${formatTokens(run.tokenUsage.totalTokens)} tokens`
                          : ""}
                        {run.cost?.egp != null ? ` · ${formatEgp(run.cost.egp)}` : ""}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
