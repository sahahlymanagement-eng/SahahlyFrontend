import { useEffect, useState } from "react";
import api from "../api/api";

export default function QualityManagerAssignmentDelegationTest() {
  const [people, setPeople] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [qualityMembers, setQualityMembers] = useState([]);
  const [delegations, setDelegations] = useState([]);

  const [selectedQualityManager, setSelectedQualityManager] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  /* ================= LOAD PEOPLE ================= */

  useEffect(() => {
    api.get("/people").then(res => setPeople(res.data || []));
  }, []);

  const roleName = (role) =>
    role?.name?.trim().toLowerCase();

  /* ================= QUALITY MANAGER → CLASSROOMS ================= */

  const selectQualityManager = async (qm) => {
    setSelectedQualityManager(qm);
    setSelectedClassroom(null);
    setSelectedAssignment(null);
    setAssignments([]);
    setQualityMembers([]);
    setDelegations([]);

    const res = await api.get(
      `/classroom-quality-managers?personId=${qm._id}`
    );

    const list = Array.isArray(res.data)
      ? res.data.map(q => q.classroomId)
      : [];

    setClassrooms(list);
  };

  /* ================= CLASSROOM → ASSIGNMENTS + QUALITY TEAM ================= */

  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setAssignments([]);
    setDelegations([]);

    // 1️⃣ Load classroom to get subject
    const classroomRes = await api.get(`/classrooms/${classroom._id}`);
    const rawSubject = classroomRes.data.subjectId;
    const subjectId =
      typeof rawSubject === "string"
        ? rawSubject
        : rawSubject?._id;

    if (!subjectId) {
      alert("Classroom has no subject");
      return;
    }

    // 2️⃣ Load quality team for subject
    const qualityRes = await api.get(
      `/role-subject-assignments?subjectId=${subjectId}&role=quality team`
    );
    setQualityMembers(qualityRes.data || []);

    // 3️⃣ Load assignments
    const assignRes = await api.get(
      `/assignments?classroomId=${classroom._id}`
    );
    setAssignments(assignRes.data || []);
  };

  /* ================= ASSIGNMENT → DELEGATIONS ================= */

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);

    const res = await api.get(
      `/assignment-delegations?assignmentId=${assignment._id}`
    );
    setDelegations(res.data || []);
  };

  const assignQuality = async (personId) => {
    await api.post("/assignment-delegations", {
      assignmentId: selectedAssignment._id,
      personId,
      role: "quality team",
      assignedBy: selectedQualityManager._id,
    });

    const res = await api.get(
      `/assignment-delegations?assignmentId=${selectedAssignment._id}`
    );
    setDelegations(res.data || []);
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 30 }}>
      <h2>Quality Manager → Assignment Delegation (TEST)</h2>

      <h3>1️⃣ Select Quality Manager</h3>
      <ul>
        {people
          .filter(p => roleName(p.roleId) === "quality manager")
          .map(p => (
            <li key={p._id}>
              <button onClick={() => selectQualityManager(p)}>
                {p.name}
              </button>
            </li>
          ))}
      </ul>

      {classrooms.length > 0 && (
        <>
          <h3>2️⃣ Select Classroom</h3>
          <ul>
            {classrooms.map(c => (
              <li key={c._id}>
                <button onClick={() => selectClassroom(c)}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {assignments.length > 0 && (
        <>
          <h3>3️⃣ Select Assignment</h3>
          <ul>
            {assignments.map(a => (
              <li key={a._id}>
                <button onClick={() => selectAssignment(a)}>
                  {a.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedAssignment && (
        <>
          <h3>4️⃣ Assign Quality Team</h3>
          <ul>
            {qualityMembers.map(q => (
              <li key={q.personId._id}>
                {q.personId.name}
                <button
                  onClick={() => assignQuality(q.personId._id)}
                  style={{ marginLeft: 10 }}
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>

          <h4>Current Delegations</h4>
          <ul>
            {delegations.map(d => (
              <li key={d._id}>
                {d.personId.name} ({d.role})
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
