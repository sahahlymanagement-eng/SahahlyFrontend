import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";

export default function AssignmentStudentsStatus() {
  const { assignmentId } = useParams();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStudents();
  }, [assignmentId]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await api.get(
        `/assignment-submissions/${assignmentId}/students`
      );

      setStudents(Array.isArray(res.data.students) ? res.data.students : []);
    } catch (err) {
      console.error("Failed to load student submissions", err);
      setError("Failed to load student submissions");
    } finally {
      setLoading(false);
    }
  };

  const renderStatus = (state, isLate, isOnTime) => {
    if (state === "TURNED_IN") {
      if (isLate) return "🟠 Late";
      if (isOnTime) return "🟢 On Time";
      return "🟢 Turned In";
    }

    if (state === "RETURNED") return "🔵 Returned";

    if (state === "NEW" || state === "CREATED")
      return "🔴 Not Turned In";

    return state;
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Assignment – Student Submission Status</h2>

      <hr />

      {loading && <p>⏳ Loading student submissions…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && students.length === 0 && (
        <p>No student submissions found.</p>
      )}

      {students.length > 0 && (
        <table
          border="1"
          cellPadding="8"
          style={{ borderCollapse: "collapse", width: "100%" }}
        >
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Status</th>
              <th>Submitted At</th>
              <th>Assigned Grade</th>
              <th>Last Update</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, index) => (
              <tr key={index}>
                <td>{s.studentId}</td>

                <td>
                  {renderStatus(s.state, s.isLate, s.isOnTime)}
                </td>

                <td>
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleString()
                    : "—"}
                </td>

                <td>
                  {s.assignedGrade !== null
                    ? s.assignedGrade
                    : "—"}
                </td>

                <td>
                  {s.updateTime
                    ? new Date(s.updateTime).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}