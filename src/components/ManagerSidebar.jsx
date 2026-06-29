import {
  FiHome,
  FiUsers,
  FiClipboard,
  FiFileText,
  FiBookOpen,
  FiZap,
  FiEye,
  FiBarChart2,
} from "react-icons/fi";
import AppSidebar from "./AppSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/manager/dashboard" },
  { icon: <FiUsers />, label: "Students Data", path: "/manager/students" },
  { icon: <FiClipboard />, label: "Reports", path: "/manager/assignments" },
  { icon: <FiEye />, label: "Submission Viewer", path: "/manager/submissions" },
  { icon: <FiBarChart2 />, label: "Token Usage", path: "/manager/token-usage" },
  { icon: <FiFileText />, label: "Gemini AI Marking", path: "/manager/marking" },
  { icon: <FiFileText />, label: "Claude AI Marking", path: "/manager/markingclaude" },
  { icon: <FiZap />, label: "Question Bank", path: "/questionbank/manage" },
  { icon: <FiBookOpen />, label: "Course Management", path: "/manager/google-classroom" },
];

export default function ManagerSidebar() {
  return (
    <AppSidebar
      navItems={NAV_ITEMS}
      roleTitle="Manager"
      roleSubtitle="Manager account"
    />
  );
}
