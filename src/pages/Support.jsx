import { Link } from "react-router-dom";
import { FiSun, FiMoon, FiArrowLeft, FiLifeBuoy, FiMail } from "react-icons/fi";
import logo from "../assets/images/Logo-trimmed-hd.png";
import { useTheme } from "../context/ThemeContext";
import "./PrivacySecurityPolicy.css";

const SUPPORT_EMAIL = "sahahlymanagment@gmail.com";

export default function Support() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="psp-page">
      <button
        type="button"
        className="psp-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>

      <div className="psp-bg-orb psp-bg-orb--1" />
      <div className="psp-bg-orb psp-bg-orb--2" />

      <div className="psp-shell">
        <header className="psp-header">
          <Link to="/login" className="psp-back">
            <FiArrowLeft size={16} />
            Back to Login
          </Link>
          <img src={logo} alt="Sahahly" className="psp-logo" />
          <div className="psp-title-row">
            <span className="psp-title-icon" aria-hidden>
              <FiLifeBuoy size={22} />
            </span>
            <div>
              <h1>Support</h1>
            </div>
          </div>
          <p className="psp-lead">
            Need help with Sahahly? Reach out to our support team and we&apos;ll
            get back to you as soon as possible.
          </p>
        </header>

        <article className="psp-content">
          <section className="psp-section">
            <div className="psp-section-head">
              <FiMail size={18} />
              <h2>Contact support</h2>
            </div>
            <p>
              For account access, billing, technical issues, or general
              questions about Sahahly, email us at:
            </p>
            <p>
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </section>
        </article>

        <footer className="psp-footer">
          <Link to="/login">Login</Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Sahahly</span>
        </footer>
      </div>
    </div>
  );
}
