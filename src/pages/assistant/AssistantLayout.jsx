import { Outlet } from "react-router-dom";
import AssistantSidebar from "./AssistantSidebar";
import RoleShell from "../../components/RoleShell";

export default function AssistantLayout() {
  return (
    <RoleShell sidebar={<AssistantSidebar />}>
      <Outlet />
    </RoleShell>
  );
}
