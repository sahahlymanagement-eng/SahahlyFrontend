/**
 * Who may use the external grading company tabs (LoginCSS, Mariam Gabalawy).
 *
 * Access is per-account, not per-role: the tabs are shared by one manager and one
 * assistant, so no single role name covers them. Emails match the manager account
 * (stable, human-readable); the assistant is matched by Person._id because that is
 * what we were given and it survives an email change.
 *
 * Client-side only — the backend enforces access on its own. To open these tabs
 * up later, broaden this one predicate (e.g. to a role check); every call site
 * already routes through it.
 */
const ALLOWED_EMAILS = ["manager01@manager"];

const ALLOWED_PERSON_IDS = ["6a6abc72df0dd2a61a15214f"];

export function isGradingManager() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const email = String(user?.email || "").trim().toLowerCase();
    // /auth/login returns the person as `id`; tolerate `_id` in case a caller
    // stores the raw document instead.
    const id = String(user?.id ?? user?._id ?? "").trim().toLowerCase();
    return (
      (!!email && ALLOWED_EMAILS.includes(email)) ||
      (!!id && ALLOWED_PERSON_IDS.includes(id))
    );
  } catch {
    return false;
  }
}
