import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import "./DirectorLayout.css";

import {
  FiMenu,
  FiX,
  FiHome,
  FiUsers,
  FiBook,
  FiShield,
  FiLogOut,
  FiLayers,
  FiBarChart2,
  FiChevronRight
} from "react-icons/fi";

export default function DirectorLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  const menuItems = [
    {
      name: "Dashboard",
      icon: <FiHome />,
      path: "/director/dashboard"
    },
    {
      name: "People",
      icon: <FiUsers />,
      path: "/director/people"
    },
    {
      name: "Classroom Managers",
      icon: <FiLayers />,
      path: "/director/classroommanagers"
    },
    {
      name: "Quality Managers",
      icon: <FiShield />,
      path: "/director/quality-managers"
    },
    {
      name: "Subjects",
      icon: <FiBook />,
      path: "/director/subjects"
    },
    {
      name: "Manager Workload",
      icon: <FiBarChart2 />,
      path: "/director/manager-workload"
    },
    {
      name: "Create Teachers",
      icon: <FiBarChart2 />,
      path: "/director/manage-teachers"
    },
    {
      name: "Assign Classroom Teacher",
      icon: <FiBarChart2 />,
      path: "/director/manage-classroom-teachers"
    },
    {
      name: "Google Accounts",
      icon: <FiBarChart2 />, 
      path: "/director/google-accounts"
    }
  ];

  return (
    <div className="directorLayout">
      <aside className={`directorSidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebarTop">
          <div className="sidebarHeader">
            {!collapsed && (
              <div className="sidebarBrand">
                <span className="brandTitle">Director Panel</span>
              </div>
            )}

            <button
              className="sidebarToggle"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <FiMenu size={18} /> : <FiX size={18} />}
            </button>
          </div>

          {!collapsed ? (
            <div className="directorUserCard">
              <div className="directorUserAvatar">
                {user?.name?.charAt(0)?.toUpperCase() || "D"}
              </div>

              <div className="directorUserInfo">
                <span className="directorUserName">{user?.name || "Director"}</span>
                <span className="directorUserRole">
                  {user?.roleId?.name || "Admin"}
                </span>
              </div>
            </div>
          ) : (
            <div className="directorUserAvatar directorUserAvatarSolo">
              {user?.name?.charAt(0)?.toUpperCase() || "D"}
            </div>
          )}
        </div>

        <div className="sidebarMenu">
          {menuItems.map((item) => {
            const active = location.pathname === item.path;

            return (
              <div
                key={item.path}
                className={`sidebarItem ${active ? "active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <div className="sidebarIcon">{item.icon}</div>

                {!collapsed && (
                  <>
                    <span className="sidebarText">{item.name}</span>
                    {active && <FiChevronRight className="sidebarArrow" size={14} />}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebarBottom">
          <button
            className="logoutBtn"
            onClick={() => {
              localStorage.clear();
              navigate("/login");
            }}
          >
            <FiLogOut size={16} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="directorMain">
        <div className="directorTopbar">
          <div className="topbarLeft">
            <h1 className="topbarTitle">Director Workspace</h1>
            <span className="topbarSubtitle">
              Welcome back, {user?.name}
            </span>
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