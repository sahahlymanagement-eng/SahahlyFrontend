/**
 * Who may use the external grading company tabs (LoginCSS, Mariam Gabalawy).
 *
 * Client-side only — the backend enforces access on its own. To open these tabs
 * up later, broaden this one predicate (e.g. to a role check); every call site
 * already routes through it.
 */
export function isGradingManager() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user?.email?.toLowerCase() === "manager01@manager";
  } catch {
    return false;
  }
}
