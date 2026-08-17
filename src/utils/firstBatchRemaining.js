import api from "../api/api";

const IN_PROGRESS = new Set(["queued", "fetching", "uploading", "processing"]);

export function remainingRunLabel(run, fallbackStatus) {
  const status = run?.status || fallbackStatus;
  if (status === "failed") {
    return run?.error
      ? `Marking the rest failed: ${run.error}`
      : "Marking the rest failed.";
  }
  if (status === "done") return "Remaining submissions have been marked.";
  if (status === "uploading") {
    const n = run?.remainingCount;
    return n
      ? `Uploading ${n} remaining paper${n === 1 ? "" : "s"} to Gemini. Large classes can take several minutes.`
      : "Uploading remaining papers to Gemini. Large classes can take several minutes.";
  }
  if (status === "processing") return "Gemini is marking the remaining submissions…";
  if (status === "fetching" || status === "queued" || status === "confirming") {
    return "Loading the remaining submissions…";
  }
  return "Confirmed — marking the remaining submissions is still running in the background. This can take several minutes.";
}

export function remainingRunInProgress(run) {
  return IN_PROGRESS.has(run?.status);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll first-batch remaining-run status until Gemini has a job, the run
 * finishes, fails, or we time out.
 */
export async function watchRemainingRun({
  statusUrl,
  onStatus,
  intervalMs = 4000,
  maxMs = 45 * 60 * 1000,
  shouldStop,
}) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (shouldStop?.()) return { state: "stopped" };
    let data;
    try {
      ({ data } = await api.get(statusUrl));
    } catch (err) {
      onStatus?.(null, null, err);
      await sleep(intervalMs);
      continue;
    }
    const firstBatch = data?.firstBatch || null;
    const run = firstBatch?.remainingRun || null;
    onStatus?.(run, firstBatch);
    if (run?.status === "processing" && run.jobId) {
      return { state: "processing", jobId: run.jobId, run, firstBatch };
    }
    if (run?.status === "done") return { state: "done", run, firstBatch };
    if (run?.status === "failed") {
      return { state: "failed", error: run.error, run, firstBatch };
    }
    await sleep(intervalMs);
  }
  return { state: "timeout" };
}

export async function retryRemainingRun(retryUrl) {
  return api.post(retryUrl);
}
