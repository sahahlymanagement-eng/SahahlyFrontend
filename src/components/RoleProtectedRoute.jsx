import { Navigate } from "react-router-dom";

export default function RoleProtectedRoute({ children, allowedRole }) {
  const storedUser = localStorage.getItem("user");

  if (!storedUser) {
    return <Navigate to="/login" replace />;
  }

  const user = JSON.parse(storedUser);

  const roleName =
    user?.roleId?.name?.toLowerCase() || "";

  if (roleName !== allowedRole.toLowerCase()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
