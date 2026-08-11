import { Navigate, Outlet, useLocation } from "react-router-dom";
import AssistantSidebar from "./AssistantSidebar";
import RoleShell from "../../components/RoleShell";
import { GradingNotificationProvider } from "../../context/GradingNotificationContext";
import { gradingOnlyProviders } from "../../utils/gradingAccess";

export default function AssistantLayout() {
  const { pathname } = useLocation();

  // A grading-only account's portal IS its partner tab (see gradingAccess): the
  // sidebar hides everything else, and this keeps a typed or remembered URL from
  // walking around that. Empty for every other assistant, so nothing is
  // redirected for them.
  const allowedTabs = gradingOnlyProviders();
  if (allowedTabs.length) {
    const onAllowedTab = allowedTabs.some(
      (slug) => pathname === `/assistant/${slug}`
    );
    if (!onAllowedTab) {
      return <Navigate to={`/assistant/${allowedTabs[0]}`} replace />;
    }
  }

  return (
    <GradingNotificationProvider>
      <RoleShell sidebar={<AssistantSidebar />}>
        <Outlet />
      </RoleShell>
    </GradingNotificationProvider>
  );
}
