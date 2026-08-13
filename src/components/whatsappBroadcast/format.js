/** Formatting helpers for the broadcast tab. */

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "in about 3 hours" — the pacing is slow on purpose, so this is worth spelling out. */
export function formatDuration(ms) {
  const mins = Math.max(1, Math.round(Number(ms) / 60000));
  if (mins < 60) return `about ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? "" : "s"}`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Never render a full personal number in a list view. */
export function maskPhone(digits) {
  const s = String(digits || "");
  if (s.length < 8) return s || "—";
  return `${s.slice(0, 4)}····${s.slice(-3)}`;
}

export const STATUS_TONE = {
  draft: "mws-badge--muted",
  queued: "mws-badge--info",
  running: "mws-badge--info",
  paused: "mws-badge--neutral",
  cancelling: "mws-badge--neutral",
  cancelled: "mws-badge--muted",
  completed: "mws-badge--success",
  completed_with_errors: "mws-badge--neutral",
  failed: "mws-badge--danger",
};

export const STATUS_LABEL = {
  draft: "Draft",
  queued: "Queued",
  running: "Sending",
  paused: "Paused",
  cancelling: "Cancelling",
  cancelled: "Cancelled",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
};

export const RECIPIENT_TONE = {
  queued: "mws-badge--muted",
  sending: "mws-badge--info",
  sent: "mws-badge--success",
  failed: "mws-badge--danger",
  skipped: "mws-badge--neutral",
  cancelled: "mws-badge--muted",
};

/** Turn a per-row rejection code into something an operator can act on. */
export const REJECTION_LABEL = {
  missing_phone: "No phone number",
  invalid_phone: "Not a valid number",
  date_like_cell: "Excel turned this into a date",
  duplicate_in_sheet: "Duplicate of an earlier row",
  group_id: "Group id, not a personal number",
  too_many_rows: "Over the recipient limit",
};

export const ERROR_LABEL = {
  wapilot_validation: "Rejected by WhatsApp",
  wapilot_rejected: "WhatsApp session refused it",
  wapilot_5xx: "Provider error",
  wapilot_429: "Rate limited",
  not_queued: "Number not on WhatsApp",
  network: "Network error",
  attachment_missing: "Attachment missing",
  recent_broadcast: "Already messaged in the last 24h",
  dedupe_skipped: "Already sent",
  idempotent_replay: "Already sent",
  cancelled: "Cancelled",
};
