// Formats a submission date for the external-grading tables.
//
// The grading providers send a date-only string ("2026-07-28"). `new Date()`
// reads that as UTC midnight, which renders a time nobody submitted at and
// lands on the previous day west of Greenwich — so build a local date from the
// parts and show no time. Anything carrying a real timestamp (our own
// `created_at` fallbacks) is formatted in full.
export function formatSubmittedAt(value) {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}
