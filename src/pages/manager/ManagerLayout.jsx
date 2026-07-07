import { Outlet } from "react-router-dom";
import ManagerSidebar from "../../components/ManagerSidebar";
import RoleShell from "../../components/RoleShell";
import { LoginCssNotificationProvider } from "../../context/LoginCssNotificationContext";

export default function ManagerLayout() {
  return (
    <LoginCssNotificationProvider>
      <RoleShell sidebar={<ManagerSidebar />}>
        <Outlet />
      </RoleShell>
    </LoginCssNotificationProvider>
  );
}
