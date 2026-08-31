import { detectedMarkingFailed } from "./markingIntegrityDetect";

export function collectSafetyBatchSubmissionIds(batchJob) {
  const limit = Math.max(1, Number(batchJob?.firstBatch?.limit) || 3);
  const fromSetting = (batchJob?.firstBatch?.submissionIds || [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  if (fromSetting.length) return fromSetting.slice(0, limit);

  const fromOrder = (batchJob?.batchStudents || [])
    .slice(0, limit)
    .map((s) => s?.submissionId)
    .filter(Boolean);
  if (fromOrder.length) return fromOrder;

  return Object.keys(batchJob?.results || {}).slice(0, limit);
}

export function resolveSafetyBatchResult(submissionId, batchJob, savedResults) {
  const sid = String(submissionId);
  return (
    savedResults?.[sid]?.result ||
    savedResults?.[submissionId]?.result ||
    batchJob?.results?.[sid]?.result ||
    batchJob?.results?.[sid] ||
    batchJob?.results?.[submissionId]?.result ||
    batchJob?.results?.[submissionId] ||
    null
  );
}

export function assessSafetyBatchIntegrity(batchJob, savedResults, students = []) {
  const nameById = new Map(
    (students || [])
      .filter((s) => s?.submissionId)
      .map((s) => [String(s.submissionId), s.name || s.studentName || null])
  );

  const submissionIds = collectSafetyBatchSubmissionIds(batchJob);
  const issues = [];

  for (const submissionId of submissionIds) {
    const sid = String(submissionId);
    const result = resolveSafetyBatchResult(sid, batchJob, savedResults);
    const studentName = nameById.get(sid) || null;

    if (!result || typeof result !== "object") {
      issues.push({
        submissionId: sid,
        studentName,
        kind: "missing",
        message: "No marking result saved for this safety paper.",
      });
      continue;
    }

    if (detectedMarkingFailed(result)) {
      issues.push({
        submissionId: sid,
        studentName,
        kind: "failed",
        message: "Marking failed — no questions were matched on this script.",
      });
    } else if (result.markingIncomplete || result.markingCompleteness?.markingIncomplete) {
      issues.push({
        submissionId: sid,
        studentName,
        kind: "incomplete",
        message: "Marking incomplete — many mark-scheme questions were not graded.",
      });
    }
  }

  return {
    blocked: issues.some((issue) => issue.kind === "failed"),
    issues,
    submissionIds,
  };
}

export function safetyBatchBlockMessage(assessment) {
  if (!assessment?.blocked) return null;
  const failed = (assessment.issues || []).filter((issue) => issue.kind === "failed");
  const names = failed
    .map((issue) => issue.studentName || issue.submissionId)
    .filter(Boolean)
    .join(", ");
  return names
    ? `Re-mark failed safety papers before continuing: ${names}.`
    : "Re-mark failed safety papers before marking the rest.";
}
