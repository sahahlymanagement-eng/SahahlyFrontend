import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorQualityManagers.css";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

export default function DirectorQualityManagers() {
  const { data: classrooms, page, totalPages, fetchPage: fetchClassroomsPage } =
    usePagination("/classrooms", {}, 10);
  const [people, setPeople] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedManagers, setSelectedManagers] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadSupportData(); }, []);

  const loadSupportData = async () => {
    const [peopleRes, assignmentsRes] = await Promise.all([
      api.get("/people", { params: { page: 1, limit: 5000 } }),
      api.get("/classroom-quality-managers", { params: { page: 1, limit: 5000 } }),
    ]);

    const persons = peopleRes.data.data || [];
    const assigns = assignmentsRes.data || [];

    setPeople(persons);
    setAssignments(assigns);

    const map = {};
    assigns.forEach((a) => { map[a.classroomId?._id] = a.personId?._id; });
    setSelectedManagers(map);
  };

  const reload = async () => {
    await Promise.all([fetchClassroomsPage(page), loadSupportData()]);
  };

  const qualityManagers = people.filter(
    (p) => p.roleId?.name?.trim().toLowerCase() === "quality manager"
  );

  const hasManager = (classroomId) =>
    assignments.some((a) => a.classroomId?._id === classroomId);

  const assignManager = async (classroomId) => {
    const personId = selectedManagers[classroomId];
    if (!personId) return;
    try {
      setLoading(true);
      await api.post("/classroom-quality-managers", { personId, classroomId });
      await reload();
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
      await api.put("/classroom-quality-managers", { personId, classroomId });
      await reload();
    } catch {
      alert("Change failed");
    } finally {
      setLoading(false);
    }
  };

  const removeManager = async (classroomId) => {
    try {
      setLoading(true);
      await api.delete("/classroom-quality-managers", { data: { classroomId } });
      await reload();
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
      <h2 className="dm-title">Assign Quality Managers to Classrooms</h2>

      <div className="dm-table-box">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Current Quality Manager</th>
              <th>Select Quality Manager</th>
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
                      <option value="">Select Quality Manager</option>
                      {qualityManagers.map((m) => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </td>

                  <td className="dm-actions">
                    {!alreadyAssigned ? (
                      <button
                        className="dm-assign"
                        onClick={() => assignManager(room._id)}
                      >
                        Assign
                      </button>
                    ) : (
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

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchClassroomsPage} />

      {loading && <div className="dm-loading">Processing...</div>}
    </div>
  );
}
