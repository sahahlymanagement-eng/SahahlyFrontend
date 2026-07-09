import { FiCpu, FiSave, FiX } from "react-icons/fi";

export default function AssignmentPromptGeneration({
  assignmentTitle,
  open,
  onClose,
  content,
  draft,
  onDraftChange,
  maxPoints,
  generatedAt,
  loading,
  generating,
  saving,
  hasPrompt,
  onGenerate,
  onSave,
}) {
  if (!open) return null;

  return (
    <div className="msv-overlay" onClick={onClose}>
      <div className="msv-guidance-modal apg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="msv-guidance-header">
          <div>
            <h3>Prompt Generation</h3>
            <p className="apg-subtitle">
              {assignmentTitle
                ? `${assignmentTitle} — personalized marking instructions for Gemini`
                : "Generate assignment-specific marking instructions"}
            </p>
          </div>
          <button type="button" className="msv-icon-btn" onClick={onClose} aria-label="Close">
            <FiX size={16} />
          </button>
        </div>

        <div className="apg-meta">
          <span>
            Total marks (Google Classroom):{" "}
            <strong>{maxPoints != null ? maxPoints : "—"}</strong>
          </span>
          {generatedAt ? (
            <span>Last generated: {new Date(generatedAt).toLocaleString()}</span>
          ) : null}
          {hasPrompt ? (
            <span className="apg-badge apg-badge--active">Active for all marking on this assignment</span>
          ) : (
            <span className="apg-badge">No saved prompt yet</span>
          )}
        </div>

        <p className="apg-help">
          Uses up to 3 turned-in student submission PDFs and OpenAI to draft examiner guidance.
          Once saved, single, bulk, batch, and priority marking on this assignment use this prompt
          automatically (total marks are always passed to Gemini).
        </p>

        {loading ? (
          <p className="apg-loading">Loading saved prompt…</p>
        ) : (
          <textarea
            className="apg-textarea"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Generate a prompt or write your own assignment-specific marking instructions…"
            rows={16}
          />
        )}

        <div className="apg-actions">
          <button
            type="button"
            className="msv-btn-ai"
            onClick={onGenerate}
            disabled={generating || loading}
          >
            {generating ? (
              <>
                <span className="pm-spinner" /> Generating…
              </>
            ) : (
              <>
                <FiCpu size={13} /> Generate from 3 submissions
              </>
            )}
          </button>
          <button
            type="button"
            className="msv-btn-ai"
            onClick={onSave}
            disabled={saving || loading || !draft?.trim()}
            style={{ background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.35)" }}
          >
            {saving ? "Saving…" : (
              <>
                <FiSave size={13} /> Save prompt
              </>
            )}
          </button>
          <button type="button" className="msv-cancel-btn" onClick={onClose}>
            Close
          </button>
        </div>

        {content?.trim() && content !== draft ? (
          <p className="apg-help" style={{ marginTop: 12, color: "#fbbf24" }}>
            You have unsaved edits. Save to apply this prompt to marking.
          </p>
        ) : null}
      </div>
    </div>
  );
}
