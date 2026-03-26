import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorSubjects.css";
import { toast } from "react-toastify";

import {
  FiBookOpen,
  FiSearch,
  FiPlus,
  FiSave,
  FiX,
  FiTrash2,
  FiFileText,
  FiCheckCircle
} from "react-icons/fi";

export default function DirectorSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [classrooms, setClassrooms] = useState([]);

  const [search, setSearch] = useState({});
  const [selected, setSelected] = useState({});

  const [subjectName, setSubjectName] = useState("");
  const [subjectDesc, setSubjectDesc] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const getTeacherName = (classroom) => {
    if (!classroom?.teacherId) return "No teacher";

    return (
      classroom.teacherId.fullName ||
      classroom.teacherId.name ||
      `${classroom.teacherId.firstName || ""} ${classroom.teacherId.lastName || ""}`.trim() ||
      "No teacher"
    );
  };

  const loadData = async () => {
    try {
      const [subjectsRes, classroomsRes] = await Promise.all([
        api.get("/subjects"),
        api.get("/classrooms")
      ]);

      const subs = (subjectsRes.data || []).filter((s) => s.isActive !== false);
      const rooms = classroomsRes.data || [];

      setSubjects(subs);
      setClassrooms(rooms);

      const map = {};

      subs.forEach((s) => {
        map[s._id] = rooms
          .filter((c) => c.subjectId?._id === s._id || c.subjectId === s._id)
          .map((c) => c._id);
      });

      setSelected(map);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to load data");
    }
  };

  const createSubject = async () => {
    if (!subjectName.trim()) return;

    try {
      setLoading(true);

      await api.post("/subjects", {
        name: subjectName,
        description: subjectDesc
      });

      setSubjectName("");
      setSubjectDesc("");

      await loadData();
      toast.success("Subject created successfully");
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to create subject");
    } finally {
      setLoading(false);
    }
  };

  const deleteSubject = (subjectId, subjectName) => {
    toast(
      ({ closeToast }) => (
        <div>
          <p style={{ margin: "0 0 10px" }}>
            Deactivate <strong>{subjectName}</strong>?
          </p>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={async () => {
                closeToast();
                try {
                  setLoading(true);
                  await api.delete(`/subjects/${subjectId}`);
                  toast.success("Subject deactivated successfully");
                  await loadData();
                } catch (err) {
                  toast.error(
                    err?.response?.data?.message || "Failed to deactivate subject"
                  );
                } finally {
                  setLoading(false);
                }
              }}
              style={{
                background: "#e53e3e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 14px",
                cursor: "pointer"
              }}
            >
              Confirm
            </button>

            <button
              onClick={closeToast}
              style={{
                background: "#eee",
                color: "#333",
                border: "none",
                borderRadius: "6px",
                padding: "6px 14px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ),
      { autoClose: false, closeOnClick: false, closeButton: false }
    );
  };

  const addClassroom = (subjectId, classroomId) => {
    setSelected((prev) => {
      const current = prev[subjectId] || [];

      if (current.includes(classroomId)) return prev;

      return {
        ...prev,
        [subjectId]: [...current, classroomId]
      };
    });
  };

  const removeClassroom = (subjectId, classroomId) => {
    setSelected((prev) => ({
      ...prev,
      [subjectId]: prev[subjectId].filter((id) => id !== classroomId)
    }));
  };

  const saveAssignments = async (subjectId) => {
    try {
      setLoading(true);

      const selectedRooms = selected[subjectId] || [];

      for (const room of classrooms) {
        const assigned =
          room.subjectId?._id === subjectId || room.subjectId === subjectId;

        const shouldAssign = selectedRooms.includes(room._id);

        if (!assigned && shouldAssign) {
          await api.patch(`/classrooms/${room._id}/assign-subject`, {
            subjectId
          });
        }
      }

      await loadData();
      toast.success("Assignments saved successfully");
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to save assignments");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="directorSubjectsPage">
      <div className="dsHeader">
        <div className="dsHeaderLeft">
          <div className="dsTitleWrap">
            <span className="dsSectionDot" />
            <h2 className="dsPageTitle">Subject Management</h2>
          </div>

          <p className="dsSubtitle">
            Create subjects and assign classrooms to each subject.
          </p>
        </div>

        <div className="dsHeaderStats">
          <div className="dsPill">
            <FiBookOpen size={13} />
            <span>{subjects.length} subjects</span>
          </div>

          <div className="dsPill">
            <FiCheckCircle size={13} />
            <span>{classrooms.length} classrooms</span>
          </div>
        </div>
      </div>

      <div className="dsCreateCard">
        <div className="dsInputWrap">
          <FiBookOpen className="dsInputIcon" size={15} />
          <input
            type="text"
            placeholder="Subject name"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
          />
        </div>

        <div className="dsInputWrap">
          <FiFileText className="dsInputIcon" size={15} />
          <input
            type="text"
            placeholder="Subject description"
            value={subjectDesc}
            onChange={(e) => setSubjectDesc(e.target.value)}
          />
        </div>

        <button className="dsCreateBtn" onClick={createSubject}>
          <FiPlus />
          Create Subject
        </button>
      </div>

      <div className="dsSubjectsGrid">
        {subjects.map((subject) => {
          const assigned = selected[subject._id] || [];

          const filtered = classrooms.filter((c) =>
            c.name?.toLowerCase().includes((search[subject._id] || "").toLowerCase())
          );

          return (
            <div className="dsSubjectCard" key={subject._id}>
              <div className="dsSubjectHeader">
                <div className="dsSubjectTitleWrap">
                  <div className="dsSubjectIconBox">
                    <FiBookOpen />
                  </div>

                  <div className="dsSubjectInfo">
                    <span className="dsSubjectTitle">{subject.name}</span>
                    <small className="dsSubjectDesc">
                      {subject.description || "No description"}
                    </small>
                  </div>
                </div>

                <button
                  className="dsDeleteBtn"
                  onClick={() => deleteSubject(subject._id, subject.name)}
                  title="Deactivate subject"
                >
                  <FiTrash2 size={15} />
                </button>
              </div>

              <div className="dsAssignedTags">
                {assigned.length > 0 ? (
                  assigned.map((id) => {
                    const room = classrooms.find((c) => c._id === id);
                    if (!room) return null;

                    return (
                      <div
                        key={id}
                        className="dsClassroomTag"
                        onClick={() => removeClassroom(subject._id, id)}
                        title="Click to remove"
                      >
                        <span>{room.name}</span>
                        <small>{getTeacherName(room)}</small>
                        <FiX size={12} />
                      </div>
                    );
                  })
                ) : (
                  <p className="dsEmptyAssigned">No classrooms assigned yet.</p>
                )}
              </div>

              <div className="dsSearchBox">
                <FiSearch className="dsSearchIcon" />
                <input
                  placeholder="Search classroom..."
                  value={search[subject._id] || ""}
                  onChange={(e) =>
                    setSearch((prev) => ({
                      ...prev,
                      [subject._id]: e.target.value
                    }))
                  }
                />
              </div>

              <div className="dsClassroomResults">
                {filtered.length > 0 ? (
                  filtered.map((c) => (
                    <div
                      key={c._id}
                      className="dsClassroomResult"
                      onClick={() => addClassroom(subject._id, c._id)}
                    >
                      <div className="dsResultLeft">
                        <div className="dsResultPlus">
                          <FiPlus size={13} />
                        </div>

                        <div className="dsResultInfo">
                          <span>{c.name}</span>
                          <small>{getTeacherName(c)}</small>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="dsNoResults">No classrooms found.</div>
                )}
              </div>

              <button
                className="dsSaveBtn"
                onClick={() => saveAssignments(subject._id)}
              >
                <FiSave />
                Save Assignments
              </button>
            </div>
          );
        })}
      </div>

      {loading && <p className="dsLoading">Processing...</p>}
    </div>
  );
}