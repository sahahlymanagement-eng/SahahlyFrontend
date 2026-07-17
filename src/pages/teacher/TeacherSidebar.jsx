import {
  FiHome,
  FiBookOpen,
  FiClipboard,
  FiBarChart2,
  FiMessageCircle,
} from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/teacher/dashboard" },
  { icon: <FiBookOpen />, label: "My Courses", path: "/teacher/courses" },
  { icon: <FiBarChart2 />, label: "Submission Viewer", path: "/teacher/submissions" },
  { icon: <FiClipboard />, label: "Reports", path: "/teacher/reports" },
  { icon: <FiMessageCircle />, label: "Chatbot", path: "/teacher/chatbot" },
];

export default function TeacherSidebar() {
  return (
    <RoleSidebar
      roleLabel="Teacher"
      accountLabel="Teacher account"
      navItems={NAV_ITEMS}
    />
  );
}
