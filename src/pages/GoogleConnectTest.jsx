import { useEffect, useState } from "react";
import api from "../api/api";

export default function GoogleConnectTest() {
  const [accounts, setAccounts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [fetching, setFetching] = useState(false);

  // Load connected Google accounts
  const loadAccounts = async () => {
    try {
      const res = await api.get("/director/google-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  };

  // Load classrooms from DB (read-only; corrupt records excluded)
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
      alert(
        excluded > 0
          ? `Loaded ${res.data?.count ?? 0} classrooms (${excluded} corrupt record(s) excluded)`
          : `Loaded ${res.data?.count ?? 0} classrooms`
      );
    } catch (err) {
      console.error("Failed to fetch classrooms", err);
      alert("Failed to fetch classrooms — check backend logs");
    } finally {
      setFetching(false);
    }
  };

  // Load classrooms from DB
  const loadClassrooms = async (account) => {
    try {
      setSelectedAccount(account);
      const res = await api.get(
        `/director/google-accounts/${account._id}/classrooms/list`
      );
      setClassrooms(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load classrooms", err);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h2>Sahahly – Director Test Panel</h2>

      <button
        onClick={() =>
          (window.location.href =
            `${import.meta.env.VITE_API_BASE_URL}/google/auth`)
        }
      >
        Connect Google Account
      </button>

      <hr />

      <h3>Connected Google Accounts</h3>

      {accounts.length === 0 && <p>No Google accounts connected.</p>}

      <ul>
        {accounts.map((acc) => (
          <li key={acc._id} style={{ marginBottom: 16 }}>
            <strong>{acc.email}</strong>
            <br />

            <button
              onClick={() => fetchClassrooms(acc)}
              disabled={fetching}
            >
              {fetching ? "Fetching..." : "Fetch Classrooms"}
            </button>

            <button
              style={{ marginLeft: 10 }}
              onClick={() => loadClassrooms(acc)}
            >
              View Classrooms
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {selectedAccount && (
        <>
          <h3>Classrooms for {selectedAccount.email}</h3>

          {fetching && <p>Loading…</p>}

          {!fetching && classrooms.length === 0 && (
            <p>No classrooms found.</p>
          )}

          <ul>
            {classrooms.map((c) => (
              <li key={c._id} style={{ marginBottom: 12 }}>
                <strong>{c.name}</strong>
                <br />
                Section: {c.section || "—"}
                <br />
                {c.description || "No description"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
