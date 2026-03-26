import { useEffect, useState } from "react";
import api from "../api/api";
import "./ClassroomTeacherManager.css";
import {
  FiUsers,
  FiBookOpen,
  FiPhone,
  FiMail,
  FiUserCheck,
  FiLink,
  FiTrash2
} from "react-icons/fi";

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

      setClassrooms(classroomsRes.data || []);
      setTeachers(teachersRes.data || []);

      const initialSelections = {};
      (classroomsRes.data || []).forEach((c) => {
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
    <div className="ctmPage">
      <div className="ctmHeader">
        <div className="ctmHeaderLeft">
          <div className="ctmTitleWrap">
            <span className="ctmSectionDot" />
            <h2 className="ctmTitle">Classrooms & Teacher Assignment</h2>
          </div>
          <p className="ctmSubtitle">
            Assign or remove teachers for each classroom.
          </p>
        </div>

        <div className="ctmHeaderStats">
          <div className="ctmPill">
            <FiUsers size={13} />
            <span>{classrooms.length} classrooms</span>
          </div>

          <div className="ctmPill">
            <FiUserCheck size={13} />
            <span>{teachers.length} teachers</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="ctmLoadingCard">
          <p className="ctmLoadingText">Loading...</p>
        </div>
      ) : (
        <div className="ctmTableWrap">
          <table className="ctmTable">
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
                <tr key={classroom._id} className="ctmRow">
                  <td>
                    <span className="ctmCellPrimary">
                      {classroom.name || "-"}
                    </span>
                  </td>

                  <td>
                    <span className="ctmCellMuted">
                      {classroom.section || "-"}
                    </span>
                  </td>

                  <td>
                    <div className="ctmInlineCell">
                      <FiBookOpen className="ctmInlineIcon" size={14} />
                      <span className="ctmCellMuted">
                        {classroom.subjectId?.name || "-"}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className="ctmInlineCell">
                      <FiUsers className="ctmInlineIcon" size={14} />
                      <span className="ctmCellPrimary">
                        {classroom.teacherId?.name || "Not Assigned"}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className="ctmInlineCell">
                      <FiPhone className="ctmInlineIcon" size={14} />
                      <span className="ctmCellMuted">
                        {classroom.teacherId?.phone || "-"}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className="ctmInlineCell">
                      <FiMail className="ctmInlineIcon" size={14} />
                      <span className="ctmCellMuted">
                        {classroom.teacherId?.email || "-"}
                      </span>
                    </div>
                  </td>

                  <td>
                    <select
                      className="ctmTeacherSelect"
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
                    <div className="ctmActionButtons">
                      <button
                        className="ctmAssignBtn"
                        onClick={() => assignTeacher(classroom._id)}
                      >
                        <FiLink size={14} />
                        <span>Assign</span>
                      </button>

                      <button
                        className="ctmRemoveBtn"
                        onClick={() => removeTeacher(classroom._id)}
                      >
                        <FiTrash2 size={14} />
                        <span>Remove</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!classrooms.length && (
                <tr>
                  <td colSpan="8">
                    <div className="ctmEmptyState">
                      <FiUsers size={40} />
                      <p>No classrooms found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}