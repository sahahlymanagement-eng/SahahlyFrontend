import { useEffect, useState } from "react";
import api from "../api/api";

export default function ManagerAssignmentIngestTest() {
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* ---------------- LOAD BASE DATA ---------------- */

  useEffect(() => {
    loadRoles();
    loadPeople();
  }, []);

  const loadRoles = async () => {
    const res = await api.get("/roles");
    setRoles(Array.isArray(res.data) ? res.data : []);
  };

  const loadPeople = async () => {
    const res = await api.get("/people");
    setPeople(Array.isArray(res.data) ? res.data : []);
  };

  const isManager = (person) => {
    if (!person?.roleId) return false;

    // Case 1: roleId is populated object
    if (typeof person.roleId === "object") {
      return (
        person.roleId.name?.trim().toLowerCase() === "manager"
      );
    }

    // Case 2: roleId is ObjectId string
    const role = roles.find(
      (r) => r._id === person.roleId
    );

    return role?.name?.trim().toLowerCase() === "manager";
  };

  /* ---------------- MANAGER → CLASSROOMS ---------------- */

  const loadManagerClassrooms = async (manager) => {
    setSelectedManager(manager);
    setSelectedClassroom(null);
    setAssignments([]);
    setMessage("");

    const res = await api.get(
      `/classroom-managers?personId=${manager._id}`
    );

    const list = Array.isArray(res.data)
      ? res.data.map((m) => m.classroomId)
      : [];

    setClassrooms(list);
  };

  /* ---------------- FETCH ASSIGNMENTS FROM GOOGLE (PREVIEW) ---------------- */

  const fetchAssignmentsFromGoogle = async (classroom) => {
    try {
      setLoading(true);
      setAssignments([]);
      setMessage("");

      const res = await api.get(
        `/assignments/${classroom.ownerGoogleAccountId}/${classroom.googleCourseId}`
      );

      setAssignments(res.data.assignments || []);
    } catch (err) {
      alert("Failed to fetch assignments from Google");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- INGEST ASSIGNMENTS INTO DB ---------------- */

  const ingestAssignments = async () => {
    if (!selectedClassroom) return;

    try {
      setLoading(true);
      setMessage("");

      const res = await api.post(
        `/assignments/ingest/classroom/${selectedClassroom._id}`
      );

      // IMPORTANT: backend returns assignmentsIngested
      setMessage(
        `Ingested ${res.data.assignmentsIngested} assignments successfully`
      );
    } catch (err) {
      alert("Ingestion failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div style={{ padding: 30 }}>
      <h2>Manager — Assignment Ingestion Test</h2>

      <hr />

      {/* SELECT MANAGER */}
      <h3>1️⃣ Select Manager</h3>
      <ul>
        {people.filter(isManager).map((p) => (
          <li key={p._id}>
            <button onClick={() => loadManagerClassrooms(p)}>
              {p.name} ({p.email})
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {/* SELECT CLASSROOM */}
      {classrooms.length > 0 && (
        <>
          <h3>2️⃣ Select Classroom (Managed)</h3>
          <ul>
            {classrooms.map((c) => (
              <li key={c._id}>
                <button onClick={() => setSelectedClassroom(c)}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />

      {/* FETCH ASSIGNMENTS */}
      {selectedClassroom && (
        <>
          <h3>3️⃣ Fetch Assignments from Google (Preview)</h3>

          <button
            onClick={() =>
              fetchAssignmentsFromGoogle(selectedClassroom)
            }
            disabled={loading}
          >
            Fetch Live Assignments
          </button>
        </>
      )}

      <hr />

      {/* SHOW ASSIGNMENTS */}
      {assignments.length > 0 && (
        <>
          <h3>Live Assignments</h3>
          <ul>
            {assignments.map((a) => (
              <li key={a.googleCourseWorkId}>
                <strong>{a.title}</strong>
                <br />
                Type: {a.workType}
                <br />
                State: {a.state}
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />

      {/* INGEST */}
      {selectedClassroom && (
        <>
          <h3>4️⃣ Ingest Assignments into Database</h3>

          <button onClick={ingestAssignments} disabled={loading}>
            Ingest Assignments
          </button>
        </>
      )}

      <hr />

      {loading && <p>Processing…</p>}
      {message && <p style={{ color: "green" }}>{message}</p>}
    </div>
  );
}
