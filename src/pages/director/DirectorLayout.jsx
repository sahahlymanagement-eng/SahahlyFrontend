import { Outlet, useNavigate } from "react-router-dom";
import AppSidebar from "../../components/AppSidebar";
import "./DirectorLayout.css";

import {
  FiHome,
  FiUsers,
  FiBook,
  FiShield,
  FiLayers,
  FiBarChart2,
  FiBookOpen,
} from "react-icons/fi";

export default function DirectorLayout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const navItems = [
    { label: "Dashboard", icon: <FiHome />, path: "/director/dashboard" },
    { label: "People", icon: <FiUsers />, path: "/director/people" },
    { label: "Classroom Managers", icon: <FiLayers />, path: "/director/classroommanagers" },
    { label: "Quality Managers", icon: <FiShield />, path: "/director/quality-managers" },
    { label: "Subjects", icon: <FiBook />, path: "/director/subjects" },
    { label: "Manager Workload", icon: <FiBarChart2 />, path: "/director/manager-workload" },
    { label: "Token Usage", icon: <FiBarChart2 />, path: "/director/token-usage" },
    { label: "Create Teachers", icon: <FiBarChart2 />, path: "/director/manage-teachers" },
    { label: "Assign Classroom Teacher", icon: <FiBarChart2 />, path: "/director/manage-classroom-teachers" },
    { label: "Google Accounts", icon: <FiBarChart2 />, path: "/director/google-accounts" },
    { label: "Course Management", icon: <FiBookOpen />, path: "/director/google-classroom" },
  ];

  return (
    <div className="directorLayout">
      <AppSidebar
        navItems={navItems}
        roleTitle="Director"
        roleSubtitle={user?.roleId?.name || "Administration"}
        onLogout={() => {
          localStorage.clear();
          navigate("/login");
        }}
      />

      <main className="directorMain">
        <div className="directorTopbar">
          <div className="topbarLeft">
            <h1 className="topbarTitle">Director Workspace</h1>
            <span className="topbarSubtitle">Welcome back, {user?.name}</span>
          </div>

          <div className="topbarRight">
            <div className="topbarPill">Administration Panel</div>
          </div>
        </div>

        <div className="directorContent">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
