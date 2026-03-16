import { useEffect, useState } from "react";
import api from "../api/api";

export default function QualityManagerClassroomAssignmentTest() {
  const [people, setPeople] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [message, setMessage] = useState("");

  // -----------------------------
  // Load people & classrooms
  // -----------------------------
  useEffect(() => {
    api.get("/people").then(res => setPeople(res.data));
    api.get("/classrooms").then(res => setClassrooms(res.data));
  }, []);

  // -----------------------------
  // Assign Quality Manager
  // -----------------------------
  const assignQualityManager = async () => {
    if (!selectedPerson || !selectedClassroom) {
      return setMessage("Select both Quality Manager and Classroom");
    }

    try {
      setMessage("Assigning...");

      await api.post("/classroom-quality-managers", {
        personId: selectedPerson._id,
        classroomId: selectedClassroom._id
      });

      setMessage("✅ Quality Manager assigned successfully");
    } catch (err) {
      setMessage(
        err.response?.data?.message || "❌ Assignment failed"
      );
    }
  };

  // -----------------------------
  // Filter Quality Managers only
  // -----------------------------
  const qualityManagers = people.filter(
    p => p.roleId?.name?.toLowerCase() === "quality manager"
  );
  return (
    <div style={{ padding: 20, maxWidth: 700 }}>
      <h2>Quality Manager → Classroom Assignment (TEST)</h2>

      {/* Quality Manager Selector */}
      <div style={{ marginBottom: 15 }}>
        <label>Quality Manager</label>
        <select
          onChange={e =>
            setSelectedPerson(
              qualityManagers.find(p => p._id === e.target.value)
            )
          }
        >
          <option value="">-- Select Quality Manager --</option>
          {qualityManagers.map(p => (
            <option key={p._id} value={p._id}>
              {p.name} ({p.email})
            </option>
          ))}
        </select>
      </div>

      {/* Classroom Selector */}
      <div style={{ marginBottom: 15 }}>
        <label>Classroom</label>
        <select
          onChange={e =>
            setSelectedClassroom(
              classrooms.find(c => c._id === e.target.value)
            )
          }
        >
          <option value="">-- Select Classroom --</option>
          {classrooms.map(c => (
            <option key={c._id} value={c._id}>
              {c.name} – {c.section}
            </option>
          ))}
        </select>
      </div>

      {/* Action */}
      <button onClick={assignQualityManager}>
        Assign Quality Manager
      </button>

      {/* Message */}
      {message && (
        <div style={{ marginTop: 15 }}>
          <strong>{message}</strong>
        </div>
      )}
    </div>
  );
}
