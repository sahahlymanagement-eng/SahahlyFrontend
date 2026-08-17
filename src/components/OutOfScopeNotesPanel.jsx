/**
 * "Not included in your assignment" markers the marker put on the paper.
 *
 * They are stamped on the annotated PDF like a question mark box, but they are
 * not questions, so the question cards cannot delete them. This panel is the
 * only place they can be removed — and, like removing a question, the removal
 * only lands when the grader confirms edits.
 */
export default function OutOfScopeNotesPanel({ notes, onRemove }) {
  if (!Array.isArray(notes) || notes.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 12,
        background: "var(--surface)",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        Out-of-scope notes (Not included in your assignment)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.map((note, idx) => (
          <div
            key={`${idx}-${String(note?.label || "")}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {note?.label || "Not included in your assignment"}
            </div>
            <button
              type="button"
              className="msv-icon-btn"
              onClick={() => onRemove(idx)}
              title="Remove note on confirm edits"
              style={{
                border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
                background: "transparent",
                color: "var(--danger)",
                borderRadius: 10,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
