import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import "./ManagerDelegations.css";
import { usePagination } from "../../hooks/usePagination";
import usePersistedState from "../../hooks/usePersistedState";
import Pagination from "../../components/Pagination";

export default function ManagerDelegations() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState(null);
  const [delegations, setDelegations] = useState(null);
  // add pagination params state
  // const [assignmentParams, setAssignmentParams] = useState(null);
  // const [delegationParams, setDelegationParams] = useState(null);

  const [assistants, setAssistants] = useState([]);

  const [selectedClassroom, setSelectedClassroom] = usePersistedState("delegations:manager:classroom", null);
  const [selectedAssignment, setSelectedAssignment] = usePersistedState("delegations:manager:assignment", null);
  const [assistantDeadlines, setAssistantDeadlines] = useState({});
  const [loading, setLoading] = useState(false);
  const [alertingId, setAlertingId] = useState(null);

  /* ================= AUTH ================= */

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsed = JSON.parse(storedUser);
    if (parsed?.roleId?.name?.toLowerCase() !== "manager") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsed);
  }, [navigate]);

  /* ================= LOAD CLASSROOMS ================= */

  useEffect(() => {
    if (!user?.id) return;

    const loadClassrooms = async () => {
      const res = await api.get(
        `/classroom-managers?personId=${user.id}`,
        { params: { page: 1, limit: 5000 } }
      );

      const list = Array.isArray(res.data?.data)
        ? res.data.data.map((m) => m.classroomId)
        : [];

      setClassrooms(list);
    };

    loadClassrooms();
  }, [user?.id]);

  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    // setAssignments([]);
    // setDelegations([]);
    setDelegations(null);
    setAssignments({ classroomId: classroom._id });

    // const res = await api.get(
    //   `/assignments?classroomId=${classroom._id}`
    // );
      const {
        data: assignments,
        page: assignPage,
        totalPages: assignTotalPages,
        fetchPage: fetchAssignPage
      } = usePagination(
        "/assignments",
        assignments || {},
        10,
        "data",
        !!assignments
      );

    // setAssignments(res.data || []);
  };

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);
    setDelegations({ assignmentId: assignment._id });

const {
  data: delegations,
  page: delegPage,
  totalPages: delegTotalPages,
  fetchPage: fetchDelegPage
} = usePagination(
  "/assignment-delegations",
  delegations|| {},
  10,
  "data",
  !!delegations
);

    // setDelegations(res.data || []);

    const classroomRes = await api.get(
      `/classrooms/${selectedClassroom._id}`
    );

    const subjectId =
      typeof classroomRes.data.subjectId === "string"
        ? classroomRes.data.subjectId
        : classroomRes.data.subjectId?._id;

    const assistRes = await api.get(
      `/role-subject-assignments?subjectId=${subjectId}&role=assistant`
    );

    setAssistants(assistRes.data || []);
  };

  const assignAssistant = async (personId) => {
    try {
      const selectedDeadline = assistantDeadlines[personId];
      if (
        selectedDeadline &&
        new Date(selectedDeadline) <= new Date(selectedAssignment.dueDate)
      ) {
        toast.error(
          "Assistant deadline must be after assignment due date"
        );
        return;
      }
      setLoading(true);

      await api.post("/assignment-delegations", {
        assignmentId: selectedAssignment._id,
        personId,
        role: "assistant",
        assignedBy: user.id,
        assistantDeadline: assistantDeadlines[personId],
      });

      toast.success("Assistant assigned successfully");
      selectAssignment(selectedAssignment);
    } catch (err) {
      toast.error(err.response?.data?.message || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  const sendAlert = async (delegationId) => {
    try {
      setAlertingId(delegationId);
      await api.post(`/assignment-delegations/${delegationId}/send-alert`);
      toast.success("Alert sent");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send alert");
    } finally {
      setAlertingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="managerDel-page">
      <div className="managerDel-shell">

        <header className="managerDel-header">
          <h2>Assignment Delegations</h2>
          <button
            className="managerDel-back"
            onClick={() => navigate("/manager/dashboard")}
          >
            ← Back
          </button>
        </header>

        {/* CLASSROOM GRID */}
        <section>
          <h3>Select Classroom</h3>
          <div className="managerDel-grid">
            {classrooms.map((c) => (
              <div
                key={c._id}
                className={`managerDel-selectCard ${
                  selectedClassroom?._id === c._id ? "active" : ""
                }`}
                onClick={() => selectClassroom(c)}
              >
                <h4>{c.name}</h4>
                <span>{c.section}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ASSIGNMENT GRID */}
        {assignments.length > 0 && (
          <section>
            <h3>Select Assignment</h3>
            <div className="managerDel-grid">
              {assignments.map((a) => (
                <div
                  key={a._id}
                  className={`managerDel-selectCard ${
                    selectedAssignment?._id === a._id ? "active" : ""
                  }`}
                  onClick={() => selectAssignment(a)}
                >
                  <h4>{a.title}</h4>
                  <span>
                    Due:{" "}
                    {a.dueDate
                      ? new Date(a.dueDate).toLocaleDateString()
                      : "-"}
                  </span>
                </div>
              ))}
            </div>
            <Pagination page={assignPage} totalPages={assignTotalPages} onPageChange={fetchAssignPage} />
          </section>
        )}

        {/* MAIN PANEL */}
        {selectedAssignment && (
          <section className="managerDel-mainPanel">

            <h3>Assign Assistant</h3>

            {assistants.map((a) => (
              <div key={a.personId._id} className="managerDel-assistantCard">

                <div className="managerDel-assistantInfo">
                  {a.personId.name}
                </div>

                <input
                  type="datetime-local"
                  className="managerDel-dateInput"
                  value={assistantDeadlines[a.personId._id] || ""}
                  min={
                    selectedAssignment?.dueDate
                      ? new Date(selectedAssignment.dueDate)
                          .toISOString()
                          .slice(0, 16)
                      : undefined
                  }
                  onChange={(e) =>
                    setAssistantDeadlines((prev) => ({
                      ...prev,
                      [a.personId._id]: e.target.value,
                    }))
                  }
                />

                <button
                  className="managerDel-assignBtn"
                  disabled={loading}
                  onClick={() =>
                    assignAssistant(a.personId._id)
                  }
                >
                  Assign
                </button>
              </div>
            ))}

            <hr />

            <h3>Delegation History</h3>

            <div className="managerDel-history">
              {delegations.map((d) => {
                const isAssistant = d.role === "assistant";
                const deadline = isAssistant ? d.assistantDeadline : d.qualityDeadline;

                const isOverdue =
                  deadline && new Date(deadline) < new Date();

                return (
                  <div key={d._id} className="managerDel-historyItem">

                    <div className="managerDel-historyLeft">
                      <strong>{d.personId?.name}</strong> ({d.role})

                      {deadline && (
                        <div
                          className={`managerDel-deadline ${
                            isOverdue ? "overdue" : ""
                          }`}
                        >
                          Deadline: {new Date(deadline).toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div className={`status-badge status-${d.status}`}>
                      {d.status}
                    </div>

                    {isAssistant && (
                      <button
                        className="managerDel-assignBtn"
                        disabled={alertingId === d._id}
                        onClick={() => sendAlert(d._id)}
                      >
                        {alertingId === d._id ? "Alerting…" : "Alert Assistant"}
                      </button>
                    )}

                  </div>
                );
              })}
            </div>
<Pagination page={delegPage} totalPages={delegTotalPages} onPageChange={fetchDelegPage} />
          </section>
        )}

      </div>
    </div>
  );
}