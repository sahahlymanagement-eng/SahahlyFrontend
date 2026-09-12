import { useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../api/api";
import { assertPdfBlob, getApiErrorMessage } from "../utils/markingFormData";
import {
  PAPER_METADATA_FIELDS,
  paperMetadataDraft,
  paperMetadataPatch,
  hasPaperMetadata,
} from "../constants/paperMetadataFields";
import {
  markSchemeUploadPath,
  markSchemeFilePath,
  providerMarkSchemePath,
} from "../hooks/useGradingAssignmentSettings";

/** Fetch a PDF through Sahahly (auth'd) and open it in a new tab as a blob. */
async function openPdfInNewTab(path, label) {
  const res = await api.get(path, { responseType: "blob", timeout: 60000 });
  const file = new File([res.data], `${label}.pdf`, { type: "application/pdf" });
  await assertPdfBlob(file, label);
  window.open(URL.createObjectURL(file), "_blank", "noopener,noreferrer");
}

// Inline editor for a grading partner's per-assignment settings.
//
// Mirrors the "Expected Pages" bar in the classroom submission viewer, with a
// field for the grade cap and three for the paper's exam identity. All are
// optional — an unset value means the feature is off for this assignment, which
// is how every existing assignment behaves until someone fills something in.
//
// Board / paper code / paper are typed, not detected. They exist nowhere else in
// the marking flow, and every SavedCorrectionData row for this assignment
// snapshots them, so filling them in is what makes the correction corpus
// sliceable by board and paper. The backend re-stamps rows already written when
// they are saved, so doing it after the papers are marked still works.
//
// Controlled by useGradingAssignmentSettings:
//   state = { settings, loading, saving, save }
/** True when anything has been set, so the button reads "Edit" and not "Set". */
const hasAnySetting = (s) =>
  s.expectedPages != null || s.maxGrade != null || hasPaperMetadata(s);

export default function GradingAssignmentSettingsBar({ state, partnerGrade, provider, assignmentId }) {
  const { settings, saving, save, refresh } = state;
  const [editing, setEditing] = useState(false);
  const [pagesInput, setPagesInput] = useState("");
  const [gradeInput, setGradeInput] = useState("");
  const [paperInputs, setPaperInputs] = useState(() => paperMetadataDraft(null));
  const [viewingProviderMs, setViewingProviderMs] = useState(false);
  const [viewingUploadedMs, setViewingUploadedMs] = useState(false);
  const [uploadingMs, setUploadingMs] = useState(false);
  const fileInputRef = useRef(null);

  const canManageMarkScheme = assignmentId != null;

  const viewProviderMarkScheme = async () => {
    setViewingProviderMs(true);
    try {
      await openPdfInNewTab(
        providerMarkSchemePath(provider, assignmentId),
        `mark-scheme-${assignmentId}`
      );
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "No mark scheme found from the provider for this assignment");
    } finally {
      setViewingProviderMs(false);
    }
  };

  const viewUploadedMarkScheme = async () => {
    setViewingUploadedMs(true);
    try {
      await openPdfInNewTab(
        markSchemeFilePath(provider, assignmentId),
        `mark-scheme-${assignmentId}`
      );
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to open the uploaded mark scheme");
    } finally {
      setViewingUploadedMs(false);
    }
  };

  const pickMarkSchemeFile = () => fileInputRef.current?.click();

  const uploadMarkScheme = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingMs(true);
    try {
      const fd = new FormData();
      fd.append("markScheme", file);
      await api.post(markSchemeUploadPath(provider, assignmentId), fd);
      toast.success("Mark scheme uploaded — it will be used instead of the provider's for marking");
      await refresh?.();
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Failed to upload mark scheme");
    } finally {
      setUploadingMs(false);
    }
  };

  // Seed the drafts from the saved values on open, so the editor never shows a
  // stale draft from a previous edit or a different assignment.
  const openEditor = () => {
    setPagesInput(settings.expectedPages != null ? String(settings.expectedPages) : "");
    setGradeInput(settings.maxGrade != null ? String(settings.maxGrade) : "");
    setPaperInputs(paperMetadataDraft(settings));
    setEditing(true);
  };

  const handleSave = async () => {
    const parse = (raw) => {
      const trimmed = raw.trim();
      return trimmed === "" ? null : Number(trimmed);
    };
    const ok = await save({
      expectedPages: parse(pagesInput),
      maxGrade: parse(gradeInput),
      ...paperMetadataPatch(paperInputs),
    });
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
      {canManageMarkScheme && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={uploadMarkScheme}
          />
          <button
            className="ma-send-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={viewProviderMarkScheme}
            disabled={viewingProviderMs}
            title="Open the mark scheme the provider attached to this assignment"
          >
            {viewingProviderMs ? "Opening…" : "📖 View provider mark scheme"}
          </button>
          <button
            className="ma-send-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={pickMarkSchemeFile}
            disabled={uploadingMs}
            title="Upload a mark scheme from our side — overrides the provider's for marking"
          >
            {uploadingMs
              ? "Uploading…"
              : settings.ourMarkSchemeAvailable
              ? "🔁 Replace uploaded mark scheme"
              : "⬆️ Upload mark scheme"}
          </button>
          {settings.ourMarkSchemeAvailable && (
            <button
              className="ma-send-btn"
              style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={viewUploadedMarkScheme}
              disabled={viewingUploadedMs}
              title={
                settings.ourMarkSchemeUploadedAt
                  ? `Uploaded ${new Date(settings.ourMarkSchemeUploadedAt).toLocaleString()}`
                  : undefined
              }
            >
              {viewingUploadedMs ? "Opening…" : "👁 View uploaded PDF"}
            </button>
          )}
        </>
      )}
      {!editing ? (
        <>
          {chip("📄 Expected pages:", settings.expectedPages, "")}
          {chip("🎯 Max grade:", settings.maxGrade, "")}
          {chip("🏛 Board:", settings.board, "")}
          {chip("🔖 Paper code:", settings.paperCode, "")}
          {chip("📘 Paper:", settings.paperNumber, "")}
          <button
            className="ma-send-btn"
            style={{ fontSize: 11, padding: "4px 10px" }}
            onClick={openEditor}
          >
            {hasAnySetting(settings) ? "Edit" : "Set"}
          </button>
          {settings.maxGrade == null && partnerGrade != null && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              (partner says this assignment is out of {partnerGrade})
            </span>
          )}
          {settings.inventoryMaxMarks != null && (
            <span
              style={{
                fontSize: 11,
                color:
                  partnerGrade != null &&
                  Math.abs(Number(partnerGrade) - Number(settings.inventoryMaxMarks)) > 3
                    ? "#fbbf24"
                    : "var(--muted)",
              }}
              title="Sum of marks on the stored mark-scheme inventory"
            >
              (mark scheme inventory: {settings.inventoryMaxMarks}
              {settings.inventoryItemCount
                ? ` across ${settings.inventoryItemCount} items`
                : ""}
              {partnerGrade != null &&
              Math.abs(Number(partnerGrade) - Number(settings.inventoryMaxMarks)) > 3
                ? " — set Max grade if the partner total looks wrong"
                : ""}
              )
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
          {PAPER_METADATA_FIELDS.map(({ key, label, placeholder, width }) => (
            <label
              key={key}
              style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}
            >
              {label}
              <input
                type="text"
                placeholder={placeholder}
                value={paperInputs[key]}
                onChange={(e) =>
                  setPaperInputs((prev) => ({ ...prev, [key]: e.target.value }))
                }
                style={{
                  width, fontSize: 12, padding: "4px 8px", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-primary)",
                }}
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
            Leave a field empty to turn it off. Max grade caps every submission in this
            assignment, even when the AI marks it out of a different total. Board, paper
            code and paper are recorded on every corrected question so the marking
            corpus can be reported on by paper — nothing fills them in automatically.
          </span>
        </>
      )}
    </div>
  );
}
