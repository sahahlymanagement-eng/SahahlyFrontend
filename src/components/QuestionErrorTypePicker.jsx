import { useEffect, useState } from "react";
import { fetchCorrectionErrorTypes } from "../api/savedCorrectionData";

/**
 * "Why was the AI wrong?" — the one thing about a correction nobody can derive.
 *
 * Every other column on a SavedCorrectionData row is read out of the marking
 * blobs. This one is a judgement only the person who made the correction holds:
 * finalMark > aiMark says the AI was too strict, but not whether it misread the
 * handwriting, missed a valid alternative method, or misapplied the mark scheme
 * — and those three need completely different prompt fixes.
 *
 * Lives here, in a component the shared MarkingQuestionCard renders, rather than
 * in the four Results pages. Those four drift: a control added per page means
 * three of them silently lack it and the column comes back half-populated with
 * no sign anything is missing.
 *
 * The value rides on the question object itself (`question.errorType`), so it
 * travels with the marking result through autosave, draft save and publish with
 * no extra plumbing — every one of those paths spreads the question rather than
 * rebuilding it, and the server's sync copies the field onto the row.
 */

/**
 * Module-level cache. The list is a frozen server constant and a paper renders
 * 25 of these cards, so fetching per card would be 25 identical requests per
 * paper opened. The in-flight promise is cached too, so cards mounting in the
 * same tick share one request instead of racing.
 */
let cachedTypes = null;
let inFlight = null;

function loadTypes() {
  if (cachedTypes) return Promise.resolve(cachedTypes);
  if (!inFlight) {
    inFlight = fetchCorrectionErrorTypes()
      .then((types) => {
        cachedTypes = Array.isArray(types) ? types : [];
        return cachedTypes;
      })
      .catch(() => {
        // Never cache a failure: a dropped request must not disable the control
        // for the rest of the session.
        inFlight = null;
        return [];
      });
  }
  return inFlight;
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
  color: "var(--muted)",
};

export default function QuestionErrorTypePicker({ value, onChange }) {
  const [types, setTypes] = useState(cachedTypes || []);

  useEffect(() => {
    let alive = true;
    loadTypes().then((loaded) => {
      if (alive) setTypes(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A value already stored must stay selectable even if the server list could
  // not be loaded, or changing any other field on the card would silently drop
  // the classification the reviewer already made.
  const options = types.length
    ? types
    : value
      ? [{ value, label: value }]
      : [];

  const selected = options.find((t) => t.value === value) || null;

  return (
    <div>
      <div style={labelStyle}>AI error type</div>
      {/*
        Clearing the select stores null, not "other": "nobody has classified
        this" is a real and common state, and coercing it to "other" would
        fabricate a classification for every question a reviewer left alone.
      */}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        title={selected?.description || "Why the AI's mark was wrong"}
        disabled={!options.length}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text-primary)",
          fontSize: 12,
          boxSizing: "border-box",
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        <option value="">{options.length ? "— not classified —" : "unavailable"}</option>
        {options.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      {selected?.description ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          {selected.description}
        </div>
      ) : null}
    </div>
  );
}
