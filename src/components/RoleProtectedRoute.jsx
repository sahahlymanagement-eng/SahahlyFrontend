import { Navigate } from "react-router-dom";
import { getRoleName } from "../utils/authRoutes";
import { clearSession, getStoredUser, hasLiveSession } from "../utils/session";

export default function RoleProtectedRoute({ children, allowedRole }) {
  const user = getStoredUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // The stored `user` outlives the token — it is written at login and nothing
  // used to remove it — so presence alone is not proof of a live session. Guard
  // on the token's own expiry, otherwise an expired session still renders the
  // whole portal and only fails one silent request at a time.
  if (!hasLiveSession()) {
    clearSession();
    return <Navigate to="/login?expired=1" replace />;
  }

  const roleName = getRoleName(user);

  const allowedRoles = Array.isArray(allowedRole)
    ? allowedRole.map(role => role.toLowerCase())
    : [allowedRole?.toLowerCase()];

  // A dedicated per-provider grading role ("Manager - Dr Peter") carries its
  // own literal role name, which never matches the fixed allowedRole lists
  // below — but it also carries `gradingRole: "manager"|"assistant"` (see
  // routes/auth.js publicUser()), the stable family every such role belongs
  // to. Checking that too is what lets /manager and /assistant accept any
  // current or future provider's dedicated roles with zero further changes
  // here — onboarding a new provider never needs to touch this file again.
  const familyMatch = user?.gradingRole && allowedRoles.includes(user.gradingRole);

  if (!allowedRoles.includes(roleName) && !familyMatch) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
