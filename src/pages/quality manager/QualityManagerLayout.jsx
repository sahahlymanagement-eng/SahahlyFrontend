import { Outlet } from "react-router-dom";
import { FiHome } from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import RoleShell from "../../components/RoleShell";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/quality-manager/dashboard" },
];

export default function QualityManagerLayout() {
  return (
    <RoleShell sidebar={
      <RoleSidebar
        roleLabel="Quality Manager"
        accountLabel="Quality manager account"
        navItems={NAV_ITEMS}
      />
    }>
      <Outlet />
    </RoleShell>
  );
}
