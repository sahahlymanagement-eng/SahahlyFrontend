import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiGrid, FiUpload, FiSearch, FiLogOut,
  FiMenu, FiX, FiChevronRight, FiBook, FiZap, FiHome
} from "react-icons/fi";
import "./QuestionBank.css";

const navItems = [
  { icon: <FiGrid />,   label: "Manage",  path: "/questionbank/manage"  },
  { icon: <FiUpload />, label: "Upload",  path: "/questionbank/upload"  },
  { icon: <FiSearch />, label: "Browse",  path: "/questionbank/browse"  },
  { icon: <FiZap />,    label: "Classify", path: "/questionbank/classify" },
  {icon:  <FiHome />,   label: "Dashboard", path: "/manager/dashboard", active: true },
];

export default function QBLayout({ children, title, subtitle }) {
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
    <div className="qb-root">

      {/* SIDEBAR */}
      <aside className={`qb-sidebar ${collapsed ? "qb-sidebar--collapsed" : ""}`}>
        <div className="qb-sidebar-top">
          <div className="qb-sidebar-brand">
            {!collapsed && <span className="qb-brand-text">Question Bank</span>}
            <button className="qb-toggle-btn" onClick={() => setCollapsed(v => !v)}>
              {collapsed ? <FiMenu size={16} /> : <FiX size={16} />}
            </button>
          </div>
          {!collapsed && (
            <div className="qb-user-card">
              <div className="qb-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
              <div className="qb-user-info">
                <span className="qb-user-name">{user.name}</span>
                <span className="qb-user-role">{user.roleId?.name}</span>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="qb-user-avatar qb-user-avatar--solo">{user.name?.charAt(0).toUpperCase()}</div>
          )}
        </div>

        <nav className="qb-sidebar-nav">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <div
                key={item.path}
                className={`qb-nav-item ${isActive ? "qb-nav-item--active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <span className="qb-nav-icon">{item.icon}</span>
                {!collapsed && <span className="qb-nav-label">{item.label}</span>}
                {!collapsed && isActive && <FiChevronRight className="qb-nav-arrow" size={14} />}
              </div>
            );
          })}
        </nav>

        <div className="qb-sidebar-bottom">
          <button className="qb-logout-btn" onClick={handleLogout}>
            <FiLogOut size={15} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="qb-main">
        <header className="qb-topbar">
          <div>
            <h1 className="qb-topbar-title">{title}</h1>
            {subtitle && <p className="qb-topbar-sub">{subtitle}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FiBook size={18} style={{ color: "#399cf2" }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Question Bank</span>
          </div>
        </header>
        <div className="qb-content">
          {children}
        </div>
      </main>

    </div>
  );
}