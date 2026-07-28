import { Navigate } from "react-router-dom";
import { getRoleName } from "../utils/authRoutes";

export default function RoleProtectedRoute({ children, allowedRole }) {
  const storedUser = localStorage.getItem("user");

  if (!storedUser) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(storedUser);

  const roleName = getRoleName(user);

  // if (roleName !== allowedRole.toLowerCase()) {
  //   return <Navigate to="/login" replace />;
  // }
  const allowedRoles = Array.isArray(allowedRole)
    ? allowedRole.map(role => role.toLowerCase())
    : [allowedRole?.toLowerCase()];

  if (!allowedRoles.includes(roleName)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
