import { useEffect, useState } from "react";
import api from "../api/api";

export default function ManagerClassroomTest() {
  const [people, setPeople] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [roles, setRoles] = useState([]);

  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    loadRoles();
    loadPeople();
    loadClassrooms();
  }, []);

  const loadRoles = async () => {
    const res = await api.get("/roles");
    setRoles(Array.isArray(res.data) ? res.data : []);
  };

  const loadPeople = async () => {
    const res = await api.get("/people");
    setPeople(Array.isArray(res.data) ? res.data : []);
  };

  const loadClassrooms = async () => {
    const res = await api.get("/classrooms");
    setClassrooms(Array.isArray(res.data) ? res.data : []);
  };

  const isManager = (person) => {
    return (
      person.roleId?.name?.trim().toLowerCase() === "manager"
    );
  };

  const loadAssignments = async (personId) => {
    const res = await api.get(
      `/classroom-managers?personId=${personId}`
    );
    setAssignments(Array.isArray(res.data) ? res.data : []);
  };

  const assignManager = async () => {
    if (!selectedManager || !selectedClassroom) {
      return alert("Select manager and classroom");
    }

    try {
      setLoading(true);
      const res = await api.post("/classroom-managers", {
        personId: selectedManager._id,
        classroomId: selectedClassroom._id,
      });
      setResponse(res.data);
      loadAssignments(selectedManager._id);
    } catch (err) {
      alert("Assignment failed — check backend");
    } finally {
      setLoading(false);
    }
  };

  const removeManager = async (classroomId) => {
    try {
      setLoading(true);
      const res = await api.delete("/classroom-managers", {
        data: { classroomId },
      });
      setResponse(res.data);
      loadAssignments(selectedManager._id);
    } catch (err) {
      alert("Remove failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Manager ↔ Classroom Assignment Test</h2>

      <hr />

      {/* MANAGER SELECT */}
      <h3>1️⃣ Select Manager</h3>

      <ul>
        {people.filter(isManager).map((p) => (
          <li key={p._id}>
            <button
              onClick={() => {
                setSelectedManager(p);
                loadAssignments(p._id);
              }}
            >
              {p.name} ({p.email})
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {/* CLASSROOM SELECT */}
      {selectedManager && (
        <>
          <h3>2️⃣ Select Classroom</h3>

          <ul>
            {classrooms.map((c) => (
              <li key={c._id}>
                <button onClick={() => setSelectedClassroom(c)}>
                  {c.name} {c.section ? `(${c.section})` : ""}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />

      {/* ASSIGN */}
      {selectedManager && selectedClassroom && (
        <>
          <h3>3️⃣ Assign Manager</h3>

          <button onClick={assignManager} disabled={loading}>
            Assign {selectedManager.name} → {selectedClassroom.name}
          </button>
        </>
      )}

      <hr />

      {/* ASSIGNMENTS */}
      {selectedManager && (
        <>
          <h3>4️⃣ Managed Classrooms</h3>

          {assignments.length === 0 && <p>No classrooms assigned.</p>}

          <ul>
            {assignments.map((a) => (
              <li key={a._id}>
                {a.classroomId?.name}
                <button
                  onClick={() =>
                    removeManager(a.classroomId._id)
                  }
                  style={{ marginLeft: 10 }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />

      {loading && <p>Processing…</p>}

      {response && (
        <>
          <h3>Response</h3>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
