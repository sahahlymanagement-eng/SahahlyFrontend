import { Outlet } from "react-router-dom";
import { FiBarChart2, FiBookOpen, FiClipboard } from "react-icons/fi";
import RoleSidebar from "../../components/RoleSidebar";
import RoleShell from "../../components/RoleShell";
import "../director/directorShell.css";

const NAV_SECTIONS = [
  {
    label: "Tools",
    items: [
      {
        icon: <FiBarChart2 />,
        label: "Submission Viewer",
        path: "/backup/submissions",
      },
      { icon: <FiClipboard />, label: "Reports", path: "/backup/reports" },
      {
        icon: <FiBookOpen />,
        label: "Course Management",
        path: "/backup/courses",
      },
    ],
  },
];

export default function BackupLayout() {
  return (
    <RoleShell
      sidebar={
        <RoleSidebar
          roleLabel="Backup"
          accountLabel="Limited director access"
          navSections={NAV_SECTIONS}
        />
      }
    >
      <div className="ast-page director-page">
        <div className="director-page-inner">
          <Outlet />
        </div>
      </div>
    </RoleShell>
  );
}
