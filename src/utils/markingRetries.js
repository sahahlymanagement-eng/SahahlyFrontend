export const MARKING_MAX_ATTEMPTS = 20;
export const MARKING_RETRY_DELAY_MS = 2000;
export const MARKING_MAX_RETRIES_MESSAGE =
  "Failed after maximum retries. The server may be overloaded — please try again later.";

export function safeParseMarkingError(value) {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? safeParseMarkingError(parsed) : parsed;
  } catch {
    return value;
  }
}

/**
 * Returns true when a marking API call should be retried (overload, transient server/network errors).
 */
export function isMarkingRetryableError(err) {
  const data = err?.response?.data;
  const parsedMessage = safeParseMarkingError(data?.message);
  const httpStatus = err?.response?.status;

  const errorObj = parsedMessage?.error
    ? parsedMessage
    : data?.error
      ? data
      : parsedMessage;

  const innerCode = errorObj?.error?.code ?? data?.error?.code;
  const innerStatus = errorObj?.error?.status ?? data?.error?.status;
  const message = String(
    errorObj?.error?.message ??
      data?.message ??
      parsedMessage?.message ??
      err?.message ??
      ""
  ).toLowerCase();

  if (!httpStatus) return true;

  if (httpStatus === 503 || httpStatus === 502 || httpStatus === 429) return true;
  if (innerCode === 503 || innerCode === "503") return true;
  if (innerStatus === "UNAVAILABLE" || innerStatus === "RESOURCE_EXHAUSTED") return true;

  if (
    httpStatus >= 500 &&
    (message.includes("high demand") ||
      message.includes("unavailable") ||
      message.includes("overloaded") ||
      message.includes("resource exhausted") ||
      message.includes("try again"))
  ) {
    return true;
  }

  if (
    err.code === "ECONNABORTED" ||
    err.code === "ERR_NETWORK" ||
    err.code === "ERR_FAILED"
  ) {
    return true;
  }

  return false;
}

export function markingRetryDelayMs() {
  return MARKING_RETRY_DELAY_MS;
}

export async function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async action with overload/transient-error retries.
 * Returns { success, result?, error?, exhausted?, stopped? }.
 */
export async function runWithMarkingRetries({
  execute,
  shouldStop,
  onAttemptStart,
  onRetry,
}) {
  let attempt = 0;

  while (!shouldStop?.() && attempt < MARKING_MAX_ATTEMPTS) {
    attempt++;
    onAttemptStart?.(attempt, MARKING_MAX_ATTEMPTS);

    try {
      const result = await execute(attempt);
      return { success: true, result };
    } catch (err) {
      if (!isMarkingRetryableError(err) || attempt >= MARKING_MAX_ATTEMPTS) {
        return {
          success: false,
          error: err,
          exhausted: isMarkingRetryableError(err) && attempt >= MARKING_MAX_ATTEMPTS,
        };
      }

      const delay = markingRetryDelayMs();
      onRetry?.(attempt, MARKING_MAX_ATTEMPTS, delay);
      await delayMs(delay);
    }
  }

  if (shouldStop?.()) {
    return { success: false, stopped: true };
  }

  return { success: false, exhausted: true };
}
