import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  FiHome,
  FiClipboard,
  FiBarChart2,
  FiMenu,
  FiX,
  FiChevronRight,
  FiLogOut,
  FiLayers,
} from "react-icons/fi";
import "./AssistantSidebar.css";

const NAV_ITEMS = [
  { icon: <FiHome />, label: "Dashboard", path: "/assistant/dashboard" },
  { icon: <FiClipboard />, label: "Assignments", path: "/assistant/assignments" },
  { icon: <FiBarChart2 />, label: "Performance", path: "/assistant/performance" },
];

export default function AssistantSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  return (
    <aside className={`ast-sidebar ${collapsed ? "ast-sidebar--collapsed" : ""}`}>
      <div className="ast-sidebar-top">
        <div className="ast-sidebar-brand">
          {!collapsed && (
            <div className="ast-brand-lockup">
              <div className="ast-brand-mark">
                <FiLayers size={16} />
              </div>
              <div>
                <span className="ast-brand-name">Sahahly</span>
                <span className="ast-brand-role">Assistant</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="ast-sidebar-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <FiMenu size={18} /> : <FiX size={18} />}
          </button>
        </div>

        {!collapsed ? (
          <div className="ast-user-card">
            <div className="ast-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
            <div className="ast-user-info">
              <span className="ast-user-name">{user.name}</span>
              <span className="ast-user-role">Assistant account</span>
            </div>
          </div>
        ) : (
          <div className="ast-user-avatar ast-user-avatar--solo">
            {user.name?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <nav className="ast-sidebar-nav">
        {!collapsed && <span className="ast-nav-label">Menu</span>}
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              type="button"
              className={`ast-nav-item ${active ? "ast-nav-item--active" : ""}`}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : ""}
            >
              <span className="ast-nav-icon">{item.icon}</span>
              {!collapsed && <span className="ast-nav-text">{item.label}</span>}
              {!collapsed && active && <FiChevronRight className="ast-nav-arrow" size={14} />}
            </button>
          );
        })}
      </nav>

      <div className="ast-sidebar-bottom">
        <button type="button" className="ast-logout-btn" onClick={handleLogout}>
          <FiLogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
