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
//   board /       — the paper's exam identity. Nothing detects these; they are
//   paperCode /     typed once per assignment and snapshotted onto every
//   paperNumber     SavedCorrectionData row, which is what lets the correction
//                   corpus be sliced by board and paper. Saving them re-stamps
//                   rows already written for the assignment.
//
// All are opt-in: null means the feature is off / unset for that assignment.

// `provider` null/undefined = LoginCSS (its own /external-grading routes);
// any slug goes through the shared /grading/:provider registry.
export function gradingSettingsPath(provider, assignmentId) {
  return provider
    ? `/grading/${provider}/assignments/${assignmentId}/settings`
    : `/external-grading/assignments/${assignmentId}/settings`;
}

const EMPTY = {
  expectedPages: null,
  maxGrade: null,
  board: null,
  paperCode: null,
  paperNumber: null,
  inventoryMaxMarks: null,
  inventoryItemCount: 0,
  ourMarkSchemeAvailable: false,
  ourMarkSchemeFileName: null,
  ourMarkSchemeUploadedAt: null,
};

/** Editable fields the PUT endpoint accepts (inventory / ourMarkScheme fields are read-only from the server). */
const EDITABLE_FIELDS = ["expectedPages", "maxGrade", "board", "paperCode", "paperNumber"];

/** Every field the GET endpoint may return. */
const FIELDS = [
  ...EDITABLE_FIELDS,
  "inventoryMaxMarks",
  "inventoryItemCount",
  "ourMarkSchemeAvailable",
  "ourMarkSchemeFileName",
  "ourMarkSchemeUploadedAt",
];

/** Pick the known fields out of a response, defaulting each to null / 0 / false. */
function readSettings(data) {
  return Object.fromEntries(
    FIELDS.map((f) => [
      f,
      data?.[f] ?? (f === "inventoryItemCount" ? 0 : f === "ourMarkSchemeAvailable" ? false : null),
    ])
  );
}

// `provider` null/undefined = LoginCSS; any slug goes through /grading/:provider.
// Shared by the settings hook below and GradingAssignmentSettingsBar's mark-
// scheme buttons, so both agree on where the assignment's mark-scheme
// endpoints live.
export function markSchemeUploadPath(provider, assignmentId) {
  return provider
    ? `/grading/${provider}/assignments/${assignmentId}/mark-scheme`
    : `/external-grading/assignments/${assignmentId}/mark-scheme`;
}
export function markSchemeFilePath(provider, assignmentId) {
  return `${markSchemeUploadPath(provider, assignmentId)}/file`;
}
export function providerMarkSchemePath(provider, assignmentId) {
  return `${markSchemeUploadPath(provider, assignmentId)}/provider`;
}

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

  // Flattened to primitives so the memo below is not invalidated by a fresh
  // object identity on every render of the parent.
  const initialJson = JSON.stringify(readSettings(initial));

  const settings = useMemo(() => {
    if (assignmentId == null) return EMPTY;
    return byAssignment[assignmentId] ?? JSON.parse(initialJson);
  }, [assignmentId, byAssignment, initialJson]);

  useEffect(() => {
    if (assignmentId == null) return undefined;

    let cancelled = false;
    api
      .get(gradingSettingsPath(provider, assignmentId))
      .then(({ data }) => {
        if (cancelled) return;
        setByAssignment((prev) => ({ ...prev, [assignmentId]: readSettings(data) }));
      })
      // Never surface this: the whole feature is opt-in, and a failed read just
      // means the page behaves as it did before these settings existed.
      .catch(() => {});

    return () => { cancelled = true; };
  }, [provider, assignmentId]);

  /**
   * Save only the keys passed in — the backend leaves the others untouched, so
   * setting one knob never clobbers the other.
   * @param {{expectedPages?: number|null, maxGrade?: number|null,
   *          board?: string|null, paperCode?: string|null,
   *          paperNumber?: string|null}} patch
   */
  const save = useCallback(
    async (patch) => {
      if (assignmentId == null) return false;
      setSaving(true);
      try {
        const { data } = await api.put(gradingSettingsPath(provider, assignmentId), patch);
        setByAssignment((prev) => {
          const next = readSettings(data);
          const prevRow = prev[assignmentId] || EMPTY;
          return {
            ...prev,
            [assignmentId]: {
              ...next,
              // PUT does not re-emit inventory/mark-scheme fields — keep the
              // last GET values.
              inventoryMaxMarks: next.inventoryMaxMarks ?? prevRow.inventoryMaxMarks,
              inventoryItemCount: next.inventoryItemCount || prevRow.inventoryItemCount,
              ourMarkSchemeAvailable: prevRow.ourMarkSchemeAvailable,
              ourMarkSchemeFileName: prevRow.ourMarkSchemeFileName,
              ourMarkSchemeUploadedAt: prevRow.ourMarkSchemeUploadedAt,
            },
          };
        });
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

  // Re-fetch from the server — used after uploading a mark scheme, since that
  // goes through its own multipart endpoint rather than `save` above.
  const refresh = useCallback(async () => {
    if (assignmentId == null) return;
    try {
      const { data } = await api.get(gradingSettingsPath(provider, assignmentId));
      setByAssignment((prev) => ({ ...prev, [assignmentId]: readSettings(data) }));
    } catch {
      // Same rationale as the initial load above: never surface this.
    }
  }, [provider, assignmentId]);

  return { settings, saving, save, refresh };
}
