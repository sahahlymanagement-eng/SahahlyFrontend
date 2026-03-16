import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../api/api";
import "./ForgotPassword.css";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // ✅ track success state

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast.error("Please enter your email");
      return;
    }

    try {
      setLoading(true);

      await api.post("/auth/forgot-password", { email: cleanEmail });

      toast.success(
        "If the email exists, reset instructions have been sent."
      );

      setSent(true);      // ✅ show confirmation message
      setEmail("");       // ✅ clear input
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Failed to send reset link";

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-cardWrap">
        <div className="forgot-card">
          <div className="forgot-brandRow">
            <span className="forgot-brandDot" aria-hidden="true" />
            <span className="forgot-brandText">Sahahly</span>
          </div>

          <h1 className="forgot-title">Forgot Password</h1>

          <p className="forgot-subtitle">
            Enter your email and we’ll send you a reset link.
          </p>

          <form className="forgot-form" onSubmit={handleSubmit}>
            <div className="forgot-inputGroup">
              <input
                className="forgot-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                required
                disabled={loading || sent}
              />

              <span className="forgot-inputIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5L4 8V6l8 5 8-5v2Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </div>

            {!sent && (
              <button
                type="submit"
                disabled={loading}
                className={`forgot-btn ${loading ? "forgot-btnDisabled" : ""}`}
              >
                {loading ? (
                  <span className="forgot-btnRow">
                    <span className="forgot-spinner" aria-hidden="true" />
                    Sending...
                  </span>
                ) : (
                  "SEND RESET LINK"
                )}
              </button>
            )}

            {sent && (
              <div className="forgot-successBox">
                ✔ Instructions have been sent to your email.  
                Please check your inbox and follow the link.
              </div>
            )}

            <button
              type="button"
              className="forgot-back"
              onClick={() => navigate("/login")}
              disabled={loading}
            >
              ← Back
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}