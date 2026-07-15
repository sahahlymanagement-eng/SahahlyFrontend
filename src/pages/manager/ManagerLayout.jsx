import { Outlet } from "react-router-dom";
import ManagerSidebar from "../../components/ManagerSidebar";
import RoleShell from "../../components/RoleShell";
import { GradingNotificationProvider } from "../../context/GradingNotificationContext";

export default function ManagerLayout() {
  return (
    <GradingNotificationProvider>
      <RoleShell sidebar={<ManagerSidebar />}>
        <Outlet />
      </RoleShell>
    </GradingNotificationProvider>
  );
}
