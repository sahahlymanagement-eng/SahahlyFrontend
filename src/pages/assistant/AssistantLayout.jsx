import { Outlet } from "react-router-dom";
import AssistantSidebar from "./AssistantSidebar";
import RoleShell from "../../components/RoleShell";
import { GradingNotificationProvider } from "../../context/GradingNotificationContext";

export default function AssistantLayout() {
  return (
    <GradingNotificationProvider>
      <RoleShell sidebar={<AssistantSidebar />}>
        <Outlet />
      </RoleShell>
    </GradingNotificationProvider>
  );
}
