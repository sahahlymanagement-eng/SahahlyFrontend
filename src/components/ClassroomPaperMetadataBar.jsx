import { useState } from "react";
import { toast } from "react-toastify";
import api from "../api/api";
import {
  PAPER_METADATA_FIELDS,
  paperMetadataDraft,
  paperMetadataPatch,
  hasPaperMetadata,
} from "../constants/paperMetadataFields";

/**
 * Board / paper code / paper for a classroom assignment.
 *
 * The classroom twin of the three fields in GradingAssignmentSettingsBar. Two
 * editors rather than one because a partner assignment has no Assignment
 * document — its settings live in the provider's own collection, behind a
 * different endpoint — but both write the same three fields under the same
 * labels from constants/paperMetadataFields.js.
 *
 * SELF-CONTAINED ON PURPOSE. It owns its own state, its own save and its own
 * toast, so adding it to a page is one line. The Expected Pages control it sits
 * beside is inlined separately into two 5,000-line viewer pages, with its own
 * copy of the state and the handler in each; a third copy of that pattern is how
 * these controls end up differing between the pages nobody happens to be
 * looking at.
 *
 * Every SavedCorrectionData row for this assignment snapshots these values, and
 * saving re-stamps rows already written — so filling them in after the papers
 * are marked works exactly as well as doing it before.
 *
 * @param {string} assignmentId
 * @param {object} assignment    the assignment row, for seeding the values
 * @param {(values: object) => void} [onSaved] lets the page update its own copy
 */
export default function ClassroomPaperMetadataBar({ assignmentId, assignment, onSaved }) {
  // Seeded from the assignment, then owned locally so a save shows immediately
  // whether or not the page updates its own copy.
  const [saved, setSaved] = useState(() => paperMetadataDraft(assignment));
  const [inputs, setInputs] = useState(() => paperMetadataDraft(assignment));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed when the assignment changes, so the bar never shows the previous
  // assignment's paper — and so the assistant viewer, which passes null until
  // its fetch lands, picks the values up when they arrive.
  //
  // Adjusted during render rather than in an effect: an effect would render the
  // stale values first and then immediately re-render, and React's own guidance
  // is to compare against the previous prop and set state inline for exactly
  // this case.
  //
  // The key is the VALUES, not the assignment object. These pages rebuild that
  // object on most renders, so keying on its identity would reset the editor
  // under a reviewer mid-type.
  const seedKey = JSON.stringify({ id: assignmentId, ...paperMetadataDraft(assignment) });
  const [lastSeedKey, setLastSeedKey] = useState(seedKey);
  if (seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey);
    setSaved(paperMetadataDraft(assignment));
    setEditing(false);
  }

  if (!assignmentId) return null;

  const openEditor = () => {
    setInputs(paperMetadataDraft(saved));
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = paperMetadataPatch(inputs);
      const { data } = await api.patch(
        `/manager-assignments/${assignmentId}/paper-metadata`,
        patch
      );
      const next = paperMetadataDraft(data);
      setSaved(next);
      setEditing(false);
      onSaved?.(data);
      toast.success("Paper details saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save paper details");
    } finally {
      setSaving(false);
    }
  };

  const rowStyle = {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  const inputStyle = (width) => ({
    width,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-primary)",
  });

  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>📑 Paper details:</span>

      {!editing ? (
        <>
          {PAPER_METADATA_FIELDS.map(({ key, label }) => (
            <span key={key} style={{ fontSize: 12, color: "var(--muted)" }}>
              {label}{" "}
              <strong
                style={{
                  fontWeight: 600,
                  color: saved[key] ? "var(--success)" : "var(--muted)",
                }}
              >
                {saved[key] || "not set"}
              </strong>
            </span>
          ))}
          <button
            className="ma-send-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={openEditor}
          >
            {hasPaperMetadata(saved) ? "Edit" : "Set"}
          </button>
        </>
      ) : (
        <>
          {PAPER_METADATA_FIELDS.map(({ key, label, placeholder, width }) => (
            <label
              key={key}
              style={{
                fontSize: 12,
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {label}
              <input
                type="text"
                placeholder={placeholder}
                value={inputs[key]}
                onChange={(e) =>
                  setInputs((prev) => ({ ...prev, [key]: e.target.value }))
                }
                style={inputStyle(width)}
              />
            </label>
          ))}
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
            Leave a field empty to clear it. These are recorded on every corrected
            question for this assignment, so the marking corpus can be reported on by
            board and paper — nothing fills them in automatically.
          </span>
        </>
      )}
    </div>
  );
}
