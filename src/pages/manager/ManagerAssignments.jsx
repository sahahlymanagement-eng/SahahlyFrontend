import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./ManagerAssignments.css";

export default function ManagerAssignments() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [assignments, setAssignments] = useState([]);

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  /* AUTH */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsed = JSON.parse(storedUser);
    const role = parsed?.roleId?.name?.toLowerCase();

    if (role !== "manager" && role !== "quality manager") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsed);
  }, [navigate]);

  /* LOAD CLASSROOMS */
  useEffect(() => {
    if (!user?.id) return;

    api
      .get(`/students/my-classrooms?personId=${user.id}`)
      .then((res) => setClassrooms(res.data || []))
      .catch(() => toast.error("Failed to load classrooms"));
  }, [user?.id]);

  /* SELECT CLASSROOM */
  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedStudent(null);
    setAssignments([]);
    setStudents([]);

    setLoadingStudents(true);

    try {
      const res = await api.get(`/students/classroom/${classroom._id}`);
      setStudents(res.data || []);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
  };

  /* SELECT STUDENT */
  const selectStudent = async (student) => {
    setSelectedStudent(student);
    setAssignments([]);

    setLoadingAssignments(true);

    try {
      const res = await api.get(
        `/manager-assignments/student/${student._id}`
      );

      setAssignments(res.data || []);
    } catch {
      toast.error("Failed to load student assignments");
    } finally {
      setLoadingAssignments(false);
    }
  };

  const renderStatus = (a) => {
    if (a.isLate) {
      return <span className="badge badge-orange">Late</span>;
    }

    if (a.isOnTime) {
      return <span className="badge badge-green">On Time</span>;
    }

    if (a.state === "RETURNED") {
      return <span className="badge badge-blue">Returned</span>;
    }

    if (a.state === "NEW" || a.state === "CREATED") {
      return (
        <span className="badge badge-red">
          Not Turned In
        </span>
      );
    }

    return (
      <span className="badge badge-gray">
        {a.state || "Unknown"}
      </span>
    );
  };

  if (!user) return null;

  return (
    <div className="mgrAsgn-page">
      <div className="mgrAsgn-shell">

        <header className="mgrAsgn-header">
          <h2>Assignments Management</h2>
          <button
            className="mgrAsgn-back"
            onClick={() => navigate("/manager/dashboard")}
          >
            ← Back
          </button>
        </header>

        <div className="mgrAsgn-layout">

          {/* CLASSROOMS */}
          <div className="mgrAsgn-column">
            <h3>Classrooms</h3>

            <div className="mgrAsgn-list">
              {classrooms.map((c) => (
                <div
                  key={c._id}
                  className={`mgrAsgn-card ${
                    selectedClassroom?._id === c._id
                      ? "active"
                      : ""
                  }`}
                  onClick={() => selectClassroom(c)}
                >
                  <h4>{c.name}</h4>
                  <span>{c.section || "No section"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* STUDENTS */}
          <div className="mgrAsgn-column">
            <h3>Students</h3>

            {loadingStudents && (
              <p className="mgrAsgn-loading">
                Loading students...
              </p>
            )}

            {!loadingStudents && (
              <div className="mgrAsgn-list">
                {students.map((s) => (
                  <div
                    key={s._id}
                    className={`mgrAsgn-card ${
                      selectedStudent?._id === s._id
                        ? "active"
                        : ""
                    }`}
                    onClick={() => selectStudent(s)}
                  >
                    <h4>{s.name}</h4>
                    <span>{s.email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ASSIGNMENTS */}
          <div className="mgrAsgn-column mgrAsgn-wide">
            <h3>
              {selectedStudent
                ? `${selectedStudent.name}'s Assignments`
                : "Assignments"}
            </h3>

            {loadingAssignments && (
              <p className="mgrAsgn-loading">
                Loading assignments...
              </p>
            )}

            {!loadingAssignments &&
              assignments.length > 0 && (
                <div className="mgrAsgn-tableWrap">
                  <table className="mgrAsgn-table">
                    <thead>
                      <tr>
                        <th>Assignment</th>
                        <th>Status</th>
                        <th>Submitted At</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a._id}>
                          <td>{a.title}</td>
                          <td>{renderStatus(a)}</td>
                          <td>
                            {a.submittedAt
                              ? new Date(
                                  a.submittedAt
                                ).toLocaleString()
                              : "—"}
                          </td>
                          <td>
                            {a.assignedGrade ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            {!loadingAssignments &&
              selectedStudent &&
              assignments.length === 0 && (
                <p className="mgrAsgn-empty">
                  No assignments found
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}