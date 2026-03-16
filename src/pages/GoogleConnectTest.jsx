import { useEffect, useState } from "react";
import api from "../api/api";

export default function GoogleConnectTest() {
  const [accounts, setAccounts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load connected Google accounts
  const loadAccounts = async () => {
    try {
      const res = await api.get("/director/google-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  };

  // Fetch classrooms from Google and store in DB
  const fetchClassrooms = async (account) => {
    try {
      setLoading(true);
      setSelectedAccount(account);
      setClassrooms([]);

      await api.post(
        `/director/google-accounts/${account._id}/classrooms`
      );

      alert("Classrooms fetched from Google");
    } catch (err) {
      console.error("Failed to fetch classrooms", err);
      alert("Failed to fetch classrooms — check backend logs");
    } finally {
      setLoading(false);
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

            <button onClick={() => fetchClassrooms(acc)}>
              Fetch Classrooms
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

          {loading && <p>Loading…</p>}

          {!loading && classrooms.length === 0 && (
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
