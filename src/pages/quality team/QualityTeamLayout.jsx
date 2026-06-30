import { Outlet } from "react-router-dom";
import { FiHome } from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import RoleShell from "../../components/RoleShell";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/quality-team/dashboard" },
];

export default function QualityTeamLayout() {
  return (
    <RoleShell sidebar={
      <RoleSidebar
        roleLabel="Quality Team"
        accountLabel="Quality team account"
        navItems={NAV_ITEMS}
      />
    }>
      <Outlet />
    </RoleShell>
  );
}
