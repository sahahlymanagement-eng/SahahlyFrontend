import { parsePhoneNumberFromString } from "libphonenumber-js";

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
 * Country-aware digit / format check (ITU lengths differ by country).
 * Empty is OK (no warning). Incomplete dial-code-only values warn as incomplete.
 *
 * @returns {{ empty: boolean, valid: boolean, message: string|null, country?: string }}
 */
export function validatePhoneNumber(value) {
  const digits = stripPhoneDigits(value);
  if (!digits) {
    return { empty: true, valid: true, message: null };
  }

  // Bare country calling code (e.g. "20") — not a full number yet.
  if (digits.length < MIN_PHONE_DIGITS) {
    return {
      empty: false,
      valid: false,
      message: "Incomplete phone number",
    };
  }

  const e164 = digits.startsWith("+") ? digits : `+${digits}`;
  const parsed = parsePhoneNumberFromString(e164);

  if (!parsed) {
    return {
      empty: false,
      valid: false,
      message: "Unrecognized phone number",
    };
  }

  if (!parsed.isValid()) {
    const country = parsed.country || null;
    return {
      empty: false,
      valid: false,
      country: country || undefined,
      message: country
        ? `Wrong number of digits for ${country}`
        : "Wrong number of digits for this country",
    };
  }

  return {
    empty: false,
    valid: true,
    message: null,
    country: parsed.country || undefined,
  };
}

/**
 * Build PUT payload phone fields:
 * - omit when unchanged / too short (e.g. default +20 dial code only)
 * - null when the teacher cleared the field
 * - digits when valid enough to store (≥8 digits)
 */
export function phoneFieldForSave(digits, { hadValue = false } = {}) {
  const d = stripPhoneDigits(digits);
  if (isMeaningfulPhone(d)) return d;
  if (!d) return hadValue ? null : undefined;
  return undefined;
}
