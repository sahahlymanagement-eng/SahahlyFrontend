import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FiHome, FiUsers, FiClipboard, FiFileText, FiBookOpen,
  FiZap, FiEye, FiMenu, FiX, FiChevronRight, FiLogOut, FiBarChart2
} from "react-icons/fi";
import "./TeacherSidebar.css";

const NAV_ITEMS = [
  { icon: <FiBookOpen />,  label: "Course Management",   path: "/teacher/courses" },
];

export default function TeacherSidebar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  return (
    
    <aside className={`msb-sidebar ${collapsed ? "msb-sidebar--collapsed" : ""}`}>
      <div className="msb-top">
        <div className="msb-brand">
          {!collapsed && <span className="msb-brand-text">Teacher</span>}
          <button className="msb-toggle" onClick={() => setCollapsed(v => !v)}>
            {collapsed ? <FiMenu size={18} /> : <FiX size={18} />}
          </button>
        </div>
        {!collapsed && (
          <div className="msb-user-card">
            <div className="msb-avatar">{user.name?.charAt(0).toUpperCase()}</div>
            <div className="msb-user-info">
              <span className="msb-user-name">{user.name}</span>
              <span className="msb-user-role">Teahcer</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="msb-avatar msb-avatar--solo">{user.name?.charAt(0).toUpperCase()}</div>
        )}
      </div>

      <nav className="msb-nav">
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path ||
                           location.pathname.startsWith(item.path + "/");
          return (
            <div
              key={item.path}
              className={`msb-nav-item ${isActive ? "msb-nav-item--active" : ""}`}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : ""}
            >
              <span className="msb-nav-icon">{item.icon}</span>
              {!collapsed && <span className="msb-nav-label">{item.label}</span>}
              {!collapsed && isActive && <FiChevronRight className="msb-nav-arrow" size={14} />}
            </div>
          );
        })}
      </nav>

      <div className="msb-bottom">
        <button className="msb-logout-btn" onClick={handleLogout}>
          <FiLogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}