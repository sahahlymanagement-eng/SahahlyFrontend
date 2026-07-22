import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FiMenu, FiSun, FiMoon } from "react-icons/fi";
import "../pages/assistant/assistant.css";
import "../styles/ui-polish.css";
import { useIsMobileNav } from "../hooks/useMediaQuery";
import { useTheme } from "../context/ThemeContext";
import logo from "../assets/images/Logo-trimmed.png";

export default function RoleShell({ sidebar, children }) {
  const isMobileNav = useIsMobileNav();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Close the drawer whenever navigation occurs (any sidebar nav item fires it).
  // Adjusting state during render (React's recommended pattern) instead of an
  // effect avoids a cascading re-render on every route change.
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  // A stale "open" flag is harmless on desktop because the drawer is only
  // active when both conditions hold — no viewport-change effect needed.
  const drawerActive = isMobileNav && drawerOpen;

  // Lock body scroll while the drawer is open (external DOM side effect).
  useEffect(() => {
    document.body.classList.toggle("ast-body--drawer-open", drawerActive);
    return () => document.body.classList.remove("ast-body--drawer-open");
  }, [drawerActive]);

  return (
    <div className={`ast-root ${drawerActive ? "ast-root--drawer-open" : ""}`}>
      <header className="ast-mobile-topbar">
        <button
          type="button"
          className="ast-mobile-menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerActive}
        >
          <FiMenu size={22} />
        </button>
        <div className="ast-mobile-brand">
          <span className="ast-mobile-brand-mark">
            <img src={logo} alt="Sahahly" className="ast-mobile-brand-logo" />
          </span>
        </div>
        <button
          type="button"
          className="ast-mobile-theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
        </button>
      </header>

      {sidebar}

      <div
        className="ast-drawer-backdrop"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <main className="ast-main">{children}</main>
    </div>
  );
}
