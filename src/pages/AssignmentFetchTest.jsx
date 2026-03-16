import { useEffect, useState } from "react";
import api from "../api/api";

export default function AssignmentFetchTest() {
  const [accounts, setAccounts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [loading, setLoading] = useState(false);

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
    setSelectedClassroom(null);
    setAssignments([]);

    const res = await api.get(
      `/director/google-accounts/${account._id}/classrooms/list`
    );
    setClassrooms(Array.isArray(res.data) ? res.data : []);
  };

  const fetchAssignments = async () => {
    if (!selectedAccount || !selectedClassroom) return;

    try {
      setLoading(true);
      setAssignments([]);

      const res = await api.get(
        `/assignments/${selectedAccount._id}/${selectedClassroom.googleCourseId}`
      );

      setAssignments(res.data.assignments || []);
    } catch (err) {
      console.error("Failed to fetch assignments", err);
      alert("Failed to fetch assignments — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Assignment Fetch Test (Single Course)</h2>

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
          <h3>2️⃣ Select Classroom</h3>

          {classrooms.length === 0 && <p>No classrooms found.</p>}

          <ul>
            {classrooms.map((c) => (
              <li key={c._id} style={{ marginBottom: 6 }}>
                <button onClick={() => setSelectedClassroom(c)}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />

      {selectedClassroom && (
        <>
          <h3>3️⃣ Fetch Assignments</h3>

          <button onClick={fetchAssignments}>
            Fetch Assignments for {selectedClassroom.name}
          </button>
        </>
      )}

      <hr />

      {loading && <p>Loading assignments…</p>}

      {!loading && assignments.length === 0 && selectedClassroom && (
        <p>No assignments returned.</p>
      )}

      {assignments.length > 0 && (
        <>
          <h3>Assignments</h3>

          <ul>
            {assignments.map((a) => (
              <li key={a.googleCourseWorkId} style={{ marginBottom: 12 }}>
                <strong>{a.title}</strong>
                <br />
                Type: {a.workType}
                <br />
                State: {a.state}
                <br />
                Due:{" "}
                {a.dueDate
                  ? JSON.stringify(a.dueDate)
                  : "No due date"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
