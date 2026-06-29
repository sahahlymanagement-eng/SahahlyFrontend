import {
  FiHome,
  FiBookOpen,
  FiClipboard,
} from "react-icons/fi";
import AppSidebar from "../../components/AppSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/teacher/dashboard" },
  { icon: <FiBookOpen />, label: "My Courses", path: "/teacher/courses" },
  { icon: <FiClipboard />, label: "Reports", path: "/teacher/reports" },
];

export default function TeacherSidebar() {
  return (
    <AppSidebar
      navItems={NAV_ITEMS}
      roleTitle="Teacher"
      roleSubtitle="Teacher account"
    />
  );
}
