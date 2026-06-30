/** Per-assignment Gemini batch jobs — survives navigation between assignments. */

const jobsByAssignment = new Map();
const pollsByJobId = new Map();
const stopByAssignment = new Map();
const listenersByAssignment = new Map();

export function getBatchJob(assignmentId) {
  if (!assignmentId) return null;
  return jobsByAssignment.get(assignmentId) ?? null;
}

function notify(assignmentId) {
  const job = getBatchJob(assignmentId);
  const listeners = listenersByAssignment.get(assignmentId);
  if (!listeners) return;
  for (const fn of listeners) fn(job);
}

export function patchBatchJob(assignmentId, updater) {
  if (!assignmentId) return null;
  const prev = jobsByAssignment.get(assignmentId) ?? null;
  let next;
  if (updater == null) {
    next = null;
  } else if (typeof updater === "function") {
    next = updater(prev ? { ...prev, assignmentId } : { assignmentId });
  } else {
    next = { ...updater, assignmentId };
  }
  if (!next) {
    jobsByAssignment.delete(assignmentId);
  } else {
    jobsByAssignment.set(assignmentId, next);
  }
  notify(assignmentId);
  return next;
}

export function subscribeBatchJob(assignmentId, listener) {
  if (!assignmentId) return () => {};
  if (!listenersByAssignment.has(assignmentId)) {
    listenersByAssignment.set(assignmentId, new Set());
  }
  const set = listenersByAssignment.get(assignmentId);
  set.add(listener);
  listener(getBatchJob(assignmentId));
  return () => set.delete(listener);
}

export function registerBatchPoll(jobId, intervalId) {
  if (!jobId) return;
  if (pollsByJobId.has(jobId)) {
    clearInterval(pollsByJobId.get(jobId));
  }
  pollsByJobId.set(jobId, intervalId);
}

export function clearBatchPoll(jobId) {
  if (!jobId || !pollsByJobId.has(jobId)) return;
  clearInterval(pollsByJobId.get(jobId));
  pollsByJobId.delete(jobId);
}

export function setBatchStopped(assignmentId, stopped = true) {
  if (!assignmentId) return;
  if (stopped) stopByAssignment.set(assignmentId, true);
  else stopByAssignment.delete(assignmentId);
}

export function isBatchStopped(assignmentId) {
  return stopByAssignment.get(assignmentId) === true;
}

export function isBatchBusyForAssignment(assignmentId) {
  const job = getBatchJob(assignmentId);
  if (!job) return false;
  return (
    job.phase === "uploading" ||
    job.phase === "submitting" ||
    job.phase === "processing"
  );
}
