import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../api/api";
import "./SetupPassword.css";

export default function SetupPassword() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  const handleSetup = async (e) => {
    e.preventDefault();

    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);

      await api.post("/auth/setup-password", {
        email,
        password,
      });

      toast.success("Password set successfully");
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to set password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="setup-cardWrap">
        <div className="setup-card">

          <div className="setup-brandRow">
            <span className="setup-brandDot" />
            <span className="setup-brandText">Sahahly</span>
          </div>

          <h1 className="setup-title">Set Your Password</h1>

          <p className="setup-subtitle">
            Create a secure password to activate your account.
          </p>

          <form className="setup-form" onSubmit={handleSetup}>
            <div className="setup-inputGroup">
              <input
                className="setup-input"
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`setup-btn ${loading ? "setup-btnDisabled" : ""}`}
            >
              {loading ? "Saving..." : "SAVE PASSWORD"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}