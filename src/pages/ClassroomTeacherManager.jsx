import { useEffect, useState } from "react";
import api from "../api/api";
import "./ClassroomTeacherManager.css";

export default function ClassroomTeacherManager() {
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedTeachers, setSelectedTeachers] = useState({});
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);

      const [classroomsRes, teachersRes] = await Promise.all([
        api.get("/classrooms"),
        api.get("/teachers"),
      ]);

      setClassrooms(classroomsRes.data);
      setTeachers(teachersRes.data);

      const initialSelections = {};
      classroomsRes.data.forEach((c) => {
        initialSelections[c._id] = c.teacherId?._id || "";
      });
      setSelectedTeachers(initialSelections);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTeacherChange = (classroomId, teacherId) => {
    setSelectedTeachers((prev) => ({
      ...prev,
      [classroomId]: teacherId,
    }));
  };

  const assignTeacher = async (classroomId) => {
    try {
      const teacherId = selectedTeachers[classroomId];

      if (!teacherId) {
        alert("Please select a teacher first");
        return;
      }

      await api.put(`/classrooms/${classroomId}/assign-teacher`, {
        teacherId,
      });

      await loadData();
      alert("Teacher assigned successfully");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to assign teacher");
    }
  };

  const removeTeacher = async (classroomId) => {
    try {
      await api.put(`/classrooms/${classroomId}/remove-teacher`);
      await loadData();
      alert("Teacher removed successfully");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to remove teacher");
    }
  };

  return (
    <div className="classroomTeacherPage">
      <div className="classroomTeacherContent">
        <h2 className="pageTitle">Classrooms & Teacher Assignment</h2>

        {loading ? (
          <p className="loadingText">Loading...</p>
        ) : (
          <div className="tableWrapper">
            <table className="classroomTable">
              <thead>
                <tr>
                  <th>Classroom Name</th>
                  <th>Section</th>
                  <th>Subject</th>
                  <th>Assigned Teacher</th>
                  <th>Teacher Phone</th>
                  <th>Teacher Email</th>
                  <th>Select Teacher</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {classrooms.map((classroom) => (
                  <tr key={classroom._id}>
                    <td>{classroom.name || "-"}</td>
                    <td>{classroom.section || "-"}</td>
                    <td>{classroom.subjectId?.name || "-"}</td>
                    <td>{classroom.teacherId?.name || "Not Assigned"}</td>
                    <td>{classroom.teacherId?.phone || "-"}</td>
                    <td>{classroom.teacherId?.email || "-"}</td>

                    <td>
                      <select
                        className="teacherSelect"
                        value={selectedTeachers[classroom._id] || ""}
                        onChange={(e) =>
                          handleTeacherChange(classroom._id, e.target.value)
                        }
                      >
                        <option value="">Select Teacher</option>
                        {teachers.map((teacher) => (
                          <option key={teacher._id} value={teacher._id}>
                            {teacher.name} - {teacher.phone}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <div className="actionButtons">
                        <button
                          className="assignBtn"
                          onClick={() => assignTeacher(classroom._id)}
                        >
                          Assign
                        </button>

                        <button
                          className="removeBtn"
                          onClick={() => removeTeacher(classroom._id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!classrooms.length && (
                  <tr>
                    <td colSpan="8" className="emptyRow">
                      No classrooms found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}