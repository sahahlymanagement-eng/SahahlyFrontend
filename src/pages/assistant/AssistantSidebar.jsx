import {
  FiHome,
  FiClipboard,
  FiBarChart2,
} from "react-icons/fi";
import AppSidebar from "../../components/AppSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/assistant/dashboard" },
  { icon: <FiClipboard />, label: "Assignments", path: "/assistant/assignments" },
  { icon: <FiBarChart2 />, label: "Performance", path: "/assistant/performance" },
];

export default function AssistantSidebar() {
  return (
    <AppSidebar
      navItems={NAV_ITEMS}
      roleTitle="Assistant"
      roleSubtitle="Assistant account"
    />
  );
}
