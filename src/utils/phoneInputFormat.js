/** Digits-only storage for phone fields (no +, spaces, or punctuation). */
export function stripPhoneDigits(value) {
  if (value == null || value === "") return "";
  return String(value).replace(/\D/g, "");
}

/** Value for react-international-phone — one leading +, digits only. */
export function formatPhoneForInput(digits) {
  const d = stripPhoneDigits(digits);
  return d ? `+${d}` : "";
}

/** Egypt mobile + most international numbers; rejects bare country codes like "20". */
export const MIN_PHONE_DIGITS = 8;

export function isMeaningfulPhone(digits) {
  const d = stripPhoneDigits(digits);
  return d.length >= MIN_PHONE_DIGITS;
}

/**
 * Build PUT payload phone fields:
 * - omit when unchanged / too short (e.g. default +20 dial code only)
 * - null when the teacher cleared the field
 * - digits when valid
 */
export function phoneFieldForSave(digits, { hadValue = false } = {}) {
  const d = stripPhoneDigits(digits);
  if (isMeaningfulPhone(d)) return d;
  if (!d) return hadValue ? null : undefined;
  return undefined;
}
