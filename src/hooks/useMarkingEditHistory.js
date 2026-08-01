import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY = 100;
const RECORD_DEBOUNCE_MS = 450;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Undo/redo history for the marking edits (questions + summary) shown in the
 * Results modal of every submission viewer.
 *
 * The viewers mutate `editingQuestions`/`editingSummary` from many call sites
 * (question cards, correction chat, AI review, reset-to-original…), so instead
 * of wrapping every setter this hook watches the state and records debounced
 * snapshots — rapid typing collapses into a single undo step.
 */
export default function useMarkingEditHistory({
  questions,
  summary,
  setQuestions,
  setSummary,
  resetKey,
}) {
  const historyRef = useRef({ stack: [], index: -1 });
  const restoringRef = useRef(false);
  const timerRef = useRef(null);
  const [caps, setCaps] = useState({ canUndo: false, canRedo: false });

  const syncCaps = useCallback(() => {
    const { stack, index } = historyRef.current;
    setCaps((prev) => {
      const next = { canUndo: index > 0, canRedo: index < stack.length - 1 };
      return prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next;
    });
  }, []);

  const recordNow = useCallback(
    (snap) => {
      const { stack, index } = historyRef.current;
      const current = stack[index];
      if (
        current &&
        current.summary === snap.summary &&
        JSON.stringify(current.questions) === JSON.stringify(snap.questions)
      ) {
        return;
      }
      const next = stack.slice(0, index + 1);
      next.push({ questions: clone(snap.questions), summary: snap.summary });
      while (next.length > MAX_HISTORY) next.shift();
      historyRef.current = { stack: next, index: next.length - 1 };
      syncCaps();
    },
    [syncCaps]
  );

  // A different submission opened — drop the previous student's history.
  useEffect(() => {
    historyRef.current = { stack: [], index: -1 };
    restoringRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(syncCaps, 0);
    return () => clearTimeout(timerRef.current);
  }, [resetKey, syncCaps]);

  useEffect(() => {
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);

    // The first non-empty state is the baseline (not an undoable "edit") —
    // waiting for content avoids capturing the empty state that exists while
    // a result is still loading.
    if (historyRef.current.index < 0) {
      if (!questions?.length) return;
      timerRef.current = setTimeout(() => recordNow({ questions, summary }), 0);
    } else {
      timerRef.current = setTimeout(
        () => recordNow({ questions, summary }),
        RECORD_DEBOUNCE_MS
      );
    }
    return () => clearTimeout(timerRef.current);
  }, [questions, summary, recordNow]);

  const restore = useCallback(
    (index) => {
      const snap = historyRef.current.stack[index];
      if (!snap) return;
      historyRef.current = { ...historyRef.current, index };
      restoringRef.current = true;
      setQuestions(clone(snap.questions));
      setSummary(snap.summary);
      syncCaps();
    },
    [setQuestions, setSummary, syncCaps]
  );

  const undo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Flush any pending (not yet debounced) edit so undo targets the latest state.
    recordNow({ questions, summary });
    if (historyRef.current.index <= 0) return;
    restore(historyRef.current.index - 1);
  }, [questions, summary, recordNow, restore]);

  const redo = useCallback(() => {
    if (historyRef.current.index >= historyRef.current.stack.length - 1) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    restore(historyRef.current.index + 1);
  }, [restore]);

  return { undo, redo, canUndo: caps.canUndo, canRedo: caps.canRedo };
}
