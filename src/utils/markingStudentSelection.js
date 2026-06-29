import { useCallback, useState } from "react";
import { fetchAllPaginated } from "./fetchAllStudents";
import { isStudentSubmitted } from "./markingFormData";

export function useMarkingStudentSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggle = useCallback((submissionId) => {
    if (!submissionId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selectIds = useCallback((ids) => {
    setSelectedIds(new Set((ids || []).filter(Boolean)));
  }, []);

  const mergeIds = useCallback((ids) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      (ids || []).filter(Boolean).forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (submissionId) => selectedIds.has(submissionId),
    [selectedIds]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    clear,
    selectIds,
    mergeIds,
    isSelected,
  };
}

export function applySubmissionSelection(allStudents, selectedIds) {
  if (!selectedIds?.size) return allStudents;
  return allStudents.filter(
    (s) => s.submissionId && selectedIds.has(s.submissionId)
  );
}

export async function loadEligibleStudentsForMarking(api, {
  assignmentId,
  studentsUrl,
  selectedIds,
  requireSubmitted = false,
}) {
  const allStudents = await fetchAllPaginated(api, studentsUrl, {}, "students");
  const pool = applySubmissionSelection(allStudents, selectedIds);

  if (selectedIds?.size && !pool.length) {
    return { allStudents, eligible: [], pool, error: "none_of_selected_found" };
  }

  const res = await api.post("/submission-files/eligible-for-bulk-marking", {
    assignmentId,
    submissions: pool,
  });

  const backendEligible = new Set(res.data.map((s) => s.submissionId));
  let eligible = pool.filter(
    (s) => s.submissionId && backendEligible.has(s.submissionId)
  );

  if (requireSubmitted) {
    eligible = eligible.filter((s) => isStudentSubmitted(s.state));
  }

  return { allStudents, eligible, pool, error: null };
}

export function markingActionLabel(baseAll, baseSelected, selectedCount) {
  return selectedCount > 0 ? `${baseSelected} (${selectedCount})` : baseAll;
}
