import {
  FiHome,
  FiBookOpen,
  FiClipboard,
  FiBarChart2,
  FiMessageCircle,
  FiCpu,
  FiCalendar,
  FiUsers,
} from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/teacher/dashboard" },
  { icon: <FiBookOpen />, label: "My Courses", path: "/teacher/courses" },
  { icon: <FiCalendar />, label: "Sessions & Calendar", path: "/teacher/sessions" },
  { icon: <FiUsers />, label: "Students & Parents", path: "/teacher/students-parents" },
  { icon: <FiBarChart2 />, label: "Submission Viewer", path: "/teacher/submissions" },
  { icon: <FiClipboard />, label: "Reports", path: "/teacher/reports" },
  { icon: <FiCpu />, label: "AI Agent", path: "/teacher/ai-agent" },
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
