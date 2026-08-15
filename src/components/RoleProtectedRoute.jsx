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

  if (!allowedRoles.includes(roleName)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
