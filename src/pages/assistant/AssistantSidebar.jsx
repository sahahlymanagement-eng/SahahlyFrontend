import {
  FiHome, FiClipboard, FiBarChart2, FiSend, FiMessageCircle, FiCpu, FiUploadCloud,
} from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import { useGradingNotifications } from "../../context/GradingNotificationContext";
import { isGradingManager } from "../../utils/gradingAccess";

// External grading company tabs — visible only to the accounts allowed to grade
// for them, each badged with its own unread count. Keyed by provider slug
// (see GRADING_PROVIDERS). Mirrors ManagerSidebar's grading block.
const GRADING_NAV_PATHS = {
  "/assistant/logincss": "logincss",
  "/assistant/mariamgabalawy": "mariamgabalawy",
};

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/assistant/dashboard" },
  { icon: <FiClipboard />, label: "Assignments", path: "/assistant/assignments" },
  { icon: <FiCpu />, label: "Automation", path: "/assistant/automation" },
  { icon: <FiSend />, label: "Reports", path: "/assistant/reports" },
  { icon: <FiMessageCircle />, label: "Chatbot", path: "/assistant/chatbot" },
  { icon: <FiBarChart2 />, label: "Performance", path: "/assistant/performance" },
  { icon: <FiUploadCloud />, label: "LoginCSS", path: "/assistant/logincss" },
  { icon: <FiUploadCloud />, label: "Mariam Gabalawy", path: "/assistant/mariamgabalawy" },
];

export default function AssistantSidebar() {
  const { counts } = useGradingNotifications();
  const showGrading = isGradingManager();

  const navItems = (showGrading
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => !GRADING_NAV_PATHS[item.path])
  ).map((item) => {
    const slug = GRADING_NAV_PATHS[item.path];
    const unread = slug ? counts[slug]?.ungradedTotal ?? 0 : 0;
    return unread > 0 ? { ...item, badge: unread } : item;
  });

  return (
    <RoleSidebar
      roleLabel="Assistant"
      accountLabel="Assistant account"
      navItems={navItems}
    />
  );
}
