import { useEffect, useState } from "react";
import api from "../api/api";

export default function AssignmentIngestionTest() {
  const [accounts, setAccounts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Load Google accounts
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const res = await api.get("/director/google-accounts");
    setAccounts(Array.isArray(res.data) ? res.data : []);
  };

  const loadClassrooms = async (account) => {
    setSelectedAccount(account);
    setClassrooms([]);
    setMessage("");

    const res = await api.get(
      `/director/google-accounts/${account._id}/classrooms/list`
    );

    setClassrooms(Array.isArray(res.data) ? res.data : []);
  };

  const ingestAssignments = async (classroom) => {
    try {
      setLoading(true);
      setMessage("");

      const res = await api.post(
        `/assignments/ingest/classroom/${classroom._id}`
      );

      setMessage(
        `✅ ${res.data.message} (Ingested: ${res.data.result.ingested})`
      );
    } catch (err) {
      console.error("Ingestion failed", err);
      setMessage("❌ Ingestion failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Assignment Ingestion Test</h2>

      <hr />

      <h3>1️⃣ Select Google Account</h3>

      <ul>
        {accounts.map((acc) => (
          <li key={acc._id} style={{ marginBottom: 8 }}>
            <button onClick={() => loadClassrooms(acc)}>
              {acc.email}
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {selectedAccount && (
        <>
          <h3>2️⃣ Classrooms for {selectedAccount.email}</h3>

          {classrooms.length === 0 && <p>No classrooms found.</p>}

          <ul>
            {classrooms.map((c) => (
              <li key={c._id} style={{ marginBottom: 12 }}>
                <strong>{c.name}</strong>
                <br />
                Section: {c.section || "—"}
                <br />
                <button
                  style={{ marginTop: 6 }}
                  onClick={() => ingestAssignments(c)}
                  disabled={loading}
                >
                  Ingest Assignments
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />

      {loading && <p>⏳ Ingesting assignments…</p>}

      {message && <p>{message}</p>}
    </div>
  );
}
