import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { FiSun, FiMoon } from "react-icons/fi";
import logo from "../assets/images/Logo-trimmed.png";
import { useTheme } from "../context/ThemeContext";
import { getDashboardPathForUser } from "../utils/authRoutes";
import "./LandingPage.css";

const AppIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const CmsIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const stored = localStorage.getItem("user");
    if (!token || !stored) return;
    try {
      const path = getDashboardPathForUser(JSON.parse(stored));
      if (path) navigate(path, { replace: true });
    } catch {
      // ignore malformed session
    }
  }, [navigate]);

  return (
    <div className="landing-container">
      <button
        type="button"
        className="landing-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>

      <div className="landing-bg-orb landing-bg-orb--1" />
      <div className="landing-bg-orb landing-bg-orb--2" />

      <div className="landing-content">
        <div className="landing-logo-section">
          <img src={logo} alt="Sahahly" className="landing-logo" />
          <p className="landing-tagline">Choose your portal to get started</p>
        </div>

        <div className="landing-cards">
          <div className="landing-card landing-card--primary">
            <div className="landing-card-icon landing-card-icon--blue">
              <AppIcon />
            </div>
            <div className="landing-card-body">
              <h2 className="landing-card-title">Sahahly Operations</h2>
              <p className="landing-card-desc">
                Access the academic workflow platform — manage assignments, marking, quality review, and more.
              </p>
            </div>
            <Link to="/login" className="landing-btn landing-btn--primary">
              <span>Go to App</span>
              <ArrowIcon />
            </Link>
          </div>

          <div className="landing-divider">
            <span>or</span>
          </div>

          <div className="landing-card landing-card--secondary">
            <div className="landing-card-icon landing-card-icon--teal">
              <CmsIcon />
            </div>
            <div className="landing-card-body">
              <h2 className="landing-card-title">CMS Portal</h2>
              <p className="landing-card-desc">
                Access the content management system to manage courses, materials, and educational content.
              </p>
            </div>
            <a href="https://sahahly.com" className="landing-btn landing-btn--secondary">
              <span>Go to Sahahly</span>
              <ArrowIcon />
            </a>
          </div>
        </div>

        <p className="landing-footer">
          © {new Date().getFullYear()} Sahahly — Academic Workflow &amp; Quality Management
          {" · "}
          <Link to="/privacy-security" className="landing-footer-link">
            Privacy &amp; Security
          </Link>
        </p>
      </div>
    </div>
  );
}
