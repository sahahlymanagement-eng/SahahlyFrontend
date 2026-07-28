/** Roles with org-wide classroom access (same data scope as director/admin). */
export const DIRECTOR_LIKE_ROLES = new Set(["admin", "director", "backup"]);

export function isDirectorLikeRole(role) {
  return DIRECTOR_LIKE_ROLES.has(String(role || "").toLowerCase());
}

export function isDirectorLikeVariant(variant) {
  return variant === "director" || variant === "backup";
}

export function roleShellPath(role) {
  const r = String(role || "").toLowerCase();
  if (r === "backup") return "/backup";
  if (r === "admin") return "/director";
  if (r === "manager") return "/manager";
  if (r === "teacher") return "/teacher";
  return "/";
}
