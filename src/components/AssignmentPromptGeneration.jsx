import { useEffect, useState } from "react";
import { FiCpu, FiSave, FiX, FiRotateCcw } from "react-icons/fi";
import api from "../api/api";

export default function AssignmentPromptGeneration({
  assignmentTitle,
  open,
  onClose,
  content,
  draft,
  onDraftChange,
  maxPoints,
  maxPointsLabel = "Total marks (Google Classroom):",
  generatedAt,
  loading,
  generating,
  saving,
  hasPrompt,
  onGenerate,
  onSave,
}) {
  const [masterPrompt, setMasterPrompt] = useState("");
  const [defaultMasterPrompt, setDefaultMasterPrompt] = useState("");
  const [loadingMaster, setLoadingMaster] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMaster(true);
    api
      .get("/marking/openai-master-prompts")
      .then((res) => {
        if (cancelled) return;
        const text = res.data?.promptGeneration || "";
        setDefaultMasterPrompt(text);
        setMasterPrompt((prev) => (prev.trim() ? prev : text));
      })
      .catch(() => {
        if (!cancelled) {
          setDefaultMasterPrompt("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMaster(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
            {maxPointsLabel}{" "}
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
          Edit the OpenAI prompt below, then generate. Uses the mark scheme (if uploaded) and up to 3
          turned-in student PDFs. Once saved, marking on this assignment uses the generated guidance.
        </p>

        <div className="apg-master-row">
          <label className="apg-extra-label" htmlFor="apg-master-prompt">
            OpenAI prompt (editable)
          </label>
          <button
            type="button"
            className="apg-reset-btn"
            onClick={() => setMasterPrompt(defaultMasterPrompt)}
            disabled={loadingMaster || generating || !defaultMasterPrompt}
          >
            <FiRotateCcw size={12} /> Reset to default
          </button>
        </div>
        {loadingMaster ? (
          <p className="apg-loading">Loading OpenAI prompt…</p>
        ) : (
          <textarea
            id="apg-master-prompt"
            className="apg-textarea apg-textarea--master"
            value={masterPrompt}
            onChange={(e) => setMasterPrompt(e.target.value)}
            placeholder="OpenAI prompt used to generate marking guidance…"
            rows={16}
            disabled={generating}
          />
        )}

        <div className="apg-actions" style={{ marginTop: 12, marginBottom: 16 }}>
          <button
            type="button"
            className="msv-btn-ai"
            onClick={() => onGenerate?.(masterPrompt)}
            disabled={generating || loading || loadingMaster || !masterPrompt.trim()}
          >
            {generating ? (
              <>
                <span className="pm-spinner" /> Generating…
              </>
            ) : (
              <>
                <FiCpu size={13} /> Generate from submissions
              </>
            )}
          </button>
        </div>

        <label className="apg-extra-label" htmlFor="apg-generated-draft">
          Generated marking guidance (saved for Gemini)
        </label>
        {loading ? (
          <p className="apg-loading">Loading saved prompt…</p>
        ) : (
          <textarea
            id="apg-generated-draft"
            className="apg-textarea"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Generate a prompt or write your own assignment-specific marking instructions…"
            rows={12}
          />
        )}

        <div className="apg-actions">
          <button
            type="button"
            className="msv-btn-ai msv-btn-save"
            onClick={onSave}
            disabled={saving || loading || !draft?.trim()}
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
