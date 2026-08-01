import { useEffect, useState, useCallback } from "react";
import api from "../../api/api";
import "./DirectorGoogleAccount.css";
import {
  FiMail,
  FiBookOpen,
  FiDownloadCloud,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
} from "react-icons/fi";
import { toast } from "react-toastify";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:6001/api";

export default function DirectorGoogleAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loadingAccountId, setLoadingAccountId] = useState(null);
  const [syncingAccountId, setSyncingAccountId] = useState(null);
  const [refreshingTokenId, setRefreshingTokenId] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [connecting, setConnecting] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await api.get("/director/google-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load accounts", err);
      toast.error(err.response?.data?.message || "Failed to load Google accounts");
    }
  }, []);

  const openGoogleConnect = (email = "") => {
    const trimmed = email.trim().toLowerCase();
    const url = trimmed
      ? `${API_BASE}/google/auth?email=${encodeURIComponent(trimmed)}`
      : `${API_BASE}/google/auth`;

    setConnecting(true);
    const popup = window.open(url, "sahahly-google-oauth", "width=520,height=720");

    if (!popup) {
      setConnecting(false);
      toast.error("Pop-up blocked. Allow pop-ups for this site, then try again.");
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setConnecting(false);
        loadAccounts();
      }
    }, 800);
  };

  const handleAddAccount = (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      toast.warn("Enter the Gmail address to connect");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.warn("Enter a valid email address");
      return;
    }
    if (accounts.some((a) => a.email?.toLowerCase() === email)) {
      toast.info("That account is already connected");
      return;
    }
    openGoogleConnect(email);
  };

  const syncClassroomsFromGoogle = async (account) => {
    if (syncingAccountId) return;

    try {
      setSyncingAccountId(account._id);
      setSelectedAccount(account);

      const res = await api.post(`/classrooms/sync/${account._id}`);
      const total = res.data?.total ?? 0;
      const deactivated = res.data?.deactivated ?? 0;

      toast.success(
        total > 0
          ? `Fetched ${total} classroom${total === 1 ? "" : "s"} for ${account.email}` +
            (deactivated > 0
              ? ` — ${deactivated} archived classroom${deactivated === 1 ? "" : "s"} hidden`
              : "")
          : `No active classrooms found for ${account.email}`
      );

      await loadClassrooms(account);
    } catch (err) {
      console.error("Failed to sync classrooms from Google", err);
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to fetch classrooms from Google";
      const detail = err.response?.data?.detail;
      toast.error(detail && detail !== msg ? `${msg} (${detail})` : msg);
    } finally {
      setSyncingAccountId(null);
    }
  };

  const loadClassrooms = async (account) => {
    try {
      setLoadingAccountId(account._id);
      setSelectedAccount(account);

      const res = await api.get(
        `/director/google-accounts/${account._id}/classrooms/list`
      );

      setClassrooms(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load classrooms", err);
      toast.error(err.response?.data?.message || "Failed to load classrooms");
    } finally {
      setLoadingAccountId(null);
    }
  };

  const removeAccount = async (account) => {
    if (!window.confirm(`Disconnect ${account.email}? Classrooms already synced stay in Sahahly.`)) {
      return;
    }
    try {
      await api.delete(`/director/google-accounts/${account._id}`);
      toast.success(`Disconnected ${account.email}`);
      if (selectedAccount?._id === account._id) {
        setSelectedAccount(null);
        setClassrooms([]);
      }
      loadAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to disconnect account");
    }
  };

  const refreshAccountToken = async (account) => {
    if (refreshingTokenId) return;
    try {
      setRefreshingTokenId(account._id);
      const { data } = await api.post(
        `/director/google-accounts/${account._id}/refresh-token`
      );
      if (data?.classroomAccess?.ok === false) {
        toast.warn(
          data.classroomAccess.message ||
            "Token refreshed, but this account cannot access Google Classroom yet. Reconnect it and approve all permissions."
        );
      } else {
        toast.success(data?.message || `Token refreshed for ${account.email}`);
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        "Failed to refresh token";
      const detail = err.response?.data?.detail;
      toast.error(
        detail && detail !== msg
          ? `${msg} — try Reconnect for ${account.email}`
          : `${msg} — try Reconnect for ${account.email}`
      );
    } finally {
      setRefreshingTokenId(null);
    }
  };

  useEffect(() => {
    loadAccounts();

    const onMessage = (event) => {
      if (event.data?.type === "sahahly-google-connected") {
        setConnecting(false);
        loadAccounts();
        toast.success("Google account connected");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadAccounts]);

  return (
    <div className="directorGooglePage">
      <section className="directorGoogleSection">
        <div className="directorGoogleHeader">
          <div className="directorGoogleTitleWrap">
            <span className="directorGoogleDot" />
            <h2 className="directorGoogleTitle">Google Classroom Integration</h2>
          </div>
        </div>

        <p className="directorGoogleHint">
          Connect multiple teacher Gmail accounts. Google opens a secure sign-in window
          (Sahahly never stores your Google password).
        </p>

        <form className="directorGoogleAddForm" onSubmit={handleAddAccount}>
          <input
            type="email"
            className="directorGoogleEmailInput"
            placeholder="teacher@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
          />
          <button
            type="submit"
            className="directorGooglePrimaryBtn"
            disabled={connecting}
          >
            <FiPlus /> {connecting ? "Connecting…" : "Add Google Account"}
          </button>
        </form>
      </section>

      <section className="directorGoogleSection">
        <div className="directorGoogleHeader">
          <div className="directorGoogleTitleWrap">
            <span className="directorGoogleDot" />
            <h2 className="directorGoogleTitle">Connected Accounts</h2>
          </div>
        </div>

        <div className="directorGoogleGrid">
          {accounts.length === 0 && (
            <div className="directorGoogleCard">
              <p>No Google accounts connected yet. Add one above.</p>
            </div>
          )}

          {accounts.map((acc) => {
            const isSyncing = syncingAccountId === acc._id;
            const isLoading = loadingAccountId === acc._id;
            const isRefreshing = refreshingTokenId === acc._id;

            return (
              <div key={acc._id} className="directorGoogleCard">
                <div className="directorGoogleCardTop">
                  <div className="directorGoogleIconWrap">
                    <FiMail className="directorGoogleIcon" />
                  </div>
                  <button
                    type="button"
                    className="directorGoogleRemoveBtn"
                    title="Disconnect account"
                    onClick={() => removeAccount(acc)}
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>

                <h3>{acc.email}</h3>
                {!acc.hasRefreshToken && (
                  <p className="directorGoogleAccountWarn">
                    No refresh token — use Reconnect below.
                  </p>
                )}

                <div className="directorGoogleActions">
                  <button
                    type="button"
                    className="directorGoogleReconnectBtn"
                    onClick={() => openGoogleConnect(acc.email)}
                    disabled={connecting}
                  >
                    <FiRefreshCw />
                    Reconnect
                  </button>
                  <button
                    type="button"
                    className="directorGoogleRefreshBtn"
                    onClick={() => refreshAccountToken(acc)}
                    disabled={!!refreshingTokenId}
                  >
                    <FiRefreshCw className={isRefreshing ? "directorGoogleSpin" : ""} />
                    {isRefreshing ? "Refreshing…" : "Refresh Token"}
                  </button>
                  <button
                    type="button"
                    className="directorGoogleFetchBtn"
                    onClick={() => syncClassroomsFromGoogle(acc)}
                    disabled={!!syncingAccountId}
                  >
                    <FiDownloadCloud />
                    {isSyncing ? "Fetching…" : "Fetch Classrooms"}
                  </button>

                  <button
                    type="button"
                    onClick={() => loadClassrooms(acc)}
                    disabled={!!loadingAccountId}
                  >
                    <FiBookOpen />
                    {isLoading ? "Loading…" : "View Classrooms"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedAccount && (
        <section className="directorGoogleSection">
          <div className="directorGoogleHeader">
            <div className="directorGoogleTitleWrap">
              <span className="directorGoogleDot" />
              <h2 className="directorGoogleTitle">
                Classrooms for {selectedAccount.email}
              </h2>
            </div>
          </div>

          {loadingAccountId === selectedAccount._id && (
            <div className="directorGoogleCard">
              <p>Loading classrooms…</p>
            </div>
          )}

          {loadingAccountId !== selectedAccount._id && (
            <div className="directorGoogleGrid">
              {classrooms.length === 0 && (
                <div className="directorGoogleCard">
                  <p>No classrooms found. Click Fetch Classrooms first.</p>
                </div>
              )}

              {classrooms.map((c) => (
                <div key={c._id} className="directorGoogleCard">
                  <div className="directorGoogleIconWrap">
                    <FiBookOpen className="directorGoogleIcon" />
                  </div>
                  <h3>{c.name}</h3>
                  <p>Section: {c.section || "—"}</p>
                  <p>{c.description || "No description"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
