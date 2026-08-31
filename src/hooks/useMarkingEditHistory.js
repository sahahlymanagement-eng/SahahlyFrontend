import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY = 100;
const RECORD_DEBOUNCE_MS = 450;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function serializeRemovedIndices(indices) {
  if (!indices?.size) return [];
  return [...indices].sort((a, b) => a - b);
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.summary === b.summary &&
    a.editingTotal === b.editingTotal &&
    JSON.stringify(a.questions) === JSON.stringify(b.questions) &&
    JSON.stringify(a.pendingRemovedIndices) ===
      JSON.stringify(b.pendingRemovedIndices)
  );
}

function packSnapshot({
  questions,
  summary,
  pendingRemovedIndices,
  editingTotal,
}) {
  return {
    questions,
    summary,
    pendingRemovedIndices: serializeRemovedIndices(pendingRemovedIndices),
    editingTotal: editingTotal ?? null,
  };
}

/**
 * Undo/redo history for marking edits in the results modal of every submission
 * viewer. Tracks question rows, summary, staged removals, and manual grade
 * overrides so undo/redo restores the full editor state the teacher sees.
 */
export default function useMarkingEditHistory({
  questions,
  summary,
  pendingRemovedIndices,
  editingTotal = null,
  setQuestions,
  setSummary,
  setPendingRemovedIndices,
  setEditingTotal,
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
      return prev.canUndo === next.canUndo && prev.canRedo === next.canRedo
        ? prev
        : next;
    });
  }, []);

  const recordNow = useCallback(
    (snap) => {
      const { stack, index } = historyRef.current;
      const current = stack[index];
      if (current && snapshotsEqual(current, snap)) {
        return;
      }
      const next = stack.slice(0, index + 1);
      next.push({
        questions: clone(snap.questions),
        summary: snap.summary,
        pendingRemovedIndices: [...(snap.pendingRemovedIndices || [])],
        editingTotal: snap.editingTotal ?? null,
      });
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

    const snap = packSnapshot({
      questions,
      summary,
      pendingRemovedIndices,
      editingTotal,
    });

    // The first non-empty state is the baseline (not an undoable "edit").
    if (historyRef.current.index < 0) {
      if (!questions?.length) return;
      timerRef.current = setTimeout(() => recordNow(snap), 0);
    } else {
      timerRef.current = setTimeout(() => recordNow(snap), RECORD_DEBOUNCE_MS);
    }
    return () => clearTimeout(timerRef.current);
  }, [questions, summary, pendingRemovedIndices, editingTotal, recordNow]);

  const restore = useCallback(
    (index) => {
      const snap = historyRef.current.stack[index];
      if (!snap) return;
      historyRef.current = { ...historyRef.current, index };
      restoringRef.current = true;
      setQuestions(clone(snap.questions));
      setSummary(snap.summary);
      if (setPendingRemovedIndices) {
        setPendingRemovedIndices(new Set(snap.pendingRemovedIndices || []));
      }
      if (setEditingTotal) {
        setEditingTotal(snap.editingTotal ?? null);
      }
      syncCaps();
    },
    [setQuestions, setSummary, setPendingRemovedIndices, setEditingTotal, syncCaps]
  );

  const undo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    recordNow(
      packSnapshot({
        questions,
        summary,
        pendingRemovedIndices,
        editingTotal,
      })
    );
    if (historyRef.current.index <= 0) return;
    restore(historyRef.current.index - 1);
  }, [
    questions,
    summary,
    pendingRemovedIndices,
    editingTotal,
    recordNow,
    restore,
  ]);

  const redo = useCallback(() => {
    if (historyRef.current.index >= historyRef.current.stack.length - 1) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    restore(historyRef.current.index + 1);
  }, [restore]);

  return { undo, redo, canUndo: caps.canUndo, canRedo: caps.canRedo };
}
