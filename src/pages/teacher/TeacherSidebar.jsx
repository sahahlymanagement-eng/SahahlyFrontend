import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FiHome,
  FiBookOpen,
  FiClipboard,
  FiMenu,
  FiX,
  FiChevronRight,
  FiLogOut,
  FiLayers,
} from "react-icons/fi";
import "./TeacherSidebar.css";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/teacher/dashboard" },
  { icon: <FiBookOpen />, label: "My Courses", path: "/teacher/courses" },
  { icon: <FiClipboard />, label: "Reports", path: "/teacher/reports" },
];

export default function TeacherSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <aside className={`tch-sidebar ${collapsed ? "tch-sidebar--collapsed" : ""}`}>
      <div className="tch-sidebar-top">
        <div className="tch-sidebar-brand">
          {!collapsed && (
            <div className="tch-brand-lockup">
              <div className="tch-brand-mark">
                <FiLayers size={16} />
              </div>
              <div>
                <span className="tch-brand-name">Sahahly</span>
                <span className="tch-brand-role">Teacher</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="tch-sidebar-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <FiMenu size={18} /> : <FiX size={18} />}
          </button>
        </div>

        {!collapsed ? (
          <div className="tch-user-card">
            <div className="tch-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
            <div className="tch-user-info">
              <span className="tch-user-name">{user.name}</span>
              <span className="tch-user-role">Teacher account</span>
            </div>
          </div>
        ) : (
          <div className="tch-user-avatar tch-user-avatar--solo">
            {user.name?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <nav className="tch-sidebar-nav">
        {!collapsed && <span className="tch-nav-label">Menu</span>}
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              type="button"
              className={`tch-nav-item ${active ? "tch-nav-item--active" : ""}`}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : ""}
            >
              <span className="tch-nav-icon">{item.icon}</span>
              {!collapsed && <span className="tch-nav-text">{item.label}</span>}
              {!collapsed && active && <FiChevronRight className="tch-nav-arrow" size={14} />}
            </button>
          );
        })}
      </nav>

      <div className="tch-sidebar-bottom">
        <button type="button" className="tch-logout-btn" onClick={handleLogout}>
          <FiLogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
