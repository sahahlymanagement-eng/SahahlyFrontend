import { gradingOnlyProviders } from "./gradingAccess";

/** Normalize role name from login user payload (populated roleId or explicit roleName). */
export function getRoleName(user) {
  const raw =
    user?.roleName ??
    user?.roleId?.name ??
    user?.role?.name ??
    user?.role ??
    "";
  return String(raw).trim().toLowerCase();
}

const ROLE_HOME = {
  teacher: "/teacher/dashboard",
  assistant: "/assistant/dashboard",
  manager: "/manager/dashboard",
  "quality team": "/quality-team/dashboard",
  "quality manager": "/quality-manager/dashboard",
  admin: "/director/dashboard",
  director: "/director/dashboard",
  backup: "/backup/submissions",
};

/** Dashboard path for a role, or null if the role has no app home. */
export function getDashboardPathForRole(roleName) {
  const role = String(roleName || "").trim().toLowerCase();
  return ROLE_HOME[role] || null;
}

/**
 * Resolve post-login destination from the user object returned by /auth/login.
 *
 * A grading-only account has no dashboard to land on — its portal is one partner
 * tab (see gradingAccess) — so it goes straight there. Every other account keeps
 * its role home. This is also where a denied grading tab bounces accounts to, so
 * a grading-only login cannot be bounced to a page its sidebar does not show.
 */
export function getDashboardPathForUser(user) {
  const home = getDashboardPathForRole(getRoleName(user));
  if (!home) return null;

  const [landingTab] = gradingOnlyProviders(user);
  if (!landingTab) return home;

  // Reuse the role's own portal segment ("/assistant/dashboard" → "assistant")
  // so this stays correct if a grading-only account is ever given another role.
  const portal = home.split("/")[1];
  return `/${portal}/${landingTab}`;
}
