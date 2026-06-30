import { Outlet } from "react-router-dom";
import ManagerSidebar from "../../components/ManagerSidebar";
import RoleShell from "../../components/RoleShell";

export default function ManagerLayout() {
  return (
    <RoleShell sidebar={<ManagerSidebar />}>
      <Outlet />
    </RoleShell>
  );
}
