import api from "../api/api";

const IN_PROGRESS = new Set(["queued", "fetching", "uploading", "processing"]);
export const REMAINING_STALE_MS = 10 * 60 * 1000;

export function remainingRunInProgress(run) {
  return IN_PROGRESS.has(run?.status);
}

export function remainingRunIsStale(run, now = Date.now(), staleMs = REMAINING_STALE_MS) {
  if (!run?.status) return false;
  if (run.status === "done" || run.status === "failed" || run.status === "idle") {
    return false;
  }
  const t = run.updatedAt || run.startedAt;
  const age = t ? now - new Date(t).getTime() : Number.POSITIVE_INFINITY;
  // Match backend isRemainingRunRetryable: a processing job with a Gemini jobId
  // is only "still running" for staleMs. After that (PM2 restart, lost poller)
  // the banner must be allowed to flip to Retry remaining — otherwise it sits
  // on "Sahahly is marking the remaining submissions…" for hours.
  if (run.status === "processing" && run.jobId && age < staleMs) return false;
  return age >= staleMs;
}

export function remainingRunNeedsRetry(firstBatch) {
  const status = firstBatch?.status;
  if (status === "remaining_failed" || status === "confirmed_pending") return true;
  return remainingRunIsStale(firstBatch?.remainingRun);
}

export function remainingRunLabel(run, fallbackStatus) {
  const status = run?.status || fallbackStatus;
  if (status === "failed" || fallbackStatus === "remaining_failed" || remainingRunIsStale(run)) {
    return run?.error
      ? `Marking the rest failed: ${run.error}`
      : "Marking the rest stalled — the server stopped reporting progress. Click Retry remaining.";
  }
  if (status === "done") return "Remaining submissions have been marked.";
  if (status === "uploading") {
    const n = run?.remainingCount;
    return n
      ? `Uploading ${n} remaining paper${n === 1 ? "" : "s"} to Sahahly. Long scripts are sent page by page and can take 20+ minutes.`
      : "Uploading remaining papers to Sahahly. Long scripts can take 20+ minutes.";
  }
  if (status === "processing") return "Sahahly is marking the remaining submissions…";
  if (status === "fetching" || status === "queued" || status === "confirming") {
    return "Loading the remaining submissions…";
  }
  return "The remaining-marking job did not report progress. Click Retry remaining.";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll first-batch remaining-run status until Gemini has a job, the run
 * finishes, fails, or goes stale with no heartbeat.
 */
export async function watchRemainingRun({
  statusUrl,
  onStatus,
  intervalMs = 4000,
  shouldStop,
}) {
  const started = Date.now();
  while (true) {
    if (shouldStop?.()) return { state: "stopped" };
    let data;
    try {
      ({ data } = await api.get(statusUrl));
    } catch (err) {
      onStatus?.(null, null, err);
      if (Date.now() - started >= REMAINING_STALE_MS) {
        return {
          state: "failed",
          error: "Could not read remaining-marking status. Click Retry remaining.",
        };
      }
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
    if (remainingRunIsStale(run) || (!run && Date.now() - started >= REMAINING_STALE_MS)) {
      return {
        state: "failed",
        error:
          "No progress for 10 minutes. The remaining-marking job likely stalled — click Retry remaining.",
        run,
        firstBatch,
      };
    }
    await sleep(intervalMs);
  }
}

export async function retryRemainingRun(retryUrl, body) {
  return api.post(retryUrl, body || {});
}
