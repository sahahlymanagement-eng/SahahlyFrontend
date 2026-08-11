import {
  FiHome, FiClipboard, FiBarChart2, FiSend, FiMessageCircle, FiCpu, FiUploadCloud,
} from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import {
  useGradingNotifications,
  useGradingDelegations,
} from "../../context/GradingNotificationContext";
import { canGradeProvider, isGradingOnlyAccount } from "../../utils/gradingAccess";

// External grading company tabs — each visible only to the accounts allowed to
// grade for that particular partner, and badged with its own unread count. Keyed
// by provider slug (see GRADING_PROVIDERS). Mirrors ManagerSidebar's grading block.
const GRADING_NAV_PATHS = {
  "/assistant/logincss": "logincss",
  "/assistant/mariamgabalawy": "mariamgabalawy",
  "/assistant/drpeter": "drpeter",
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
  { icon: <FiUploadCloud />, label: "Dr Peter", path: "/assistant/drpeter" },
];

export default function AssistantSidebar() {
  // The delegation grant is passed explicitly rather than left to
  // canGradeProvider's module cache, so this render is tied to it and a
  // director-delegated tab appears the moment the grant resolves.
  const { counts } = useGradingNotifications();
  const { delegations } = useGradingDelegations();

  // A grading-only account has no business in the coursework side of the portal,
  // so its sidebar is nothing but the partner tab(s) it can grade for. Every
  // other assistant keeps the full list.
  const gradingOnly = isGradingOnlyAccount();

  const navItems = NAV_ITEMS.filter((item) => {
    const slug = GRADING_NAV_PATHS[item.path];
    if (!slug) return !gradingOnly;
    return canGradeProvider(slug, delegations);
  }).map((item) => {
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
