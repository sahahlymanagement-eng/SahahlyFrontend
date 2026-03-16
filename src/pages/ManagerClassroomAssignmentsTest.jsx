import React, { useEffect, useState } from "react";
import axios from "axios";

const ManagerClassroomAssignmentsTest = () => {
  const [personId, setPersonId] = useState("");
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activeClassroom, setActiveClassroom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // -----------------------------
  // Fetch classrooms for manager
  // -----------------------------
  const fetchClassrooms = async () => {
  if (!personId) return alert("Enter personId");

  try {
    setLoading(true);

    const res = await api.get(
      `/api/classroom-managers?personId=${personId}`
    );

    // 🔒 HARD VALIDATION
    if (
      typeof res.data === "string" ||
      !Array.isArray(res.data)
    ) {
      console.error("Unexpected response:", res.data);
      alert("Invalid API response (HTML returned instead of JSON)");
      return;
    }

    setClassrooms(res.data);
    setAssignments([]);
    setActiveClassroom(null);
  } catch (err) {
    console.error("Fetch classrooms error:", err);
    alert("Failed to fetch classrooms");
  } finally {
    setLoading(false);
  }
    };



  // -----------------------------------------
  // Fetch assignments from Google (LIVE)
  // -----------------------------------------
  const fetchAssignments = async (classroom) => {
    try {
      setLoading(true);
      setMessage("");
      setAssignments([]);
      setActiveClassroom(classroom);

      const { googleCourseId, ownerGoogleAccountId } = classroom;

      const res = await api.get(
        `/api/assignments/${ownerGoogleAccountId}/${googleCourseId}`
        );

        if (typeof res.data !== "object") {
        alert("Invalid assignment response");
        return;
        }

      setAssignments(res.data.assignments || []);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch assignments");
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------
  // Ingest assignments into Sa7a7ly DB
  // -----------------------------------------
  const ingestAssignments = async (classroomId) => {
    try {
      setLoading(true);
      setMessage("");

      const res = await axios.post(
        `/api/assignments/ingest/classroom/${classroomId}`
      );

      setMessage(
        `✅ Ingested ${res.data.assignmentsIngested} assignments`
      );
    } catch (err) {
      console.error(err);
      alert("Ingestion failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>🧪 Manager → Classroom Assignments Test</h2>

      {/* Manager input */}
      <div style={{ marginBottom: 20 }}>
        <input
          placeholder="Manager personId"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          style={{ width: 300, marginRight: 10 }}
        />
        <button onClick={fetchClassrooms}>Load My Classrooms</button>
      </div>

      {/* Classrooms */}
      <h3>📚 My Classrooms</h3>

      {classrooms.map((item) => {
        const classroom = item.classroomId;

        return (
          <div
            key={classroom._id}
            style={{
              border: "1px solid #ccc",
              padding: 12,
              marginBottom: 10,
              borderRadius: 6
            }}
          >
            <strong>{classroom.name}</strong>{" "}
            {classroom.section && `(${classroom.section})`}

            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => fetchAssignments(classroom)}
                style={{ marginRight: 10 }}
              >
                View Assignments
              </button>

              <button
                onClick={() => ingestAssignments(classroom._id)}
              >
                Ingest Assignments
              </button>
            </div>
          </div>
        );
      })}

      {/* Assignments */}
      {activeClassroom && (
        <>
          <h3 style={{ marginTop: 30 }}>
            📝 Assignments — {activeClassroom.name}
          </h3>

          {assignments.length === 0 && <p>No assignments found.</p>}

          {assignments.map((a) => (
            <div
              key={a.googleCourseWorkId}
              style={{
                border: "1px solid #eee",
                padding: 10,
                marginBottom: 8,
                borderRadius: 4
              }}
            >
              <strong>{a.title}</strong>
              <p>{a.description || "No description"}</p>
              <small>
                {a.workType} | {a.state}
              </small>
            </div>
          ))}
        </>
      )}

      {loading && <p>⏳ Loading…</p>}
      {message && <p>{message}</p>}
    </div>
  );
};

export default ManagerClassroomAssignmentsTest;
