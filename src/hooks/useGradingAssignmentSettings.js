import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";

// Per-assignment settings for the grading partners (LoginCSS, mariamgabalawy).
//
// These assignments have no Assignment document — they arrive inline on each
// submission — so the two knobs live in their own backend collection keyed by
// the partner's numeric assignment id:
//
//   expectedPages — drives the pre-grading page-count review modal
//   maxGrade      — hard cap; the backend clamps every result and the published
//                   grade to it, overriding whatever total the AI invented
//
// Both are opt-in: null means the feature is off for that assignment.

// `provider` null/undefined = LoginCSS (its own /external-grading routes);
// any slug goes through the shared /grading/:provider registry.
export function gradingSettingsPath(provider, assignmentId) {
  return provider
    ? `/grading/${provider}/assignments/${assignmentId}/settings`
    : `/external-grading/assignments/${assignmentId}/settings`;
}

const EMPTY = { expectedPages: null, maxGrade: null };

/**
 * @param {string|null} provider  slug, or null for LoginCSS
 * @param {number|null} assignmentId
 * @param {object} [initial] the assignment-index row, which already carries both
 *        values — shown until the authoritative fetch for this id lands
 */
export function useGradingAssignmentSettings(provider, assignmentId, initial) {
  // Keyed by assignment id rather than held as one flat object: switching
  // assignments must never briefly show the previous one's numbers.
  const [byAssignment, setByAssignment] = useState({});
  const [saving, setSaving] = useState(false);

  const initialPages = initial?.expectedPages ?? null;
  const initialGrade = initial?.maxGrade ?? null;

  const settings = useMemo(() => {
    if (assignmentId == null) return EMPTY;
    return (
      byAssignment[assignmentId] ?? { expectedPages: initialPages, maxGrade: initialGrade }
    );
  }, [assignmentId, byAssignment, initialPages, initialGrade]);

  useEffect(() => {
    if (assignmentId == null) return undefined;

    let cancelled = false;
    api
      .get(gradingSettingsPath(provider, assignmentId))
      .then(({ data }) => {
        if (cancelled) return;
        setByAssignment((prev) => ({
          ...prev,
          [assignmentId]: {
            expectedPages: data?.expectedPages ?? null,
            maxGrade:      data?.maxGrade ?? null,
          },
        }));
      })
      // Never surface this: the whole feature is opt-in, and a failed read just
      // means the page behaves as it did before these settings existed.
      .catch(() => {});

    return () => { cancelled = true; };
  }, [provider, assignmentId]);

  /**
   * Save only the keys passed in — the backend leaves the others untouched, so
   * setting one knob never clobbers the other.
   * @param {{expectedPages?: number|null, maxGrade?: number|null}} patch
   */
  const save = useCallback(
    async (patch) => {
      if (assignmentId == null) return false;
      setSaving(true);
      try {
        const { data } = await api.put(gradingSettingsPath(provider, assignmentId), patch);
        setByAssignment((prev) => ({
          ...prev,
          [assignmentId]: {
            expectedPages: data?.expectedPages ?? null,
            maxGrade:      data?.maxGrade ?? null,
          },
        }));
        toast.success("Assignment settings saved");
        return true;
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to save assignment settings");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [provider, assignmentId]
  );

  return { settings, saving, save };
}
