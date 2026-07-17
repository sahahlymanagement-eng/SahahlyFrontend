import { FiHome, FiClipboard, FiBarChart2, FiSend, FiMessageCircle } from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/assistant/dashboard" },
  { icon: <FiClipboard />, label: "Assignments", path: "/assistant/assignments" },
  { icon: <FiSend />, label: "Reports", path: "/assistant/reports" },
  { icon: <FiMessageCircle />, label: "Chatbot", path: "/assistant/chatbot" },
  { icon: <FiBarChart2 />, label: "Performance", path: "/assistant/performance" },
];

export default function AssistantSidebar() {
  return (
    <RoleSidebar
      roleLabel="Assistant"
      accountLabel="Assistant account"
      navItems={NAV_ITEMS}
    />
  );
}
