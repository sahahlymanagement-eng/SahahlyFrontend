import { useState } from "react";
import api from "../api/api";

export default function AssistantAssignmentsTest() {
  const [personId, setPersonId] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  /* ================= FETCH ASSIGNMENTS ================= */

  const fetchAssignments = async () => {
    if (!personId) {
      return alert("Enter assistant personId");
    }

    try {
      setLoading(true);
      setMessage("");

      const res = await api.get(
        `/assignment-workflow/assistant/assignments`,
        { params: { personId } }
      );

      setAssignments(res.data || []);
    } catch (err) {
      setMessage(
        err.response?.data?.message || "Failed to load assignments"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ================= SUBMIT TO QUALITY ================= */

  const submitAssignment = async (assignmentId) => {
    try {
      setMessage("Submitting assignment...");

      await api.post(
        `/assignment-workflow/assistant/assignments/${assignmentId}/submit`,
        { personId }
      );

      setMessage("✅ Submitted to quality team");
      fetchAssignments();
    } catch (err) {
      setMessage(err.response?.data?.message || "Submit failed");
    }
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 20, maxWidth: 1000 }}>
      <h2>🧪 Assistant Assignment Workflow</h2>

      {/* Assistant ID */}
      <div style={{ marginBottom: 20 }}>
        <label><strong>Assistant Person ID</strong></label><br />
        <input
          type="text"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          placeholder="Paste assistant personId here"
          style={{ width: "100%" }}
        />
        <button onClick={fetchAssignments} style={{ marginTop: 10 }}>
          Load My Assignments
        </button>
      </div>

      {loading && <p>Loading assignments...</p>}

      {assignments.length === 0 && !loading && (
        <p>No assignments found.</p>
      )}

      {assignments.map((a) => (
        <div
          key={a._id}
          style={{
            border: "1px solid #ccc",
            padding: 20,
            marginBottom: 20,
            borderRadius: 6,
          }}
        >
          <h3>{a.title}</h3>

          <p>
            <strong>Classroom:</strong>{" "}
            {a.classroomId?.name} ({a.classroomId?.section})
          </p>

          <p>
            <strong>Assignment Status:</strong>{" "}
            <span style={{ color: "#007bff" }}>{a.status}</span>
          </p>

          <p>
            <strong>Your Status:</strong>{" "}
            <span style={{ color: "#28a745" }}>
              {a.assistantStatus}
            </span>
          </p>

          <p>
            <strong>Your Deadline:</strong>{" "}
            {a.assistantDeadline
              ? new Date(a.assistantDeadline).toLocaleString()
              : "—"}
          </p>

          <p>
            <strong>Due Date:</strong>{" "}
            {a.dueDate
              ? new Date(a.dueDate).toLocaleString()
              : "—"}
          </p>

          {/* ================= QUALITY FEEDBACK ================= */}

          {a.status === "RECHECK_BY_ASSISTANT" &&
            a.qualityFeedback && (
              <div
                style={{
                  marginTop: 20,
                  padding: 15,
                  border: "1px solid #ff9800",
                  background: "#fff8e1",
                }}
              >
                <h4>📋 Quality Team Feedback</h4>

                {a.qualityFeedback.comment && (
                  <p>
                    <strong>Comment:</strong>{" "}
                    {a.qualityFeedback.comment}
                  </p>
                )}

                {a.qualityFeedback.items?.length > 0 && (
                  <table
                    className="sah-table--cards"
                    border="1"
                    cellPadding="6"
                    style={{
                      width: "100%",
                      marginTop: 10,
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Full Score</th>
                        <th>Selected</th>
                        <th>Awarded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.qualityFeedback.items.map(
                        (item, index) => (
                          <tr key={index}>
                            <td data-label="Item">{item.title}</td>
                            <td data-label="Full Score">{item.fullScore}</td>
                            <td data-label="Selected">{item.selected}</td>
                            <td data-label="Awarded">{item.awardedScore}</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                )}

                <p style={{ marginTop: 10 }}>
                  <strong>Total Score:</strong>{" "}
                  {a.qualityFeedback.totalScore}
                </p>

                {a.qualityFeedback.reviewedAt && (
                  <p style={{ fontSize: 12, color: "#666" }}>
                    Reviewed on{" "}
                    {new Date(
                      a.qualityFeedback.reviewedAt
                    ).toLocaleString()}
                  </p>
                )}
              </div>
            )}

          {/* ================= SUBMIT BUTTON ================= */}

          {(a.status === "ASSIGNED" ||
            a.status === "RECHECK_BY_ASSISTANT") && (
            <button
              style={{ marginTop: 15 }}
              onClick={() => submitAssignment(a._id)}
            >
              Submit to Quality Team
            </button>
          )}
        </div>
      ))}

      {message && (
        <div style={{ marginTop: 20 }}>
          <strong>{message}</strong>
        </div>
      )}
    </div>
  );
}
