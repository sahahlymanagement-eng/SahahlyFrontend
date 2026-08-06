import { FiClock, FiRotateCcw, FiSave } from "react-icons/fi";

function formatSavedAt(savedAt) {
  if (!savedAt) return null;
  const at = new Date(savedAt);
  if (Number.isNaN(at.getTime())) return null;

  const minutesAgo = Math.round((Date.now() - at.getTime()) / 60000);
  const clock = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (minutesAgo < 1) return "just now";
  if (minutesAgo < 60) return `${minutesAgo} min ago (${clock})`;
  const hoursAgo = Math.round(minutesAgo / 60);
  return `${hoursAgo}h ago (${clock})`;
}

/**
 * Shown when a paper opens with edits that were autosaved but never confirmed.
 *
 * The point of the banner is that restored edits must not be mistaken for the
 * graded result: they are back in the editor, nothing has been sent anywhere, and
 * they expire on their own if nobody confirms. So it says what happened, when, and
 * offers the only two endings — confirm them or throw them away.
 */
export default function PendingEditsBanner({ savedAt, onDiscard, saving = false, discarding = false }) {
  const when = formatSavedAt(savedAt);

  return (
    <div className="msv-pending-edits-banner">
      <FiClock size={14} className="msv-pending-edits-banner__icon" />
      <div className="msv-pending-edits-banner__text">
        <strong>Unsaved edits restored{when ? ` from ${when}` : ""}.</strong>{" "}
        They have not been confirmed, so nothing has gone to the student yet —
        press <em>Confirm edits</em> to keep them, or discard them. Unconfirmed
        edits are dropped automatically after 24 hours.
      </div>
      <button
        type="button"
        className="msv-pending-edits-banner__discard"
        onClick={onDiscard}
        disabled={discarding}
      >
        <FiRotateCcw size={12} /> {discarding ? "Discarding…" : "Discard edits"}
      </button>
      {saving && (
        <span className="msv-pending-edits-banner__saving">
          <FiSave size={12} /> Saving…
        </span>
      )}
    </div>
  );
}

/**
 * The "autosaving" hint for a paper with no restored edits — same reassurance
 * without the banner's weight.
 */
export function PendingEditsSavingHint({ saving }) {
  if (!saving) return null;
  return (
    <span className="msv-pending-edits-saving-hint">
      <FiSave size={12} /> Saving draft…
    </span>
  );
}
