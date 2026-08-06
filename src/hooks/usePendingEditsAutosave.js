import { useCallback, useEffect, useRef, useState } from "react";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Autosave for marking edits that have NOT been confirmed.
 *
 * The results modal has always had one save button: Confirm Edits. Anything typed
 * before pressing it lived in React state only, so closing the modal, following a
 * link or a browser crash threw the work away. This hook keeps a server-side copy
 * of the in-progress editor state (`pendingEdits`, see the backend's
 * models/pendingEditsSchema.js) so it survives all three.
 *
 * What it deliberately does NOT do is make those edits real. The stored copy sits
 * beside the graded result, never inside it: it is not returned to a student, not
 * published to a partner, not counted as a correction, and the backend expires it
 * after 24h. Confirming promotes it and clears it; ignoring it lets it lapse.
 *
 * Opening a paper therefore has three possible answers, and a caller must wait for
 * one before doing anything that reads the editor (see `status`):
 *   "loading"  — asking the server whether this paper has unconfirmed edits
 *   "restored" — it did, they are now in the editor, banner shown
 *   "none"     — nothing pending; the editor holds the confirmed state
 *
 * @param {object}   opts
 * @param {string|number|null} opts.submissionId  open paper, null when closed
 * @param {boolean}  opts.ready       editor state belongs to `submissionId`
 * @param {boolean}  opts.dirty       editor differs from the confirmed state
 * @param {Function} opts.buildResult () => current editor state as a result blob
 * @param {Function} opts.load        (submissionId) => { result, savedAt } | null
 * @param {Function} opts.save        (submissionId, result) => Promise
 * @param {Function} opts.discard     (submissionId) => Promise
 * @param {Function} opts.onRestore   (result, savedAt) => void, applies to editor
 * @param {Function} opts.onDiscard   () => void, resets editor to confirmed state
 * @param {boolean}  [opts.enabled]
 * @param {boolean}  [opts.pauseSaves] hold saves while the caller is itself about
 *                   to confirm this state (the viewers' auto-save on open), so a
 *                   copy of something already being confirmed is never stored
 */
export default function usePendingEditsAutosave({
  submissionId,
  ready,
  dirty,
  buildResult,
  load,
  save,
  discard,
  onRestore,
  onDiscard,
  enabled = true,
  pauseSaves = false,
}) {
  // The answer for ONE paper, stamped with which. Keeping the id in the same
  // state as the answer is what stops a previous paper's "restored" (and its
  // banner) from showing for a render when the next one opens.
  const [answer, setAnswer] = useState({ submissionId: null, status: "none", savedAt: null });
  const [saving, setSaving] = useState(false);

  // Latest callbacks, so a save firing 2s after the last keystroke still uses the
  // current ones. The PAYLOAD is captured eagerly instead (see below) — reading it
  // from here would let a paper switch flush the new paper's edits under the old
  // paper's id.
  const latest = useRef({});
  latest.current = { submissionId, save, load, discard, onRestore, onDiscard };

  // What we last wrote, so repeated renders don't re-store an identical blob (the
  // editor rebuilds its summary on every render, so `dirty` alone re-fires a lot).
  const lastSavedRef = useRef({ submissionId: null, payload: null });
  const timerRef = useRef(null);
  const flushRef = useRef(null);

  const runSave = useCallback(async (sid, result) => {
    const payload = JSON.stringify(result);
    if (
      lastSavedRef.current.submissionId === sid &&
      lastSavedRef.current.payload === payload
    ) {
      return;
    }
    setSaving(true);
    try {
      await latest.current.save(sid, result);
      lastSavedRef.current = { submissionId: sid, payload };
    } catch (err) {
      // Autosave is a safety net, not a user action — log it and let the next
      // keystroke retry rather than interrupting with a toast.
      console.error("Failed to autosave unconfirmed edits", err);
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Open: ask whether this paper has unconfirmed edits ────────────────────
  useEffect(() => {
    if (!enabled || !submissionId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const pending = await latest.current.load(submissionId);
        if (cancelled) return;
        if (pending?.result) {
          // Seed lastSaved so restoring does not immediately write back what was
          // just read.
          lastSavedRef.current = {
            submissionId,
            payload: JSON.stringify(pending.result),
          };
          latest.current.onRestore?.(pending.result, pending.savedAt);
          setAnswer({
            submissionId,
            status: "restored",
            savedAt: pending.savedAt || null,
          });
          return;
        }
        setAnswer({ submissionId, status: "none", savedAt: null });
      } catch (err) {
        // Treat an unreachable check as "nothing pending": the confirmed state is
        // always safe to show, and a failed read must not block the modal.
        console.error("Failed to load unconfirmed edits", err);
        if (!cancelled) setAnswer({ submissionId, status: "none", savedAt: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, submissionId]);

  // No paper open, or its answer has not arrived yet. "loading" is the safe
  // default for the second case: callers hold off on anything that reads the
  // editor until they know whether edits are about to be restored into it.
  const answered = Boolean(submissionId) && answer.submissionId === submissionId;
  const status = !submissionId || !enabled
    ? "none"
    : !answered
      ? "loading"
      // A confirm makes the stored copy redundant (the backend clears it as part
      // of the confirmed save), so the banner goes as soon as the editor matches
      // the confirmed state again. Derived, because nothing needs to remember a
      // restore that no longer describes anything.
      : answer.status === "restored" && !dirty
        ? "none"
        : answer.status;
  const restoredAt = answered ? answer.savedAt : null;

  // ── Editing: debounce a save of the current state ─────────────────────────
  useEffect(() => {
    if (!enabled || !submissionId || !ready || !dirty || pauseSaves) return undefined;
    // Nothing may be stored until the open check has settled: saving during
    // "loading" would race the restore and write the pre-restore state back.
    if (status === "loading") return undefined;

    // Captured now, from this render — a later flush must store THIS paper's
    // state even if the modal has since moved on.
    const sid = submissionId;
    const result = buildResult?.();
    if (!result) return undefined;

    const commit = () => {
      timerRef.current = null;
      flushRef.current = null;
      runSave(sid, result);
    };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(commit, AUTOSAVE_DEBOUNCE_MS);
    flushRef.current = commit;

    return () => clearTimeout(timerRef.current);
  }, [enabled, submissionId, ready, dirty, status, pauseSaves, buildResult, runSave]);

  // Confirming clears the stored copy server-side, so what we believe we last
  // wrote is no longer there. Forgetting it matters: otherwise an edit that
  // returns to exactly that state would be skipped as "already saved" and would
  // not be recoverable after a crash.
  useEffect(() => {
    if (!dirty) lastSavedRef.current = { submissionId: null, payload: null };
  }, [dirty]);

  // Closing the modal, switching paper or unmounting must not lose the last
  // keystrokes, so an outstanding save is fired rather than dropped.
  useEffect(
    () => () => {
      flushRef.current?.();
    },
    [submissionId]
  );

  /** "I don't want these" — drop the stored copy and the edits with it. */
  const discardRestored = useCallback(async () => {
    const sid = latest.current.submissionId;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    flushRef.current = null;
    lastSavedRef.current = { submissionId: null, payload: null };
    setAnswer({ submissionId: sid, status: "none", savedAt: null });
    latest.current.onDiscard?.();
    if (!sid) return;
    try {
      await latest.current.discard(sid);
    } catch (err) {
      console.error("Failed to discard unconfirmed edits", err);
    }
  }, []);

  return {
    /** "loading" | "restored" | "none" */
    status,
    /** When the restored edits were autosaved — for the banner. */
    restoredAt,
    saving,
    discardRestored,
  };
}
