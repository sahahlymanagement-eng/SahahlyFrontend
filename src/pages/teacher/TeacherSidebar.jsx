import { FiHome, FiBookOpen, FiClipboard } from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/teacher/dashboard" },
  { icon: <FiBookOpen />, label: "My Courses", path: "/teacher/courses" },
  { icon: <FiClipboard />, label: "Reports", path: "/teacher/reports" },
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
