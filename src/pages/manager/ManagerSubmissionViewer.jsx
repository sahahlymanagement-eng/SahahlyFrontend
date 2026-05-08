import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import {
  FiUsers,
  FiClipboard,
  FiFileText,
  FiDownload,
  FiEye,
  FiCpu
} from "react-icons/fi";
import "./ManagerSubmissionViewer.css";

export default function ManagerSubmissionViewer() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const [students, setStudents] = useState([]);

  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return navigate("/login");

    const parsed = JSON.parse(storedUser);
    setUser(parsed);
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;

    api.get(`/students/my-classrooms?personId=${user.id}`)
      .then((res) => setClassrooms(res.data || []))
      .catch(() => toast.error("Failed to load classrooms"));
  }, [user]);

  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setStudents([]);
    setAssignments([]);

    setLoadingAssignments(true);

    try {
      const res = await api.get(
        `/manager-assignments/classroom/${classroom._id}/assignments`
      );

      setAssignments(res.data || []);
    } catch {
      toast.error("Failed to load assignments");
    } finally {
      setLoadingAssignments(false);
    }
  };

  const selectAssignment = async (assignment) => {
    setSelectedAssignment(assignment);
    setStudents([]);

    setLoadingStudents(true);

    try {
      const res = await api.get(
        `/manager-assignments/${assignment._id}/full`
      );

      setStudents(res.data.students || []);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
  };

  const openPdf = async (student) => {
    try {
      const response = await api.get(
        "/submission-files/pdf",
        {
          params: {
            assignmentId: selectedAssignment._id,
            submissionId: student.submissionId
          },
          responseType: "blob"
        }
      );

      const file = new Blob([response.data], {
        type: "application/pdf"
      });

      const url = URL.createObjectURL(file);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to load PDF");
    }
  };

  const downloadPdf = async (student) => {
    try {
      const response = await api.get(
        "/submission-files/pdf",
        {
          params: {
            assignmentId: selectedAssignment._id,
            submissionId: student.submissionId
          },
          responseType: "blob"
        }
      );

      const file = new Blob([response.data], {
        type: "application/pdf"
      });

      const url = URL.createObjectURL(file);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${student.name || "submission"}.pdf`;
      a.click();
    } catch {
      toast.error("Failed to download PDF");
    }
  };

  const filteredClassrooms = classrooms.filter((c) =>
    c.name.toLowerCase().includes(classroomSearch.toLowerCase())
  );

  const filteredAssignments = assignments.filter((a) =>
    a.title.toLowerCase().includes(assignmentSearch.toLowerCase())
  );

  return (
    <div className="msv-root">
      <main className="msv-main">

        <header className="msv-topbar">
          <h1>Submission Viewer</h1>
          <p>
            {selectedClassroom
              ? selectedAssignment
                ? `${selectedClassroom.name} — ${selectedAssignment.title}`
                : `Select assignment from ${selectedClassroom.name}`
              : "Select classroom"}
          </p>
        </header>

        <div className="msv-layout">

          {/* CLASSROOMS */}
          <div className="msv-column">
            <p className="msv-label">Classrooms</p>

            <input
              className="msv-search"
              placeholder="Search classrooms..."
              value={classroomSearch}
              onChange={(e) => setClassroomSearch(e.target.value)}
            />

            <div className="msv-scroll">
              {filteredClassrooms.map((c) => (
                <div
                  key={c._id}
                  className={`msv-card ${
                    selectedClassroom?._id === c._id ? "active" : ""
                  }`}
                  onClick={() => selectClassroom(c)}
                >
                  <FiUsers />
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ASSIGNMENTS */}
          <div className="msv-column">
            <p className="msv-label">Assignments</p>

            <input
              className="msv-search"
              placeholder="Search assignments..."
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
            />

            <div className="msv-scroll">
              {loadingAssignments ? (
                <p>Loading...</p>
              ) : (
                filteredAssignments.map((a) => (
                  <div
                    key={a._id}
                    className={`msv-card ${
                      selectedAssignment?._id === a._id ? "active" : ""
                    }`}
                    onClick={() => selectAssignment(a)}
                  >
                    <FiClipboard />
                    <span>{a.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* STUDENTS */}
          <div className="msv-right-panel">
            <p className="msv-label">Students</p>

            {loadingStudents ? (
              <p>Loading students...</p>
            ) : (
              <table className="msv-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Submitted At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s._id}>
                      <td>{s.name || "—"}</td>
                      <td>{s.state}</td>
                      <td>
                        {s.submittedAt
                          ? new Date(s.submittedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        {s.submissionId ? (
                          <div className="msv-actions">
                            <button onClick={() => openPdf(s)}>
                              <FiEye />
                            </button>
                            <button onClick={() => downloadPdf(s)}>
                              <FiDownload />
                            </button>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}