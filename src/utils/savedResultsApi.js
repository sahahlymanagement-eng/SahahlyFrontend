import { maybeStripMoney } from "./moneyVisibility";
import { resolveSavedMarkingGrade } from "./markingFormData";

/** Map one API row into the viewer's savedResults entry shape. */
export function mapSavedResultRow(r, { stripMoney = true } = {}) {
  if (!r?.submissionId) return null;
  const result = r.result
    ? stripMoney
      ? maybeStripMoney(r.result)
      : r.result
    : null;
  return {
    status: "done",
    result,
    hasResult: Boolean(r.hasResult ?? result),
    listMeta: r.listMeta || null,
    studentFile: r.studentFileMeta,
    totalMarks: resolveSavedMarkingGrade(r),
    classroomAssignedGrade: r.classroomAssignedGrade ?? null,
    provider: r.provider,
    mode: r.mode,
    summary: r.summary || "",
    returnedAt: r.returnedAt ?? null,
    updatedAt: r.updatedAt ?? null,
    teacherEditedAt: r.teacherEditedAt ?? null,
    studentId: r.studentId ?? null,
    studentName: r.studentName ?? null,
    pendingEditsSavedAt: r.pendingEditsSavedAt ?? null,
  };
}

export function mapSavedResultsFromApi(rows = [], options) {
  const map = {};
  for (const r of rows) {
    const entry = mapSavedResultRow(r, options);
    if (entry) map[r.submissionId] = entry;
  }
  return map;
}

export async function fetchSavedResultsLight(api, assignmentId) {
  if (!assignmentId) return {};
  const res = await api.get(`/submission-files/save-results/${assignmentId}`, {
    params: { light: 1 },
  });
  return mapSavedResultsFromApi(res.data?.data || []);
}

export async function fetchSavedResultDetail(api, assignmentId, submissionId) {
  const res = await api.get(
    `/submission-files/save-results/${assignmentId}/${submissionId}`
  );
  return mapSavedResultRow(res.data?.data || null);
}

/** Load full marking blobs only for rows Return All needs from the DB. */
export async function hydrateSavedResultsForReturn(
  api,
  assignmentId,
  savedMap = {}
) {
  const entries = Object.entries(savedMap);
  const needs = entries.filter(
    ([, saved]) =>
      (saved?.hasResult || saved?.status === "done") &&
      !saved?.result?.questions?.length
  );
  if (!needs.length) return savedMap;

  const next = { ...savedMap };
  await Promise.all(
    needs.map(async ([submissionId]) => {
      try {
        const row = await fetchSavedResultDetail(api, assignmentId, submissionId);
        if (!row) return;
        next[submissionId] = { ...next[submissionId], ...row };
      } catch (err) {
        console.error(
          `Failed to hydrate saved result for ${submissionId}:`,
          err?.message || err
        );
      }
    })
  );
  return next;
}

export function savedRowHasMarkingResult(saved) {
  return Boolean(saved?.result || saved?.hasResult);
}

export function listMetaWarningText(listMeta) {
  if (!listMeta) return null;
  if (listMeta.totalMismatchMessage) return listMeta.totalMismatchMessage;
  const warn = listMeta.fileWarning;
  if (!warn) return null;
  return typeof warn === "string" ? warn : warn?.message || null;
}
