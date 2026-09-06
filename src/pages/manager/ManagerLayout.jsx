import { Navigate, Outlet, useLocation } from "react-router-dom";
import ManagerSidebar from "../../components/ManagerSidebar";
import RoleShell from "../../components/RoleShell";
import { GradingNotificationProvider } from "../../context/GradingNotificationContext";
import { gradingOnlyProviders } from "../../utils/gradingAccess";

export default function ManagerLayout() {
  const { pathname } = useLocation();

  // A dedicated per-provider Manager role's portal IS its one partner tab
  // (see gradingAccess) — fully confined, with no exemption (unlike
  // AssistantLayout's Course Management carve-out): this role has no
  // classroom-coursework business at all. Empty for every other manager, so
  // nothing is redirected for them.
  const allowedTabs = gradingOnlyProviders();
  if (allowedTabs.length) {
    // The provider tab itself, and its sibling "assign assistants to a
    // class" tab (ManagerGradingAssistants) — the one other page a confined
    // provider-manager may reach. A genuinely nested path here would also
    // make the sidebar highlight both tabs at once (see ManagerSidebar /
    // RoleSidebar's prefix-based active check), which is why the route is a
    // sibling ("drpeter-assign-assistants"), not "/drpeter/assign-assistants".
    const onAllowedTab = allowedTabs.some(
      (slug) =>
        pathname === `/manager/${slug}` ||
        pathname === `/manager/${slug}-assign-assistants`
    );
    if (!onAllowedTab) {
      return <Navigate to={`/manager/${allowedTabs[0]}`} replace />;
    }
  }

  return (
    <GradingNotificationProvider>
      <RoleShell sidebar={<ManagerSidebar />}>
        <Outlet />
      </RoleShell>
    </GradingNotificationProvider>
  );
}
