import { useState } from "react";

// Inline editor for a grading partner's per-assignment settings.
//
// Mirrors the "Expected Pages" bar in the classroom submission viewer, with a
// second field for the grade cap. Both are optional — an unset value means the
// feature is off for this assignment, which is how every existing assignment
// behaves until someone sets a number here.
//
// Controlled by useGradingAssignmentSettings:
//   state = { settings, loading, saving, save }
export default function GradingAssignmentSettingsBar({ state, partnerGrade }) {
  const { settings, saving, save } = state;
  const [editing, setEditing] = useState(false);
  const [pagesInput, setPagesInput] = useState("");
  const [gradeInput, setGradeInput] = useState("");

  // Seed the drafts from the saved values on open, so the editor never shows a
  // stale draft from a previous edit or a different assignment.
  const openEditor = () => {
    setPagesInput(settings.expectedPages != null ? String(settings.expectedPages) : "");
    setGradeInput(settings.maxGrade != null ? String(settings.maxGrade) : "");
    setEditing(true);
  };

  const handleSave = async () => {
    const parse = (raw) => {
      const trimmed = raw.trim();
      return trimmed === "" ? null : Number(trimmed);
    };
    const ok = await save({ expectedPages: parse(pagesInput), maxGrade: parse(gradeInput) });
    if (ok) setEditing(false);
  };

  const chip = (label, value, suffix) => (
    <span style={{ fontSize: 12, color: "var(--muted)" }}>
      {label}{" "}
      <strong style={{ color: value != null ? "var(--success)" : "var(--muted)", fontWeight: 600 }}>
        {value != null ? `${value}${suffix}` : "not set"}
      </strong>
    </span>
  );

  return (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      {!editing ? (
        <>
          {chip("📄 Expected pages:", settings.expectedPages, "")}
          {chip("🎯 Max grade:", settings.maxGrade, "")}
          <button
            className="ma-send-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={openEditor}
          >
            {settings.expectedPages != null || settings.maxGrade != null ? "Edit" : "Set"}
          </button>
          {settings.maxGrade == null && partnerGrade != null && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              (partner says this assignment is out of {partnerGrade})
            </span>
          )}
        </>
      ) : (
        <>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            📄 Expected pages
            <input
              type="number"
              min={1}
              placeholder="e.g. 8"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              style={{
                width: 80, fontSize: 12, padding: "4px 8px", borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)",
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            🎯 Max grade
            <input
              type="number"
              min={0}
              step="any"
              placeholder={partnerGrade != null ? `e.g. ${partnerGrade}` : "e.g. 20"}
              value={gradeInput}
              onChange={(e) => setGradeInput(e.target.value)}
              style={{
                width: 80, fontSize: 12, padding: "4px 8px", borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)",
              }}
            />
          </label>
          <button
            className="ma-send-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className="msv-cancel-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", flexBasis: "100%" }}>
            Leave a field empty to turn it off. Max grade caps every submission in this
            assignment, even when the AI marks it out of a different total.
          </span>
        </>
      )}
    </div>
  );
}
