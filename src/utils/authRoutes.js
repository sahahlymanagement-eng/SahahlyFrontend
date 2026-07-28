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

/** Resolve post-login destination from the user object returned by /auth/login. */
export function getDashboardPathForUser(user) {
  return getDashboardPathForRole(getRoleName(user));
}
