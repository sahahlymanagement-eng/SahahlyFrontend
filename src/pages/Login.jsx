import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiSun, FiMoon, FiShield, FiVideo, FiLifeBuoy, FiFileText } from "react-icons/fi";
import api from "../api/api";
import "./Login.css";
import logo from "../assets/images/Logo-trimmed-hd.png";
import { useTheme } from "../context/ThemeContext";
import { toast } from "react-toastify";
import { clearPersistedUiState } from "../hooks/usePersistedState";
import { getRoleName, getDashboardPathForUser } from "../utils/authRoutes";

// Icons (Lucide-react style or simple SVGs)
const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);

export default function Login() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const stored = localStorage.getItem("user");
    if (!token || !stored) return;
    try {
      const user = JSON.parse(stored);
      const path = getDashboardPathForUser(user);
      if (path) navigate(path, { replace: true });
    } catch {
      // ignore malformed session
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/login", { email, password });
      const { token, user } = response.data;

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      // Drop any leftover tab-restore state so a new login starts clean.
      clearPersistedUiState();

      const roleName = getRoleName(user);
      const destination = getDashboardPathForUser(user);

      if (!destination) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        toast.error(`No portal configured for role "${roleName || "unknown"}". Contact an administrator.`);
        return;
      }

      toast.success("Login successful");
      navigate(destination, { replace: true });
    } catch (err) {
      const data = err.response?.data;
      if (data?.requiresSetup) {
        navigate("/setup-password", { state: { email }, replace: true });
        return;
      }
      toast.error(data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>
      <div className="login-content">
        <div className="login-logo-section">
          <span className="login-logo-plate">
            <img src={logo} alt="Sahahly Logo" className="login-logo" />
          </span>
        </div>

        <div className="login-box">
          <h2 className="login-header">Login</h2>
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-wrapper">
              <span className="input-icon"><EmailIcon /></span>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-wrapper">
              <span className="input-icon"><LockIcon /></span>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="forgot-password-row">
              <button 
                type="button" 
                className="forgot-link"
                onClick={() => navigate("/forgot-password")}
              >
                Forgot Password?
              </button>
            </div>

            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? "Logging In..." : "Log In"}
            </button>
          </form>
        </div>

        <div className="login-footer-links">
          <Link to="/privacy-security" className="login-footer-link">
            <FiShield size={14} />
            <span>Privacy &amp; Security</span>
          </Link>
          <Link to="/zoom-documentation" className="login-footer-link">
            <FiVideo size={14} />
            <span>Zoom Docs</span>
          </Link>
          <Link to="/support" className="login-footer-link">
            <FiLifeBuoy size={14} />
            <span>Support</span>
          </Link>
          <Link to="/terms-of-use" className="login-footer-link">
            <FiFileText size={14} />
            <span>Terms of Use</span>
          </Link>
        </div>
      </div>
    </div>
  );
}