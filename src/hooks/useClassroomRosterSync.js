import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/api";

/**
 * Sync Google Classroom roster into Sahahly and prune students removed from Classroom.
 * Runs automatically when classroomId becomes available (once per classroom per mount).
 */
export function useClassroomRosterSync(
  classroomId,
  { enabled = true, autoSync = true, onSynced = null } = {}
) {
  const [syncing, setSyncing] = useState(false);
  const lastSyncedIdRef = useRef(null);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const syncRoster = useCallback(
    async ({ force = false, silent = false } = {}) => {
      if (!enabled || !classroomId) return null;
      if (!force && lastSyncedIdRef.current === String(classroomId)) return null;

      setSyncing(true);
      try {
        const res = await api.post(`/students/sync/${classroomId}`);
        lastSyncedIdRef.current = String(classroomId);
        onSyncedRef.current?.(res.data);
        return res.data;
      } catch (err) {
        if (!silent) {
          console.warn("[roster sync]", err?.response?.data?.message || err.message);
        }
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [classroomId, enabled]
  );

  useEffect(() => {
    if (!autoSync || !enabled || !classroomId) return;
    syncRoster({ silent: true });
  }, [autoSync, enabled, classroomId, syncRoster]);

  return { syncRoster, syncing };
}
