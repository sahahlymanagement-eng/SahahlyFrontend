import { useEffect, useState, useCallback, useMemo } from "react";
import api from "../../api/api";
import "./DirectorGoogleAccount.css";
import {
  FiMail,
  FiBookOpen,
  FiDownloadCloud,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiX,
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

  const [pickerAccount, setPickerAccount] = useState(null);
  const [pickerCourses, setPickerCourses] = useState([]);
  const [pickerSelected, setPickerSelected] = useState(() => new Set());
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

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

  const resetPicker = () => {
    setPickerAccount(null);
    setPickerCourses([]);
    setPickerSelected(new Set());
    setPickerSearch("");
    setPickerLoading(false);
  };

  const closePicker = () => {
    if (syncingAccountId) return;
    resetPicker();
  };

  const openFetchPicker = async (account) => {
    if (syncingAccountId || pickerLoading) return;
    try {
      setPickerAccount(account);
      setPickerLoading(true);
      setPickerCourses([]);
      setPickerSelected(new Set());
      setPickerSearch("");

      const res = await api.get(`/classrooms/preview/${account._id}`);
      const courses = Array.isArray(res.data?.courses) ? res.data.courses : [];
      setPickerCourses(courses);
      // Pre-select not-yet-synced courses; if all already synced, select all
      const unsynced = courses.filter((c) => !c.alreadySynced).map((c) => c.id);
      const initial =
        unsynced.length > 0 ? unsynced : courses.map((c) => c.id);
      setPickerSelected(new Set(initial));
    } catch (err) {
      console.error("Failed to preview Google classrooms", err);
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Failed to list classrooms from Google";
      const detail = err.response?.data?.detail;
      toast.error(detail && detail !== msg ? `${msg} (${detail})` : msg);
      setPickerAccount(null);
    } finally {
      setPickerLoading(false);
    }
  };

  const filteredPickerCourses = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return pickerCourses;
    return pickerCourses.filter((c) => {
      const blob = `${c.name || ""} ${c.section || ""} ${c.description || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [pickerCourses, pickerSearch]);

  const togglePickerCourse = (id) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      for (const c of filteredPickerCourses) next.add(c.id);
      return next;
    });
  };

  const clearVisible = () => {
    const visibleIds = new Set(filteredPickerCourses.map((c) => c.id));
    setPickerSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.delete(id);
      return next;
    });
  };

  const syncSelectedClassrooms = async () => {
    if (!pickerAccount || syncingAccountId) return;
    const courseIds = [...pickerSelected];
    if (courseIds.length === 0) {
      toast.warn("Select at least one classroom");
      return;
    }

    try {
      setSyncingAccountId(pickerAccount._id);
      setSelectedAccount(pickerAccount);

      const res = await api.post(`/classrooms/sync/${pickerAccount._id}`, {
        courseIds,
      });
      const total = res.data?.total ?? 0;

      toast.success(
        total > 0
          ? `Fetched ${total} classroom${total === 1 ? "" : "s"} for ${pickerAccount.email}`
          : `No classrooms imported for ${pickerAccount.email}`
      );

      const account = pickerAccount;
      resetPicker();
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

  const syncAllClassrooms = async () => {
    if (!pickerAccount || syncingAccountId) return;
    if (
      !window.confirm(
        `Fetch ALL ${pickerCourses.length} classroom${pickerCourses.length === 1 ? "" : "s"} for ${pickerAccount.email}? Classrooms no longer on Google will be archived.`
      )
    ) {
      return;
    }

    try {
      setSyncingAccountId(pickerAccount._id);
      setSelectedAccount(pickerAccount);

      const res = await api.post(`/classrooms/sync/${pickerAccount._id}`, {
        mode: "all",
      });
      const total = res.data?.total ?? 0;
      const deactivated = res.data?.deactivated ?? 0;

      toast.success(
        total > 0
          ? `Fetched ${total} classroom${total === 1 ? "" : "s"} for ${pickerAccount.email}` +
            (deactivated > 0
              ? ` — ${deactivated} archived classroom${deactivated === 1 ? "" : "s"} hidden`
              : "")
          : `No active classrooms found for ${pickerAccount.email}`
      );

      const account = pickerAccount;
      resetPicker();
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

  const selectedCount = pickerSelected.size;
  const isPickerSyncing = pickerAccount && syncingAccountId === pickerAccount._id;

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
                    onClick={() => openFetchPicker(acc)}
                    disabled={!!syncingAccountId || pickerLoading}
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

      {pickerAccount && (
        <div
          className="directorGoogleModalBackdrop"
          role="presentation"
          onClick={closePicker}
        >
          <div
            className="directorGoogleModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="director-google-fetch-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="directorGoogleModalHeader">
              <h3 id="director-google-fetch-title">
                Fetch classrooms — {pickerAccount.email}
              </h3>
              <button
                type="button"
                className="directorGoogleModalClose"
                onClick={closePicker}
                disabled={!!isPickerSyncing}
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>

            <p className="directorGoogleModalHint">
              Choose which Google classrooms to import. Leaving one unchecked does not
              remove it from Sahahly if it was already fetched.
            </p>

            {pickerLoading ? (
              <p className="directorGoogleModalStatus">Loading classrooms from Google…</p>
            ) : pickerCourses.length === 0 ? (
              <p className="directorGoogleModalStatus">
                No active classrooms found on this Google account.
              </p>
            ) : (
              <>
                <div className="directorGooglePickerToolbar">
                  <input
                    type="search"
                    className="directorGooglePickerSearch"
                    placeholder="Search by name or section…"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    disabled={!!isPickerSyncing}
                  />
                  <div className="directorGooglePickerToolbarActions">
                    <button type="button" onClick={selectAllVisible} disabled={!!isPickerSyncing}>
                      Select visible
                    </button>
                    <button type="button" onClick={clearVisible} disabled={!!isPickerSyncing}>
                      Clear visible
                    </button>
                  </div>
                </div>

                <ul className="directorGooglePickerList">
                  {filteredPickerCourses.map((c) => {
                    const checked = pickerSelected.has(c.id);
                    return (
                      <li key={c.id}>
                        <label className="directorGooglePickerRow">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePickerCourse(c.id)}
                            disabled={!!isPickerSyncing}
                          />
                          <span className="directorGooglePickerMeta">
                            <span className="directorGooglePickerName">{c.name}</span>
                            <span className="directorGooglePickerSub">
                              {c.section ? `Section: ${c.section}` : "No section"}
                              {c.alreadySynced ? " · already in Sahahly" : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="directorGoogleModalFooter">
              <button
                type="button"
                className="directorGoogleModalSecondary"
                onClick={syncAllClassrooms}
                disabled={
                  !!isPickerSyncing || pickerLoading || pickerCourses.length === 0
                }
              >
                {isPickerSyncing ? "Fetching…" : "Fetch all"}
              </button>
              <div className="directorGoogleModalFooterRight">
                <button
                  type="button"
                  className="directorGoogleModalSecondary"
                  onClick={closePicker}
                  disabled={!!isPickerSyncing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="directorGooglePrimaryBtn"
                  onClick={syncSelectedClassrooms}
                  disabled={
                    !!isPickerSyncing ||
                    pickerLoading ||
                    selectedCount === 0
                  }
                >
                  <FiDownloadCloud />
                  {isPickerSyncing
                    ? "Fetching…"
                    : `Fetch selected (${selectedCount})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
