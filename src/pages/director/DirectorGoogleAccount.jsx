import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorGoogleAccount.css";
import { FiMail, FiBookOpen, FiRefreshCw } from "react-icons/fi";
import { toast } from "react-toastify";

export default function DirectorGoogleAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const loadAccounts = async () => {
    try {
      const res = await api.get("/director/google-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load accounts", err);
      toast.error(err.response?.data?.message || "Failed to load Google accounts");
    }
  };

  const fetchClassrooms = async (account) => {
    if (fetching) return;

    try {
      setFetching(true);
      setSelectedAccount(account);
      setClassrooms([]);

      const res = await api.post(
        `/director/google-accounts/${account._id}/classrooms`
      );

      setClassrooms(Array.isArray(res.data?.data) ? res.data.data : []);

      const excluded = res.data?.excludedCorrupt ?? 0;
      toast.success(
        excluded > 0
          ? `Loaded ${res.data?.count ?? 0} classrooms (${excluded} corrupt record(s) excluded)`
          : `Loaded ${res.data?.count ?? 0} classrooms from database`
      );
    } catch (err) {
      console.error("Failed to fetch classrooms", err);
      toast.error(err.response?.data?.message || "Failed to fetch classrooms");
    } finally {
      setFetching(false);
    }
  };

  const loadClassrooms = async (account) => {
    try {
      setLoading(true);
      setSelectedAccount(account);

      const res = await api.get(
        `/director/google-accounts/${account._id}/classrooms/list`
      );

      setClassrooms(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load classrooms", err);
      toast.error(err.response?.data?.message || "Failed to load classrooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div className="directorGooglePage">
      {/* HEADER */}
      <section className="directorGoogleSection">
        <div className="directorGoogleHeader">
          <div className="directorGoogleTitleWrap">
            <span className="directorGoogleDot" />
            <h2 className="directorGoogleTitle">
              Google Classroom Integration
            </h2>
          </div>

          <button
            className="directorGooglePrimaryBtn"
            onClick={() =>
              (window.location.href =
                `${import.meta.env.VITE_API_BASE_URL}/google/auth`)
            }
          >
            Connect Google Account
          </button>
        </div>
      </section>

      {/* ACCOUNTS */}
      <section className="directorGoogleSection">
        <div className="directorGoogleHeader">
          <div className="directorGoogleTitleWrap">
            <span className="directorGoogleDot" />
            <h2 className="directorGoogleTitle">
              Connected Accounts
            </h2>
          </div>
        </div>

        <div className="directorGoogleGrid">
          {accounts.length === 0 && (
            <div className="directorGoogleCard">
              <p>No Google accounts connected.</p>
            </div>
          )}

          {accounts.map((acc) => (
            <div key={acc._id} className="directorGoogleCard">
              <div className="directorGoogleIconWrap">
                <FiMail className="directorGoogleIcon" />
              </div>

              <h3>{acc.email}</h3>

              <div className="directorGoogleActions">
                <button
                  onClick={() => fetchClassrooms(acc)}
                  disabled={fetching}
                >
                  <FiRefreshCw /> {fetching ? "Loading..." : "Load Classrooms"}
                </button>

                <button
                  onClick={() => loadClassrooms(acc)}
                >
                  <FiBookOpen /> View Classrooms
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CLASSROOMS */}
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

          {loading && (
            <div className="directorGoogleCard">
              <p>Loading classrooms...</p>
            </div>
          )}

          {!loading && (
            <div className="directorGoogleGrid">
              {classrooms.length === 0 && (
                <div className="directorGoogleCard">
                  <p>No classrooms found.</p>
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