import { FiUsers } from "react-icons/fi";

/**
 * Pick a cohort we already hold numbers for, instead of uploading a sheet.
 *
 * Two shapes, because the backend has two kinds of student that share no model:
 *
 *   classroom — a Google Classroom class. Numbers come from the class roster, and
 *               respect the per-classroom override a teacher may have saved.
 *   partner   — a grading partner (LoginCSS, Mariam Gabalawy, Dr Peter). Those
 *               students exist only attached to submissions, so there is no class
 *               to pick: the cohort IS one assignment, and both the partner and
 *               the assignment are required.
 *
 * Nothing is fetched until "Load recipients" is pressed, and nothing is sent then
 * either — it resolves the same reviewable list an upload does.
 */

const AUDIENCE_OPTIONS = [
  ["parent", "Parents", "The parent number saved for each student"],
  ["student", "Students", "The student's own number"],
  [
    "both",
    "Parents and students",
    "Two messages per student. Where they share a number only one is sent.",
  ],
];

export default function RosterPicker({
  mode, // "classroom" | "partner"
  classrooms,
  partners,
  partnerAssignments,
  selection, // { classroomId, provider, assignmentId, audience }
  loadingOptions,
  loading,
  disabled,
  onChange,
  onLoad,
}) {
  const ready =
    mode === "classroom"
      ? Boolean(selection.classroomId)
      : Boolean(selection.provider && selection.assignmentId);

  return (
    <div className="wbc-roster">
      {mode === "classroom" ? (
        <div className="mws-field">
          <label className="mws-label" htmlFor="wbc-classroom">
            Classroom
          </label>
          <select
            id="wbc-classroom"
            className="mws-input"
            value={selection.classroomId || ""}
            onChange={(e) => onChange({ classroomId: e.target.value })}
            disabled={disabled || loadingOptions}
          >
            <option value="">
              {loadingOptions ? "Loading classrooms…" : "Choose a classroom…"}
            </option>
            {classrooms.map((c) => (
              <option key={c._id} value={c._id}>
                {[c.name, c.section].filter(Boolean).join(" · ")} — {c.studentCount} student
                {c.studentCount === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          {!loadingOptions && !classrooms.length ? (
            <p className="mws-note">
              No classrooms are assigned to your account, so there is nothing to pick here.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mws-field">
            <label className="mws-label" htmlFor="wbc-partner">
              Grading partner
            </label>
            <select
              id="wbc-partner"
              className="mws-input"
              value={selection.provider || ""}
              onChange={(e) =>
                // Clear the assignment too: assignment ids are per-partner, so
                // keeping the old one would point at a different partner's work.
                onChange({ provider: e.target.value, assignmentId: "" })
              }
              disabled={disabled || loadingOptions}
            >
              <option value="">
                {loadingOptions ? "Loading partners…" : "Choose a partner…"}
              </option>
              {partners.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mws-field">
            <label className="mws-label" htmlFor="wbc-assignment">
              Assignment
              <span className="mws-charcount">partners have no classes — one assignment is the cohort</span>
            </label>
            <select
              id="wbc-assignment"
              className="mws-input"
              value={selection.assignmentId || ""}
              onChange={(e) => onChange({ assignmentId: e.target.value })}
              disabled={disabled || !selection.provider || loadingOptions}
            >
              <option value="">
                {!selection.provider
                  ? "Choose a partner first…"
                  : loadingOptions
                  ? "Loading assignments…"
                  : "Choose an assignment…"}
              </option>
              {partnerAssignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.submissionCount} submission{a.submissionCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <fieldset className="wbc-audience">
        <legend className="mws-label">Send to</legend>
        {AUDIENCE_OPTIONS.map(([value, label, hint]) => (
          <label key={value} className="wbc-audience-option">
            <input
              type="radio"
              name="wbc-audience"
              value={value}
              checked={selection.audience === value}
              onChange={() => onChange({ audience: value })}
              disabled={disabled}
            />
            <span>
              <strong>{label}</strong>
              <span className="mws-note">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        className="mws-btn mws-btn--primary"
        onClick={onLoad}
        disabled={disabled || loading || !ready}
      >
        <FiUsers aria-hidden="true" /> {loading ? "Loading…" : "Load recipients"}
      </button>
      <p className="mws-note">
        Nothing is sent at this stage — you will see exactly who has a usable number, and
        who does not, before anything goes out.
      </p>
    </div>
  );
}
