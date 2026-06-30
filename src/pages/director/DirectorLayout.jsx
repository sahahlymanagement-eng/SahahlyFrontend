import { Outlet } from "react-router-dom";
import {
  FiHome,
  FiUsers,
  FiBook,
  FiShield,
  FiLayers,
  FiBarChart2,
  FiBookOpen,
  FiUserPlus,
  FiLink,
} from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import RoleShell from "../../components/RoleShell";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/director/dashboard" },
  { icon: <FiUsers />, label: "People", path: "/director/people" },
  { icon: <FiLayers />, label: "Classroom Managers", path: "/director/classroommanagers" },
  { icon: <FiShield />, label: "Quality Managers", path: "/director/quality-managers" },
  { icon: <FiBook />, label: "Subjects", path: "/director/subjects" },
  { icon: <FiBarChart2 />, label: "Manager Workload", path: "/director/manager-workload" },
  { icon: <FiBarChart2 />, label: "Token Usage", path: "/director/token-usage" },
  { icon: <FiUserPlus />, label: "Create Teachers", path: "/director/manage-teachers" },
  { icon: <FiLink />, label: "Assign Classroom Teacher", path: "/director/manage-classroom-teachers" },
  { icon: <FiUsers />, label: "Google Accounts", path: "/director/google-accounts" },
  { icon: <FiBookOpen />, label: "Course Management", path: "/director/google-classroom" },
];

export default function DirectorLayout() {
  return (
    <RoleShell sidebar={
      <RoleSidebar
        roleLabel="Director"
        accountLabel="Admin account"
        navItems={NAV_ITEMS}
      />
    }>
      <div className="ast-page ast-page--wide">
        <Outlet />
      </div>
    </RoleShell>
  );
}
