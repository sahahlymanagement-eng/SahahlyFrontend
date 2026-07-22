import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiSun, FiMoon } from "react-icons/fi";
import { toast } from "react-toastify";
import api from "../api/api";
import "./ResetPassword.css";
import { useTheme } from "../context/ThemeContext";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();

  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  // Optional: if token is missing, warn user immediately
  useEffect(() => {
    if (!token) {
      toast.error("Reset link is invalid or missing token.");
    }
  }, [token]);

  const validate = () => {
    if (!token) {
      toast.error("Reset link is invalid or missing token.");
      return false;
    }

    if (!password || !confirmPassword) {
      toast.error("Please fill in both password fields.");
      return false;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return false;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return false;
    }

    return true;
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setLoading(true);

      const res = await api.post("/auth/reset-password", {
        token,
        password,
      });

      toast.success(res.data?.message || "Password reset successful.");

      // Clear fields
      setPassword("");
      setConfirmPassword("");

      // Go to login
      navigate("/login", { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to reset password";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-page">
      <button
        type="button"
        className="reset-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>
      <div className="reset-cardWrap">
        <div className="reset-card">
          <div className="reset-brandRow">
            <span className="reset-brandDot" aria-hidden="true" />
            <span className="reset-brandText">Sahahly</span>
          </div>

          <h1 className="reset-title">Reset Password</h1>
          <p className="reset-subtitle">
            Enter a new password to complete the reset process.
          </p>

          {!token ? (
            <div className="reset-alertBox" role="alert">
              This reset link is invalid or expired. Please request a new one from{" "}
              <button
                type="button"
                className="reset-linkBtn"
                onClick={() => navigate("/forgot-password")}
              >
                Forgot Password
              </button>
              .
            </div>
          ) : (
            <form className="reset-form" onSubmit={handleReset}>
              <div className="reset-inputGroup">
                <input
                  className="reset-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                />
                <span className="reset-inputIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M14 10a4 4 0 1 0-1.17 2.83L13 13h2v2h2v2h2v-4.17l-3.05-3.05A3.98 3.98 0 0 0 14 10Zm-6 0a2 2 0 1 1 2 2 2 2 0 0 1-2-2Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>

              <div className="reset-inputGroup">
                <input
                  className="reset-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  required
                  disabled={loading}
                />
                <span className="reset-inputIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M12 17a2 2 0 1 0-2-2 2 2 0 0 0 2 2Zm6-7h-1V8a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM9 8a3 3 0 0 1 6 0v2H9Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`reset-btn ${loading ? "reset-btnDisabled" : ""}`}
              >
                {loading ? (
                  <span className="reset-btnRow">
                    <span className="reset-spinner" aria-hidden="true" />
                    Resetting...
                  </span>
                ) : (
                  "RESET PASSWORD"
                )}
              </button>

              <button
                type="button"
                className="reset-back"
                onClick={() => navigate("/login")}
                disabled={loading}
              >
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}