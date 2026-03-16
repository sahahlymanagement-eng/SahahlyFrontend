import { useEffect, useState } from "react";
import api from "../api/api";

export default function SubjectManagementTest() {
  const [subjects, setSubjects] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [subjectName, setSubjectName] = useState("");
  const [subjectDesc, setSubjectDesc] = useState("");

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  // Load subjects & classrooms on mount
  useEffect(() => {
    loadSubjects();
    loadClassrooms();
  }, []);

  const loadSubjects = async () => {
    const res = await api.get("/subjects");
    setSubjects(Array.isArray(res.data) ? res.data : []);
  };

  const loadClassrooms = async () => {
    const res = await api.get("/classrooms");

    const data = Array.isArray(res.data) ? res.data : [];

    // Put unassigned classrooms first (better UX for testing)
    data.sort((a, b) => {
      if (!a.subjectId && b.subjectId) return -1;
      if (a.subjectId && !b.subjectId) return 1;
      return a.name.localeCompare(b.name);
    });

    setClassrooms(data);
  };

  const createSubject = async () => {
    if (!subjectName.trim()) return alert("Subject name required");

    try {
      setLoading(true);

      const res = await api.post("/subjects", {
        name: subjectName,
        description: subjectDesc,
      });

      setResponse(res.data);
      setSubjectName("");
      setSubjectDesc("");
      loadSubjects();
    } catch (err) {
      console.error("Create subject failed", err);
      alert("Create subject failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  const assignSubject = async () => {
    if (
      selectedClassroom.subjectId &&
      selectedClassroom.subjectId._id === selectedSubject._id
    ) {
      return alert("This classroom is already assigned to this subject");
    }
    if (!selectedClassroom || !selectedSubject) return;

    try {
      setLoading(true);

      const res = await api.patch(
        `/classrooms/${selectedClassroom._id}/assign-subject`,
        {
          subjectId: selectedSubject._id,
        }
      );

      setResponse(res.data);
      loadClassrooms();
    } catch (err) {
      console.error("Assign subject failed", err);
      alert("Assign subject failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Subject Management Test</h2>

      <hr />

      {/* CREATE SUBJECT */}
      <h3>1️⃣ Create Subject</h3>

      <input
        placeholder="Subject name"
        value={subjectName}
        onChange={(e) => setSubjectName(e.target.value)}
      />
      <br />
      <input
        placeholder="Description (optional)"
        value={subjectDesc}
        onChange={(e) => setSubjectDesc(e.target.value)}
      />
      <br />
      <button onClick={createSubject} disabled={loading}>
        Create Subject
      </button>

      <hr />

      {/* SUBJECT LIST */}
      <h3>2️⃣ Select Subject</h3>

      {subjects.length === 0 && <p>No subjects found.</p>}

      <ul>
        {subjects.map((s) => (
          <li key={s._id} style={{ marginBottom: 6 }}>
            <button onClick={() => setSelectedSubject(s)}>
              {s.name} {s.isActive ? "" : "(inactive)"}
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {/* CLASSROOM LIST */}
      <h3>3️⃣ Select Classroom</h3>

      {classrooms.length === 0 && <p>No classrooms found.</p>}

      <ul>
        {classrooms.map((c) => (
          <li key={c._id} style={{ marginBottom: 6 }}>
            <button onClick={() => setSelectedClassroom(c)}>
              {c.name}
              {" — "}
              {c.subjectId ? (
                <span style={{ color: "green" }}>
                  Subject: {c.subjectId.name}
                </span>
              ) : (
                <span style={{ color: "red" }}>
                  Unassigned
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {/* ASSIGN */}
      {selectedClassroom && selectedSubject && (
        <>
          <h3>4️⃣ Assign Subject</h3>

          <button onClick={assignSubject} disabled={loading}>
            Assign "{selectedSubject.name}" →
            "{selectedClassroom.name}"
          </button>
        </>
      )}

      <hr />

      {/* RESPONSE */}
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
