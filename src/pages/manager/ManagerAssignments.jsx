import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./ManagerAssignments.css";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import {
  FiHome, FiClipboard, FiX, FiChevronRight,
  FiLogOut, FiMenu, FiUsers, FiSend,
  FiCheckSquare, FiCalendar, FiMessageSquare
} from "react-icons/fi";

import ManagerSidebar from "../../components/ManagerSidebar";


export default function ManagerAssignments() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [reportCart, setReportCart] = useState({});
  const [sending, setSending] = useState(false);

  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");

  const [customPhone, setCustomPhone] = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState("20");
  const [summaryMap, setSummaryMap] = useState({});
  const [summaryViewer, setSummaryViewer] = useState({ open: false, title: "", message: "" });

  /* AUTH */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) { navigate("/login", { replace: true }); return; }
    const parsed = JSON.parse(storedUser);
    const role = parsed?.roleId?.name?.toLowerCase();
    if (role !== "manager" && role !== "quality manager") {
      navigate("/login", { replace: true }); return;
    }
    setUser(parsed);
  }, [navigate]);

  /* LOAD CLASSROOMS */
  useEffect(() => {
    if (!user?.id) return;
    api.get(`/students/my-classrooms?personId=${user.id}`)
      .then(res => setClassrooms(res.data || []))
      .catch(() => toast.error("Failed to load classrooms"));
  }, [user?.id]);

  /* SELECT CLASSROOM */
  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setStudents([]);
    setAssignments([]);
    setReportCart({});
    setLoadingAssignments(true);
    try {
      const res = await api.get(`/manager-assignments/classroom/${classroom._id}/assignments`);
      setAssignments(res.data || []);
    } catch {
      toast.error("Failed to load assignments");
    } finally {
      setLoadingAssignments(false);
    }
  };

  /* SELECT ASSIGNMENT */
  const selectAssignment = async (assignment) => {
    if (selectedAssignment?._id === assignment._id) {
      setSelectedAssignment(null);
      setStudents([]);
      return;
    }
    setSelectedAssignment(assignment);
    setStudents([]);
    setSummaryMap({});
    setLoadingStudents(true);
    try {
      const res = await api.get(`/manager-assignments/${assignment._id}/full`);
      setStudents(res.data.students || []);
      setSummaryMap(res.data.summaryMap || {});
    } catch {
      toast.error("Failed to load student submissions");
    } finally {
      setLoadingStudents(false);
    }
  };

  /* CART */
  const toggleStudent = (student) => {
    if (!selectedAssignment) return;
    const asgId = selectedAssignment._id;
    const stuId = String(student._id);
    setReportCart(prev => {
      const next = { ...prev };
      if (!next[stuId]) {
        next[stuId] = { studentMeta: student, items: { [asgId]: buildItem(student) } };
      } else if (next[stuId].items[asgId]) {
        const updatedItems = { ...next[stuId].items };
        delete updatedItems[asgId];
        if (Object.keys(updatedItems).length === 0) delete next[stuId];
        else next[stuId] = { ...next[stuId], items: updatedItems };
      } else {
        next[stuId] = { ...next[stuId], items: { ...next[stuId].items, [asgId]: buildItem(student) } };
      }
      return next;
    });
  };

  const selectAllStudentsForAssignment = () => {
    if (!selectedAssignment || students.length === 0) return;

    const asgId = selectedAssignment._id;

    setReportCart((prev) => {
      const next = { ...prev };

      students.forEach((student) => {
        const stuId = String(student._id);

        if (!next[stuId]) {
          next[stuId] = {
            studentMeta: student,
            items: {
              [asgId]: buildItem(student),
            },
          };
        } else if (!next[stuId].items[asgId]) {
          next[stuId] = {
            ...next[stuId],
            items: {
              ...next[stuId].items,
              [asgId]: buildItem(student),
            },
          };
        }
      });

      return next;
    });

  };

  const buildItem = (student) => ({
    assignmentTitle: selectedAssignment.title,
    assignmentId: selectedAssignment._id,
    submissionId: student.submissionId || null,
    state: student.state,
    submittedAt: student.submittedAt,
    isLate: student.isLate,
    isOnTime: student.isOnTime,
    assignedGrade: student.assignedGrade,
    comment: student.summary || summaryMap[student.submissionId] || ""
  });

  const isStudentSelected = (studentId) =>
    !!(reportCart[String(studentId)]?.items[selectedAssignment?._id]);

  const setComment = (studentId, assignmentId, comment) => {
    setReportCart(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        items: {
          ...prev[studentId].items,
          [assignmentId]: { ...prev[studentId].items[assignmentId], comment }
        }
      }
    }));
  };

  /* SEND */
  const sendReport = async () => {
    const cartEntries = Object.entries(reportCart);
    if (cartEntries.length === 0) { toast.warn("No students selected"); return; }

    let freshSummaryMap = summaryMap;
    let freshStudents = students;
    try {
      const fresh = await api.get(`/manager-assignments/${selectedAssignment._id}/full`);
      freshSummaryMap = fresh.data.summaryMap || summaryMap;
      freshStudents = fresh.data.students || students;
      setSummaryMap(freshSummaryMap);
      setStudents(freshStudents);
    } catch {
      // use cached summaries if refresh fails
    }

    const studentById = Object.fromEntries(
      freshStudents.map((s) => [String(s._id), s])
    );

    const reports = cartEntries.map(([, entry]) => ({
      name: entry.studentMeta.name,
      phone: entry.studentMeta.phone,
      parentPhone: entry.studentMeta.parentPhone,
      items: Object.values(entry.items).map((item) => {
        const liveStudent = studentById[String(entry.studentMeta._id)] || entry.studentMeta;
        const submissionId = item.submissionId || liveStudent?.submissionId;
        const savedSummary =
          liveStudent?.summary ||
          (submissionId ? freshSummaryMap[submissionId] : "");
        return {
          ...item,
          assignmentId: item.assignmentId || selectedAssignment._id,
          submissionId,
          comment: (item.comment || savedSummary || "").trim()
        };
      })
    }));
    setSending(true);
    try {
      const res = await api.post("/manager-assignments/send-report", {
        reports,
        classroomId: selectedClassroom?._id
      });
      const summary = res.data.summary || [];
      const succeeded = summary.filter(r => r.status === "fulfilled").length;
      const failed = summary.filter(r => r.status === "rejected").length;
      toast.success(`✅ Sent to ${succeeded} student(s)${failed ? `, ${failed} failed` : ""}`);
      setReportCart({});
    } catch {
      toast.error("Failed to send reports");
    } finally {
      setSending(false);
    }
  };

  const clearAllSelections = () => {
    setReportCart({});
  };

  const cartCount = Object.keys(reportCart).length;
  const totalItems = Object.values(reportCart).reduce((acc, e) => acc + Object.keys(e.items).length, 0);

  const statusBadge = (student) => {
    if (student.state === "TURNED_IN" || student.state === "RETURNED") {
      if (student.isLate)   return <span className="ma-badge ma-badge--orange">Late</span>;
      if (student.isOnTime) return <span className="ma-badge ma-badge--green">On Time</span>;
      return <span className="ma-badge ma-badge--green">Submitted</span>;
    }
    if (student.state === "NEW" || student.state === "CREATED")
      return <span className="ma-badge ma-badge--red">Not Submitted</span>;
    return <span className="ma-badge ma-badge--gray">{student.state}</span>;
  };

  const filteredClassrooms = classrooms.filter((c) =>
    `${c.name} ${c.section || ""}`
      .toLowerCase()
      .includes(classroomSearch.toLowerCase())
  );

  const filteredAssignments = assignments.filter((a) =>
    a.title.toLowerCase().includes(assignmentSearch.toLowerCase())
  );


  const sendTeacherCollectiveReport = async () => {
    const cartEntries = Object.entries(reportCart);

    if (cartEntries.length === 0) {
      toast.warn("No students selected");
      return;
    }

    const reports = cartEntries.map(([, entry]) => ({
      name: entry.studentMeta.name,
      items: Object.values(entry.items)
    }));

    setSending(true);

    try {
      await api.post(
        "/manager-assignments/send-teacher-collective-report",
        {
          reports,
          classroomId: selectedClassroom?._id
        }
      );

      toast.success("Teacher collective report sent");
    } catch {
      toast.error("Failed to send teacher report");
    } finally {
      setSending(false);
    }
  };

  const sendCustomCollectiveReport = async () => {
    const cartEntries = Object.entries(reportCart);

    if (cartEntries.length === 0) {
      toast.warn("No students selected");
      return;
    }

    if (!customPhone.trim()) {
      toast.warn("Enter phone number");
      return;
    }

    const reports = cartEntries.map(([, entry]) => ({
      name: entry.studentMeta.name,
      items: Object.values(entry.items)
    }));

    setSending(true);

    try {
      await api.post(
        "/manager-assignments/send-custom-collective-report",
        {
          reports,
          classroomId: selectedClassroom?._id,
          phone: customPhone
        }
      );

      toast.success("Custom report sent");
    } catch {
      toast.error("Failed to send custom report");
    } finally {
      setSending(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  const navItems = [
    { icon: <FiHome />, label: "Dashboard", path: "/manager/dashboard" },
    { icon: <FiUsers />, label: "Students", path: "/manager/students" },
    { icon: <FiClipboard />, label: "Assignments / Reports ", active: true },
  ];

  return (
    <div className="ma-root">

    <ManagerSidebar />
    

      {/* MAIN */}
      <main className="ma-main">

        {/* TOPBAR */}
        <header className="ma-topbar">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">Assignments</h1>
            <span className="ma-topbar-sub">
              {selectedClassroom
                ? selectedAssignment
                  ? `${selectedClassroom.name} — ${selectedAssignment.title}`
                  : `Select an assignment from ${selectedClassroom.name}`
                : `Welcome back, ${user.name}`}
            </span>
          </div>
          {cartCount > 0 && (
            <div className="ma-topbar-right">
              <div className="ma-cart-pill">
                <FiCheckSquare size={13} />
                <span>{cartCount} student{cartCount !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""}</span>
              </div>
              <button className="ma-send-btn" onClick={sendReport} disabled={sending}>
                <FiSend size={13} />
                {sending ? "Sending…" : `Send Report`}
              </button>
              <button
                className="ma-send-btn"
                onClick={sendTeacherCollectiveReport}
                disabled={sending}
              >
                <FiSend size={13} />
                {sending ? "Sending…" : "Send Teacher Collective Report"}
              </button>
              <div style={{ minWidth: "260px" }}>
                <PhoneInput
                  defaultCountry="eg"
                  value={`+${customPhone}`}
                  onChange={(value) =>
                    setCustomPhone(value.replace(/\D/g, ""))
                  }
                  className="tm-phone-input"
                  countrySelectorStyleProps={{
                    dropdownStyleProps: {
                      style: {
                        maxHeight: "350px",
                        zIndex: 9999
                      }
                    }
                  }}
                />
              </div>
              <button
                className="ma-send-btn"
                onClick={sendCustomCollectiveReport}
                disabled={sending}
              >
                <FiSend size={13} />
                {sending ? "Sending…" : "Send Custom Collective Report"}
              </button>
            </div>
          )}
        </header>

        <div className="ma-content">
          <div className="ma-layout">
          {/* COLUMN 1 — CLASSROOMS */}
          <div className="ma-column">
            <p className="ma-section-label">Classrooms</p>

            <input
              className="ma-search-input"
              placeholder="Search classrooms..."
              value={classroomSearch}
              onChange={(e) => setClassroomSearch(e.target.value)}
            />

            <div className="ma-scroll-list">
              {filteredClassrooms.map(c => (
                <div
                  key={c._id}
                  className={`ma-classroom-card ${
                    selectedClassroom?._id === c._id
                      ? "ma-classroom-card--active"
                      : ""
                  }`}
                  onClick={() => selectClassroom(c)}
                >
                  <div className="ma-classroom-icon">
                    <FiUsers size={15} />
                  </div>
                  <div className="ma-classroom-info">
                    <span className="ma-classroom-name">{c.name}</span>
                    {c.section && (
                      <span className="ma-classroom-section">{c.section}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 2 — ASSIGNMENTS */}
          <div className="ma-column">
            <p className="ma-section-label">Assignments</p>

            <input
              className="ma-search-input"
              placeholder="Search assignments..."
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
              disabled={!selectedClassroom}
            />

            <div className="ma-scroll-list">
              {!selectedClassroom ? (
                <p className="ma-empty-msg">Select classroom first</p>
              ) : (
                filteredAssignments.map(a => (
                  <div
                    key={a._id}
                    className={`ma-assignment-card ${
                      selectedAssignment?._id === a._id
                        ? "ma-assignment-card--active"
                        : ""
                    }`}
                    onClick={() => selectAssignment(a)}
                  >
                    <div className="ma-assignment-icon">
                      <FiClipboard size={14} />
                    </div>
                    <div className="ma-assignment-info">
                      <span className="ma-assignment-title">{a.title}</span>
                      {a.dueDate && (
                        <span className="ma-assignment-due">
                          <FiCalendar size={10} />
                          {new Date(a.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COLUMN 3 — STUDENTS */}
          <div className="ma-right-panel">
            {!selectedAssignment ? (
              <div className="ma-empty-state">
                <FiClipboard size={40} />
                <p>Select assignment to view students</p>
              </div>
            ) : (
              <div className="ma-panel">
                <div className="ma-panel-header">
                  <div className="ma-panel-title-wrap">
                    <div className="ma-panel-dot" />
                    <h2 className="ma-panel-title">{selectedAssignment.title}</h2>
                    <span className="ma-panel-count">{students.length} students</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="ma-send-btn"
                    onClick={selectAllStudentsForAssignment}
                    disabled={students.length === 0}
                  >
                    Select All
                  </button>

                  <button
                    className="ma-send-btn"
                    onClick={clearAllSelections}
                    disabled={cartCount === 0}
                  >
                    Clear All
                  </button>
                </div>
                  {cartCount > 0 && (
                    <span className="ma-panel-hint">
                      <FiCheckSquare size={12} /> {cartCount} selected for report
                    </span>
                  )}
                </div>

                {loadingStudents && <p className="ma-loading-msg">Loading students…</p>}

                {!loadingStudents && students.length === 0 && (
                  <p className="ma-empty-msg">No students found.</p>
                )}

                {!loadingStudents && students.length > 0 && (
                  <div className="ma-table-wrap">
                    <div className="ma-table-scroll">
                      <table className="ma-table">
                        <thead>
                          <tr>
                            <th style={{ width: 44 }}></th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Submitted At</th>
                            <th>Grade</th>
                            <th>Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((s, i) => {
                            const selected = isStudentSelected(s._id);
                            const stuId = String(s._id);
                            const asgId = selectedAssignment._id;
                            return (
                              <tr
                                key={s._id}
                                className={`ma-row ${selected ? "ma-row--selected" : ""}`}
                                style={{ animationDelay: `${i * 0.025}s` }}
                                onClick={() => toggleStudent(s)}
                              >
                                <td>
                                  <div className={`ma-check ${selected ? "ma-check--on" : ""}`}>
                                    {selected && "✓"}
                                  </div>
                                </td>
                                <td>
                                  <div className="ma-avatar-cell">
                                    <div className="ma-avatar">
                                      {(s.name || s.email || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <span className="ma-cell-name">{s.name || <span className="ma-cell-empty">—</span>}</span>
                                  </div>
                                </td>
                                <td><span className="ma-cell-muted">{s.email || "—"}</span></td>
                                <td>{statusBadge(s)}</td>
                                <td>
                                  <span className="ma-cell-muted">
                                    {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                                  </span>
                                </td>
                                <td>
                                  {s.assignedGrade != null
                                    ? <span className="ma-grade-pill">{s.assignedGrade}</span>
                                    : <span className="ma-cell-empty">—</span>}
                                </td>
                                <td onClick={e => e.stopPropagation()}>
                                  {selected ? (
                                    <div className="ma-comment-wrap">
                                      <FiMessageSquare size={12} className="ma-comment-icon" />
                                      <input
                                        className="ma-comment-input"
                                        placeholder="Add comment…"
                                        value={reportCart[stuId]?.items[asgId]?.comment || ""}
                                        onChange={e => setComment(stuId, asgId, e.target.value)}
                                      />
                                    </div>
                                  ) : (s.summary || summaryMap[s.submissionId]) ? (
                                    <button
                                      className="msv-action-btn msv-action-btn--view"
                                      title="View Summary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSummaryViewer({
                                          open: true,
                                          title: `Summary – ${s.name}`,
                                          message: s.summary || summaryMap[s.submissionId]
                                        });
                                      }}
                                    >
                                      View Summary
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        {/* CART BAR */}
        {cartCount > 0 && (
          <div className="ma-cart-bar">
            <div className="ma-cart-bar-left">
              <span className="ma-cart-label">📋 Report Ready</span>
              <span className="ma-cart-stats">{cartCount} student{cartCount !== 1 ? "s" : ""} · {totalItems} assignment{totalItems !== 1 ? "s" : ""}</span>
            </div>
            <div className="ma-cart-students">
              {Object.values(reportCart).map(entry => (
                <div key={entry.studentMeta._id} className="ma-cart-chip">
                  <div className="ma-cart-chip-avatar">
                    {entry.studentMeta.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="ma-cart-chip-info">
                    <strong>{entry.studentMeta.name}</strong>
                    <span>{Object.values(entry.items).map(i => i.assignmentTitle).join(", ")}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="ma-cart-send-btn" onClick={sendReport} disabled={sending}>
              <FiSend size={14} />
              {sending ? "Sending…" : `Send to ${cartCount} Student${cartCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {summaryViewer.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onClick={() =>
              setSummaryViewer({
                open: false,
                title: "",
                message: ""
              })
            }
          >
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 14,
                padding: 24,
                width: "min(520px, 90vw)",
                border: "1px solid rgba(139,92,246,0.3)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: "#fff",
                    fontSize: 15
                  }}
                >
                  {summaryViewer.title}
                </span>

                <button
                  onClick={() =>
                    setSummaryViewer({
                      open: false,
                      title: "",
                      message: ""
                    })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    fontSize: 18
                  }}
                >
                  ✕
                </button>
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.7,
                  margin: 0
                }}
              >
                {summaryViewer.message}
              </p>
            </div>
          </div>
)}

      </main>
    </div>
  );
}