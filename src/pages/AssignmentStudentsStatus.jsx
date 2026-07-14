import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import api from "../api/api";
import { usePagination } from "../hooks/usePagination";
import Pagination from "../components/Pagination";

export default function AssignmentStudentsStatus() {
  const { assignmentId } = useParams();

  const [error, setError] = useState("");

  const { data: students, page, totalPages, loading, fetchPage, extra } =
    usePagination(
      `/assignment-submissions/${assignmentId}/students`,
      {},
      10,
      "students",
      !!assignmentId
    );

  const maxGrade = extra.maxGrade ?? null;

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
      <h2>
        Assignment – Student Submission Status
          {maxGrade !== null && ` (Out of ${maxGrade})`}
      </h2>

      <hr />

      {loading && <p>⏳ Loading student submissions…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && students.length === 0 && (
        <p>No student submissions found.</p>
      )}

      {students.length > 0 && (
        <div className="sah-table-scroll">
        <table
          className="sah-table--cards"
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
                <td data-label="Student ID">{s.studentId}</td>

                <td data-label="Status">
                  {renderStatus(s.state, s.isLate, s.isOnTime)}
                </td>

                <td data-label="Submitted">
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleString()
                    : "—"}
                </td>

                <td data-label="Grade">
                  {s.assignedGrade !== null
                    ? `${s.assignedGrade} / ${maxGrade ?? "—"}`
                    : "—"}
                </td>

                <td data-label="Last update">
                  {s.updateTime
                    ? new Date(s.updateTime).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
    </div>
  );
}