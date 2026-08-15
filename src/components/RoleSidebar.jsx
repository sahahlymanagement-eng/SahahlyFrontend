import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  FiMenu,
  FiX,
  FiChevronRight,
  FiLogOut,
  FiSun,
  FiMoon,
} from "react-icons/fi";
import { useTheme } from "../context/ThemeContext";
import { clearPersistedUiState } from "../hooks/usePersistedState";
import { clearSession } from "../utils/session";
import logo from "../assets/images/Logo-trimmed.png";
import "./RoleSidebar.css";

/**
 * Shared assistant-style sidebar for all roles.
 * @param {{ roleLabel: string, accountLabel?: string, navItems?: { icon: React.ReactNode, label: string, path: string }[], navSections?: { label?: string, items: { icon: React.ReactNode, label: string, path: string }[] }[] }} props
 */
export default function RoleSidebar({
  roleLabel,
  accountLabel,
  navItems = [],
  navSections,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleLogout = () => {
    clearSession();
    clearPersistedUiState();
    navigate("/login", { replace: true });
  };

  const subtitle = accountLabel || `${roleLabel} account`;
  const sections = navSections?.length
    ? navSections
    : [{ items: navItems }];

  return (
    <aside className={`ast-sidebar ${collapsed ? "ast-sidebar--collapsed" : ""}`}>
      <div className="ast-sidebar-top">
        <div className="ast-sidebar-brand">
          <span className="ast-brand-spacer" aria-hidden="true" />
          {!collapsed && (
            <img src={logo} alt="Sahahly" className="ast-brand-logo" />
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
              <span className="ast-user-role">{subtitle}</span>
            </div>
          </div>
        ) : (
          <div className="ast-user-avatar ast-user-avatar--solo">
            {user.name?.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <nav className="ast-sidebar-nav">
        {sections.map((section, sectionIndex) => (
          <div className="ast-nav-section" key={section.label || `section-${sectionIndex}`}>
            {!collapsed && section.label && (
              <span className="ast-nav-label">{section.label}</span>
            )}
            {section.items.map((item) => {
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
                  {!collapsed && item.badge ? (
                    <span className="ast-nav-badge">{item.badge}</span>
                  ) : null}
                  {collapsed && item.badge ? (
                    <span className="ast-nav-badge-dot" />
                  ) : null}
                  {!collapsed && active && (
                    <FiChevronRight className="ast-nav-arrow" size={14} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="ast-sidebar-bottom">
        <button
          type="button"
          className="ast-theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />}
          {!collapsed && (
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          )}
        </button>
        <button type="button" className="ast-logout-btn" onClick={handleLogout}>
          <FiLogOut size={16} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
