import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorClassroomManagers.css";

export default function DirectorManagers() {
  const [classrooms, setClassrooms] = useState([]);
  const [people, setPeople] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedManagers, setSelectedManagers] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [classroomsRes, peopleRes, assignmentsRes] = await Promise.all([
      api.get("/classrooms"),
      api.get("/people"),
      api.get("/classroom-managers"),
    ]);

    const rooms = classroomsRes.data || [];
    const persons = peopleRes.data || [];
    const assigns = assignmentsRes.data || [];

    setClassrooms(rooms);
    setPeople(persons);
    setAssignments(assigns);

    const map = {};
    assigns.forEach((a) => { map[a.classroomId?._id] = a.personId?._id; });
    setSelectedManagers(map);
  };

  const managers = people.filter(
    (p) => p.roleId?.name?.trim().toLowerCase() === "manager"
  );

  // Returns true if this classroom already has an assigned manager
  const hasManager = (classroomId) =>
    assignments.some((a) => a.classroomId?._id === classroomId);

  const assignManager = async (classroomId) => {
    const personId = selectedManagers[classroomId];
    if (!personId) return;
    try {
      setLoading(true);
      await api.post("/classroom-managers", { personId, classroomId });
      await loadData();
    } catch {
      alert("Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  const changeManager = async (classroomId) => {
    const personId = selectedManagers[classroomId];
    if (!personId) return;
    try {
      setLoading(true);
      await api.put("/classroom-managers", { personId, classroomId });
      await loadData();
    } catch {
      alert("Change failed");
    } finally {
      setLoading(false);
    }
  };

  const removeManager = async (classroomId) => {
    try {
      setLoading(true);
      await api.delete("/classroom-managers", { data: { classroomId } });
      await loadData();
    } catch {
      alert("Remove failed");
    } finally {
      setLoading(false);
    }
  };

  const managerName = (classroomId) => {
    const assignment = assignments.find((a) => a.classroomId?._id === classroomId);
    return assignment?.personId?.name || "None";
  };

  return (
    <div className="dm-page">
      <h2 className="dm-title">Assign Managers to Classrooms</h2>

      <div className="dm-table-box">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Current Manager</th>
              <th>Select Manager</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classrooms.map((room) => {
              const alreadyAssigned = hasManager(room._id);
              return (
                <tr key={room._id}>
                  <td>{room.name}{room.section && ` (${room.section})`}</td>
                  <td>{room.teacherName || room.teacherId?.name || "-"}</td>
                  <td className="dm-current">{managerName(room._id)}</td>

                  <td>
                    <select
                      className="dm-select"
                      value={selectedManagers[room._id] || ""}
                      onChange={(e) =>
                        setSelectedManagers((prev) => ({
                          ...prev,
                          [room._id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select Manager</option>
                      {managers.map((m) => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </td>

                  <td className="dm-actions">
                    {!alreadyAssigned ? (
                      // No manager yet — only show Assign
                      <button
                        className="dm-assign"
                        onClick={() => assignManager(room._id)}
                      >
                        Assign
                      </button>
                    ) : (
                      // Manager exists — show Change + Remove
                      <>
                        <button
                          className="dm-change"
                          onClick={() => changeManager(room._id)}
                        >
                          Change
                        </button>
                        <button
                          className="dm-remove"
                          onClick={() => removeManager(room._id)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <div className="dm-loading">Processing...</div>}
    </div>
  );
}