/**
 * Pure helpers for the Scheduled WhatsApp tab — no React, no network.
 *
 * The backend stores both a `recurrence` object and the `cronExpression` it
 * compiled from it. Everything here reads `recurrence`; the cron string is
 * display-only. Parsing cron back into UI state would silently drift the day
 * numbering and the timezone, so we never do it.
 */

/** WhatsApp group JIDs look like `120363000000000000@g.us`. */
export const GROUP_JID = /^\d{5,25}@g\.us$/;

/** `HH:mm`, 24-hour. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Backend `daysOfWeek` uses 0 = Sunday, matching JS `Date#getDay()`. */
export const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export const DEFAULT_TIMEZONE = "Africa/Cairo";

const FALLBACK_TIMEZONES = [
  "Africa/Cairo",
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
];

/**
 * Every IANA zone the browser knows, with Cairo pinned first so the common
 * case is one click. Older browsers lack `Intl.supportedValuesOf` — fall back
 * to a short curated list rather than shipping an empty dropdown.
 */
export function timezoneOptions() {
  let zones;
  try {
    zones = Intl.supportedValuesOf?.("timeZone");
  } catch {
    zones = null;
  }
  if (!Array.isArray(zones) || zones.length === 0) zones = FALLBACK_TIMEZONES;

  const rest = zones.filter((z) => z !== DEFAULT_TIMEZONE);
  return [DEFAULT_TIMEZONE, ...rest].map((z) => ({ value: z, label: z }));
}

/** The timezone the browser is in — shown next to one-off sends. */
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/**
 * Human summary of a recurring schedule, e.g.
 * `Weekly · Mon/Wed/Fri · 08:00 Africa/Cairo`.
 * Accepts either a scheduledMessage or a `{ recurrence, timezone }` pair.
 */
export function describeRecurrence(msg) {
  const rec = msg?.recurrence;
  if (!rec?.frequency) return "";

  const parts = [rec.frequency === "weekly" ? "Weekly" : "Daily"];

  if (rec.frequency === "weekly") {
    const days = (rec.daysOfWeek ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAYS.find((x) => x.value === d)?.label)
      .filter(Boolean);
    if (days.length) parts.push(days.join("/"));
  }

  const tz = msg?.timezone || DEFAULT_TIMEZONE;
  parts.push(rec.time ? `${rec.time} ${tz}` : tz);

  return parts.join(" · ");
}

/** A blank composer form. */
export function emptyForm() {
  return {
    chatId: "",
    text: "",
    scheduleType: "once",
    sendAt: null, // Date | null
    frequency: "weekly",
    time: "08:00",
    daysOfWeek: [],
    timezone: DEFAULT_TIMEZONE,
    // Attachment metadata as the backend returns it — { attachmentId, kind,
    // filename, mimetype, size } — or null. The bytes are already uploaded by
    // the time this is set; only the id is submitted with the schedule.
    attachment: null,
  };
}

/** Human file size for the attachment chip: `842 KB`, `1.4 MB`. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Rehydrate the composer from a scheduledMessage for editing.
 * Recurring fields come from the stored `recurrence` object only.
 */
export function formFromMessage(msg) {
  const base = emptyForm();
  if (!msg) return base;

  const rec = msg.recurrence || {};
  return {
    ...base,
    chatId: msg.chatId || "",
    text: msg.text || "",
    scheduleType: msg.scheduleType === "recurring" ? "recurring" : "once",
    sendAt: msg.sendAt ? new Date(msg.sendAt) : null,
    frequency: rec.frequency === "daily" ? "daily" : "weekly",
    time: rec.time || base.time,
    daysOfWeek: Array.isArray(rec.daysOfWeek) ? [...rec.daysOfWeek] : [],
    timezone: msg.timezone || base.timezone,
    attachment: msg.attachment?.attachmentId ? { ...msg.attachment } : null,
  };
}

/**
 * Client-side gate before hitting the API. Returns an error string, or null
 * when the form is submittable. The backend re-validates — this only saves a
 * round-trip and gives a faster message.
 */
export function validateForm(form) {
  if (!form.chatId) return "Pick a group";
  // With an attachment the text is just the caption, so it may be left empty.
  if (!form.text.trim() && !form.attachment) return "Type a message or attach a file";

  if (form.scheduleType === "once") {
    if (!form.sendAt) return "Pick a date and time";
    if (form.sendAt.getTime() <= Date.now()) return "Pick a time in the future";
    return null;
  }

  if (!TIME_RE.test(form.time)) return "Enter a time as HH:mm";
  if (form.frequency === "weekly" && form.daysOfWeek.length === 0)
    return "Pick at least one day of the week";
  return null;
}

/**
 * The create/patch body. A one-off carries an absolute instant, so it needs no
 * timezone; a recurring schedule carries wall-clock time plus the zone to read
 * it in.
 *
 * `attachmentId` is always sent — explicitly `null` when there is no file — so a
 * patch that removes the attachment actually clears it. Omitting the key means
 * "leave it alone" on the backend, which is not what an empty picker means.
 */
export function buildPayload(form) {
  const chatId = form.chatId;
  const text = form.text.trim();
  const attachmentId = form.attachment?.attachmentId ?? null;

  if (form.scheduleType === "once") {
    return {
      chatId,
      text,
      attachmentId,
      scheduleType: "once",
      sendAt: form.sendAt.toISOString(),
    };
  }

  const recurrence = { frequency: form.frequency, time: form.time };
  if (form.frequency === "weekly") {
    recurrence.daysOfWeek = [...form.daysOfWeek].sort((a, b) => a - b);
  }

  return {
    chatId,
    text,
    attachmentId,
    scheduleType: "recurring",
    recurrence,
    timezone: form.timezone,
  };
}

/** Badge tone per status — maps to `.mws-badge--{tone}` in whatsappScheduler.css. */
export const STATUS_TONE = {
  pending: "info",
  active: "success",
  sent: "neutral",
  failed: "danger",
  cancelled: "muted",
};

export const STATUS_OPTIONS = [
  "pending",
  "active",
  "sent",
  "failed",
  "cancelled",
];

/** Statuses that still have a future run to call off. */
export const CANCELLABLE = new Set(["pending", "active"]);

/** `—` rather than "Invalid Date" for the many nullable timestamps. */
export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function groupLabel(group) {
  return group?.name?.trim() || group?.chatId || "";
}
