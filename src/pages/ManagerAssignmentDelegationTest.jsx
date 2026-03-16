import { useEffect, useState } from "react";
import api from "../api/api";

export default function ManagerAssignmentDelegationTest() {
  const [people, setPeople] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [assistants, setAssistants] = useState([]);
  const [qualityMembers, setQualityMembers] = useState([]);
  const [delegations, setDelegations] = useState([]);

  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const [assistantDeadlines, setAssistantDeadlines] = useState({});
  const [loading, setLoading] = useState(false);

  /* ================= LOAD BASE DATA ================= */

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    const res = await api.get("/people");
    setPeople(Array.isArray(res.data) ? res.data : []);
  };

  const roleName = (role) => role?.name?.trim().toLowerCase();

  /* ================= MANAGER ================= */

  const selectManager = async (manager) => {
    setSelectedManager(manager);
    resetSelection();

    const res = await api.get(
      `/classroom-managers?personId=${manager._id}`
    );

    const list = Array.isArray(res.data)
      ? res.data.map((m) => m.classroomId)
      : [];

    setClassrooms(list);
  };

  const resetSelection = () => {
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setAssignments([]);
    setAssistants([]);
    setQualityMembers([]);
    setDelegations([]);
  };

  /* ================= CLASSROOM ================= */

  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setAssignments([]);
    setDelegations([]);

    const classroomRes = await api.get(`/classrooms/${classroom._id}`);

    const rawSubject = classroomRes.data.subjectId;
    const subjectId =
      typeof rawSubject === "string"
        ? rawSubject
        : rawSubject?._id;

    if (!subjectId) return;

    const [assistRes, qualityRes] = await Promise.all([
      api.get(
        `/role-subject-assignments?subjectId=${subjectId}&role=assistant`
      ),
      api.get(
        `/role-subject-assignments?subjectId=${subjectId}&role=quality team`
      ),
    ]);

    setAssistants(assistRes.data || []);
    setQualityMembers(qualityRes.data || []);

    const assignmentRes = await api.get(
      `/assignments?classroomId=${classroom._id}`
    );

    setAssignments(assignmentRes.data || []);
  };

  /* ================= ASSIGNMENT ================= */

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);

    const res = await api.get(
      `/assignment-delegations?assignmentId=${assignment._id}`
    );

    const list = Array.isArray(res.data) ? res.data : [];
    setDelegations(list);

    const defaultDeadline = computeAssistantDefaultDeadline(
      assignment
    );

    const newDeadlines = {};
    assistants.forEach((a) => {
      newDeadlines[a.personId._id] = defaultDeadline;
    });

    setAssistantDeadlines(newDeadlines);
  };

  /* ================= HELPERS ================= */

  const formatLocalDateTime = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const computeAssistantDefaultDeadline = (assignment) => {
    if (!assignment?.dueDate) return "";

    const due = new Date(assignment.dueDate);
    const nextDay = new Date(due);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(23, 59, 0, 0);

    return formatLocalDateTime(nextDay);
  };

  const activeAssistant = delegations.find(
    (d) =>
      d.role === "assistant" &&
      ["ASSIGNED", "IN_REVIEW", "RECHECK_BY_ASSISTANT"].includes(
        d.status
      )
  );

  const hasActiveAssistant = !!activeAssistant;

  const isDeadlinePassed = activeAssistant
    ? new Date(activeAssistant.assistantDeadline) < new Date()
    : true;

  /* ================= ASSIGN ================= */

  const assignPerson = async (personId, role) => {
    try {
      setLoading(true);

      const payload = {
        assignmentId: selectedAssignment._id,
        personId,
        role,
        assignedBy: selectedManager._id,
      };

      if (role === "assistant") {
        payload.assistantDeadline =
          assistantDeadlines[personId];
      }

      await api.post("/assignment-delegations", payload);

      selectAssignment(selectedAssignment);
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          "Assignment failed"
      );
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 30 }}>
      <h2>Manager Assignment Delegation Panel</h2>

      {/* MANAGER */}
      <h3>Select Manager</h3>
      {people
        .filter((p) => roleName(p.roleId) === "manager")
        .map((p) => (
          <button
            key={p._id}
            onClick={() => selectManager(p)}
            style={{ marginRight: 10 }}
          >
            {p.name}
          </button>
        ))}

      {/* CLASSROOM */}
      {classrooms.length > 0 && (
        <>
          <h3>Select Classroom</h3>
          {classrooms.map((c) => (
            <button
              key={c._id}
              onClick={() => selectClassroom(c)}
              style={{ marginRight: 10 }}
            >
              {c.name}
            </button>
          ))}
        </>
      )}

      {/* ASSIGNMENT */}
      {assignments.length > 0 && (
        <>
          <h3>Select Assignment</h3>
          {assignments.map((a) => (
            <button
              key={a._id}
              onClick={() => selectAssignment(a)}
              style={{ marginRight: 10 }}
            >
              {a.title}
            </button>
          ))}
        </>
      )}

      {/* WORKFLOW SECTION */}
      {selectedAssignment && (
        <>
          <hr />

          <h3>Assistant Section</h3>

          {hasActiveAssistant && (
            <div style={{ marginBottom: 15 }}>
              <strong>Current Active Assistant:</strong>{" "}
              {activeAssistant.personId.name}
              <br />
              Deadline:{" "}
              {new Date(
                activeAssistant.assistantDeadline
              ).toLocaleString()}
              <br />
              Status:{" "}
              <span style={{ color: "orange" }}>
                {activeAssistant.status}
              </span>
            </div>
          )}

          {hasActiveAssistant && !isDeadlinePassed && (
            <p style={{ color: "red" }}>
              Cannot assign new assistant until current
              assistant deadline passes.
            </p>
          )}

          <ul>
            {assistants.map((a) => (
              <li key={a.personId._id}>
                {a.personId.name}
                <br />
                <input
                  type="datetime-local"
                  value={
                    assistantDeadlines[a.personId._id] || ""
                  }
                  onChange={(e) =>
                    setAssistantDeadlines((prev) => ({
                      ...prev,
                      [a.personId._id]: e.target.value,
                    }))
                  }
                />
                <button
                  disabled={
                    hasActiveAssistant && !isDeadlinePassed
                  }
                  onClick={() =>
                    assignPerson(
                      a.personId._id,
                      "assistant"
                    )
                  }
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>

          <hr />

          <h3>Delegation History</h3>

          <ul>
            {delegations.map((d) => (
              <li key={d._id}>
                {d.personId.name} ({d.role}) –{" "}
                <strong
                  style={{
                    color:
                      d.status === "FAILED_DEADLINE"
                        ? "red"
                        : d.status === "DONE"
                        ? "green"
                        : "orange",
                  }}
                >
                  {d.status}
                </strong>
                {d.assistantDeadline && (
                  <>
                    <br />
                    Deadline:{" "}
                    {new Date(
                      d.assistantDeadline
                    ).toLocaleString()}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {loading && <p>Processing...</p>}
    </div>
  );
}
