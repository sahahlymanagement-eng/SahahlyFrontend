import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import Select from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./ManagerDashboard.css";
import {
  FiHome, FiList, FiBarChart2, FiMenu, FiX,
  FiLogOut, FiSearch, FiCalendar, FiChevronRight,
  FiUser, FiUsers, FiBookOpen, FiClock, FiCheckCircle,
  FiAlertTriangle, FiZap
} from "react-icons/fi";

const ALL_STATUSES = [
  "UNASSIGNED","ASSIGNED","IN_REVIEW","RECHECK_BY_ASSISTANT",
  "IN_REVIEW_AFTER_RECHECK","EMERGENCY","DONE","DONE_BY_QUALITY","DONE_BY_QUALITY_LATE","FAILED_DEADLINE"
];

const STATUS_META = {
  UNASSIGNED:               { icon: <FiClock />,        accent: "#64748b" },
  ASSIGNED:                 { icon: <FiUser />,          accent: "#2563eb" },
  IN_REVIEW:                { icon: <FiSearch />,        accent: "#0ea5e9" },
  RECHECK_BY_ASSISTANT:     { icon: <FiAlertTriangle />, accent: "#f59e0b" },
  IN_REVIEW_AFTER_RECHECK:  { icon: <FiSearch />,        accent: "#8b5cf6" },
  EMERGENCY:                { icon: <FiZap />,           accent: "#ef4444" },
  DONE:                     { icon: <FiCheckCircle />,   accent: "#22c55e" },
  DONE_BY_QUALITY:          { icon: <FiCheckCircle />,   accent: "#10b981" },
  DONE_BY_QUALITY_LATE:     { icon: <FiAlertTriangle />, accent: "#f97316" },
   FAILED_DEADLINE:         { icon: <FiAlertTriangle />, accent: "#dc2626" },
};

const formatStatus = (s) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

export default function ManagerDashboard() {
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [assistantsMap, setAssistantsMap] = useState({});
  const [statusCounts, setStatusCounts] = useState({});
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedAssistants, setSelectedAssistants] = useState({});
  const [deadlines, setDeadlines] = useState({});
  const [filterDate, setFilterDate] = useState(null);
  const [filterClassroom, setFilterClassroom] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterAssignment, setFilterAssignment] = useState("");
  const [filterAssistant, setFilterAssistant] = useState("");
  const [filterQuality, setFilterQuality] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) { navigate("/login", { replace: true }); return; }
    const parsed = JSON.parse(storedUser);
    if (parsed?.roleId?.name?.toLowerCase() !== "manager") { navigate("/login", { replace: true }); return; }
    setUser(parsed);
  }, [navigate]);

  useEffect(() => { if (!user?.id) return; loadDashboard(); }, [user]);

  const computeDashboardStatus = (a) => {
    if (a.status === "UNASSIGNED" && a.assignedAssistantId) return "ASSIGNED";
    return a.status || "UNASSIGNED";
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const classroomsRes = await api.get("/classrooms");
      const teacherMap = {};
      const classroomSubjectMap = {};
      classroomsRes.data.forEach((c) => {
        teacherMap[c._id] = c.teacherId?.name || "Not Assigned";
        classroomSubjectMap[c._id] = typeof c.subjectId === "string" ? c.subjectId : c.subjectId?._id || null;
      });

      const classroomManagersRes = await api.get(`/classroom-managers?personId=${user.id}`);
      const classroomMap = {};
      classroomManagersRes.data.forEach((m) => { if (m.classroomId?._id) classroomMap[m.classroomId._id] = m.classroomId.name; });
      const classroomIds = classroomManagersRes.data.map((m) => m.classroomId?._id).filter(Boolean);

      if (!classroomIds.length) {
        setAssignments([]); setDelegations([]); setAssistantsMap({});
        const e = {}; ALL_STATUSES.forEach((s) => { e[s] = 0; }); setStatusCounts(e);
        return;
      }

      const assignmentsRes = await api.get(`/assignments/by-classrooms?classroomIds=${classroomIds.join(",")}`);
      let allAssignments = (assignmentsRes.data || []).map((a) => ({
        ...a,
        classroomName: classroomMap[a.classroomId] || "Unknown",
        teacherName: teacherMap[a.classroomId] || "Not Assigned",
        dashboardStatus: computeDashboardStatus(a),
      }));
      setAssignments(allAssignments);

      const assignmentIds = allAssignments.map((a) => a._id).filter(Boolean);
      let allDelegations = [];
      if (assignmentIds.length) {
        const delRes = await api.post("/assignment-delegations/by-assignments", { assignmentIds });
        allDelegations = delRes.data || [];
      }
      setDelegations(allDelegations);

      const counts = {}; ALL_STATUSES.forEach((s) => { counts[s] = 0; });
      allAssignments.forEach((a) => { counts[a.dashboardStatus] = (counts[a.dashboardStatus] || 0) + 1; });
      setStatusCounts(counts);

      const uniqueSubjectIds = [...new Set(allAssignments.map((a) => classroomSubjectMap[a.classroomId]).filter(Boolean))];
      const subjectAssistantsMap = {};
      await Promise.all(uniqueSubjectIds.map(async (subjectId) => {
        const res = await api.get(`/role-subject-assignments?subjectId=${subjectId}&role=assistant`);
        subjectAssistantsMap[subjectId] = res.data || [];
      }));

      const assistantsTemp = {};
      allAssignments.forEach((a) => {
        const subjectId = classroomSubjectMap[a.classroomId];
        assistantsTemp[a._id] = subjectId ? (subjectAssistantsMap[subjectId] || []) : [];
      });
      setAssistantsMap(assistantsTemp);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const assignAssistant = async (assignmentId) => {
    try {
      const sel = selectedAssistants[assignmentId];
      const deadline = deadlines[assignmentId];
      if (!sel?.value) { toast.error("Please select an assistant"); return; }
      if (!deadline)   { toast.error("Please select a deadline"); return; }
      await api.post("/assignment-delegations", {
        assignmentId, personId: sel.value, role: "assistant", assignedBy: user.id, assistantDeadline: deadline,
      });
      toast.success("Assistant assigned successfully");
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to assign assistant");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const customSelectStyles = {
    control: (base) => ({ ...base, backgroundColor: "#060f2e", borderColor: "rgba(255,255,255,0.12)", color: "white", minWidth: "180px", boxShadow: "none", borderRadius: "10px", fontSize: "13px" }),
    singleValue: (base) => ({ ...base, color: "white" }),
    input: (base) => ({ ...base, color: "white" }),
    placeholder: (base) => ({ ...base, color: "rgba(255,255,255,0.4)" }),
    menu: (base) => ({ ...base, backgroundColor: "#060f2e", zIndex: 50, border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px" }),
    option: (base, state) => ({ ...base, backgroundColor: state.isFocused ? "#0d2b63" : "#060f2e", color: "white", cursor: "pointer", fontSize: "13px" }),
  };

  const navItems = [
    { icon: <FiHome />, label: "Dashboard", active: true },
    { icon: <FiList />, label: "Delegations" },
    { icon: <FiBarChart2 />, label: "Reports" },
  ];

  if (!user) return null;

  const totalAssignments = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const changeAssistant = async (assignmentId) => {
  try {
    const sel = selectedAssistants[assignmentId];
    if (!sel?.value) { toast.error("Please select a new assistant"); return; }
    await api.put("/assignment-delegations/change-assistant", {
      assignmentId,
      newPersonId: sel.value,
      assignedBy: user.id,
      assistantDeadline: deadlines[assignmentId] || undefined,
    });
    toast.success("Assistant changed successfully");
    loadDashboard();
  } catch (err) {
    toast.error(err.response?.data?.message || "Failed to change assistant");
  }
};

const removeAssistant = async (assignmentId) => {
  if (!window.confirm("Remove assistant (and quality team if assigned)? Task will become UNASSIGNED.")) return;
  try {
    await api.delete("/assignment-delegations/remove-assistant", {
      data: { assignmentId, assignedBy: user.id },
    });
    toast.success("Assistant removed. Task is now UNASSIGNED.");
    loadDashboard();
  } catch (err) {
    toast.error(err.response?.data?.message || "Failed to remove assistant");
  }
};

  return (
    <div className="md-root">

      {/* SIDEBAR */}
      <aside className={`md-sidebar ${sidebarCollapsed ? "md-sidebar--collapsed" : ""}`}>
        <div className="md-sidebar-top">
          <div className="md-sidebar-brand">
            {!sidebarCollapsed && <span className="md-brand-text">Manager</span>}
            <button className="md-sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              {sidebarCollapsed ? <FiMenu size={18} /> : <FiX size={18} />}
            </button>
          </div>

          {!sidebarCollapsed && (
            <div className="md-user-card">
              <div className="md-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
              <div className="md-user-info">
                <span className="md-user-name">{user.name}</span>
                <span className="md-user-role">Manager</span>
              </div>
            </div>
          )}

          {sidebarCollapsed && (
            <div className="md-user-avatar md-user-avatar--solo">{user.name?.charAt(0).toUpperCase()}</div>
          )}
        </div>

        <nav className="md-sidebar-nav">
          {navItems.map((item) => (
            <div key={item.label} className={`md-nav-item ${item.active ? "md-nav-item--active" : ""}`}>
              <span className="md-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="md-nav-label">{item.label}</span>}
              {!sidebarCollapsed && item.active && <FiChevronRight className="md-nav-arrow" size={14} />}
            </div>
          ))}
        </nav>

        <div className="md-sidebar-bottom">
          <button className="md-logout-btn" onClick={handleLogout}>
            <FiLogOut size={16} />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="md-main">

        {/* TOP BAR */}
        <header className="md-topbar">
          <div className="md-topbar-left">
            <h1 className="md-topbar-title">Dashboard</h1>
            <span className="md-topbar-sub">Welcome back, {user.name}</span>
          </div>
          <div className="md-topbar-right">
            <div className="md-total-pill">
              <FiBookOpen size={13} />
              <span>{totalAssignments} assignments</span>
            </div>
          </div>
        </header>

        <div className="md-content">

          {/* STATUS GRID */}
          <div className="md-status-grid">
            {ALL_STATUSES.map((status, i) => {
              const meta = STATUS_META[status];
              const isActive = selectedStatus === status;
              const count = statusCounts[status] || 0;
              return (
                <button
                  key={status}
                  className={`md-status-card ${isActive ? "md-status-card--active" : ""}`}
                  style={{ "--accent": meta.accent, animationDelay: `${i * 0.05}s` }}
                  onClick={() => setSelectedStatus(isActive ? null : status)}
                >
                  <div className="md-status-icon" style={{ color: meta.accent, background: `${meta.accent}18` }}>
                    {meta.icon}
                  </div>
                  <div className="md-status-count">{count}</div>
                  <div className="md-status-label">{formatStatus(status)}</div>
                  {isActive && <div className="md-status-active-dot" />}
                </button>
              );
            })}
          </div>

          {/* ASSIGNMENT SECTION */}
          {selectedStatus && (
            <div className="md-section">
              <div className="md-section-header">
                <div className="md-section-title-wrap">
                  <span className="md-section-dot" style={{ background: STATUS_META[selectedStatus]?.accent }} />
                  <h2 className="md-section-title">{formatStatus(selectedStatus)}</h2>
                  <span className="md-section-count">{statusCounts[selectedStatus] || 0}</span>
                </div>
              </div>

              {/* FILTERS */}
              <div className="md-filters">
                {[
                  { placeholder: "Classroom", value: filterClassroom, set: setFilterClassroom },
                  { placeholder: "Teacher",   value: filterTeacher,   set: setFilterTeacher },
                  { placeholder: "Assignment",value: filterAssignment, set: setFilterAssignment },
                  { placeholder: "Assistant", value: filterAssistant,  set: setFilterAssistant },
                  { placeholder: "Quality",   value: filterQuality,    set: setFilterQuality },
                ].map(({ placeholder, value, set }) => (
                  <div className="md-filter-wrap" key={placeholder}>
                    <FiSearch className="md-filter-icon" size={13} />
                    <input
                      className="md-filter-input"
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    />
                  </div>
                ))}

                <div className="md-filter-wrap md-filter-wrap--date">
                  <FiCalendar className="md-filter-icon" size={13} />
                  <DatePicker
                    selected={filterDate}
                    onChange={(date) => setFilterDate(date)}
                    dateFormat="yyyy-MM-dd"
                    className="md-datepicker-input"
                    placeholderText="Filter by date"
                    isClearable
                    portalId="root"
                  />
                </div>
              </div>

              {/* TABLE */}
              <div className="md-table-wrap">
                {loading ? (
                  <div className="md-loading">
                    <div className="md-spinner" />
                    <span>Loading…</span>
                  </div>
                ) : (
                  <table className="md-table">
                    <thead>
                      <tr>
                        <th>Classroom</th>
                        <th>Teacher</th>
                        <th>Assignment</th>
                        <th>Assistant(s)</th>
                        <th>Deadline</th>
                        <th>Quality Team</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments
                        .filter((a) => {
                          if (a.dashboardStatus !== selectedStatus) return false;
                          const related = delegations.filter((d) => d.assignmentId === a._id || d.assignmentId?._id === a._id);
                          const assistants = related.filter((d) => d.role === "assistant").map((d) => d.personId?.name?.toLowerCase() || "");
                          const qualityTeam = related.filter((d) => d.role === "quality team").map((d) => d.personId?.name?.toLowerCase() || "");
                          if (filterClassroom && !a.classroomName.toLowerCase().includes(filterClassroom.toLowerCase())) return false;
                          if (filterTeacher && !a.teacherName.toLowerCase().includes(filterTeacher.toLowerCase())) return false;
                          if (filterAssignment && !a.title.toLowerCase().includes(filterAssignment.toLowerCase())) return false;
                          if (filterAssistant && !assistants.some((n) => n.includes(filterAssistant.toLowerCase()))) return false;
                          if (filterQuality && !qualityTeam.some((n) => n.includes(filterQuality.toLowerCase()))) return false;
                          if (filterDate) {
                            if (new Date(a.dueDate).toDateString() !== new Date(filterDate).toDateString()) return false;
                          }
                          return true;
                        })
                        .map((a) => {
                          const related = delegations.filter((d) => d.assignmentId === a._id || d.assignmentId?._id === a._id);
                          const assistants = related.filter((d) => d.role === "assistant");
                          const qualityTeam = related.filter((d) => d.role === "quality team");
                          const assistantOptions = assistantsMap[a._id]?.map((as) => ({ value: as.personId?._id, label: as.personId?.name })) || [];
                          const hasSubjectAssistants = assistantOptions.length > 0;

                          return (
                            <tr key={a._id} className="md-row">
                              <td><span className="md-cell-primary">{a.classroomName}</span></td>
                              <td><span className="md-cell-muted">{a.teacherName}</span></td>
                              <td><span className="md-cell-title">{a.title}</span></td>

                              <td>
                                {assistants.length ? (
                                  <div className="md-tags">
                                    {assistants.map((d) => (
                                      <span key={d._id} className="md-tag md-tag--assistant">{d.personId?.name}</span>
                                    ))}
                                  </div>
                                ) : <span className="md-cell-empty">Not Assigned</span>}
                              </td>

                              <td>
                                <span className="md-cell-muted">
                                  {assistants[0]?.assistantDeadline
                                    ? new Date(assistants[0].assistantDeadline).toLocaleString()
                                    : "—"}
                                </span>
                              </td>

                              <td>
                                {qualityTeam.length ? (
                                  <div className="md-tags">
                                    {qualityTeam.map((d) => (
                                      <span key={d._id} className="md-tag md-tag--quality">{d.personId?.name}</span>
                                    ))}
                                  </div>
                                ) : <span className="md-cell-empty">Not Assigned</span>}
                              </td>

                              <td>
                                {(() => {
                                  const isInitialAssign =
                                    selectedStatus === "UNASSIGNED" && !assistants.length;

                                  const canManage = [
                                    "ASSIGNED", "FAILED_DEADLINE", "IN_REVIEW", "RECHECK_BY_ASSISTANT"
                                  ].includes(selectedStatus);

                                  /* ── INITIAL ASSIGN (no assistant yet) ── */
                                  if (isInitialAssign) {
                                    if (!hasSubjectAssistants) {
                                      return <span className="md-no-assistants">No assistants available</span>;
                                    }
                                    return (
                                      <div className="md-assign-cell">
                                        <Select
                                          styles={{ ...customSelectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
                                          menuPortalTarget={document.body}
                                          options={assistantOptions}
                                          value={selectedAssistants[a._id] || null}
                                          onChange={(sel) => setSelectedAssistants((p) => ({ ...p, [a._id]: sel }))}
                                          placeholder="Select assistant"
                                        />
                                        <DatePicker
                                          selected={deadlines[a._id] || null}
                                          onChange={(date) => setDeadlines((p) => ({ ...p, [a._id]: date }))}
                                          showTimeSelect
                                          dateFormat="Pp"
                                          className="md-datepicker-input"
                                          placeholderText="Set deadline"
                                          portalId="root"
                                        />
                                        <button className="md-assign-btn" onClick={() => assignAssistant(a._id)}>
                                          Assign
                                        </button>
                                      </div>
                                    );
                                  }

                                  /* ── CHANGE / REMOVE (active assistant exists) ── */
                                  if (canManage) {
                                    if (!hasSubjectAssistants) {
                                      return (
                                        <button className="md-remove-btn" onClick={() => removeAssistant(a._id)}>
                                          Remove
                                        </button>
                                      );
                                    }
                                    return (
                                      <div className="md-assign-cell">
                                        <Select
                                          styles={{ ...customSelectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
                                          menuPortalTarget={document.body}
                                          options={assistantOptions}
                                          value={selectedAssistants[a._id] || null}
                                          onChange={(sel) => setSelectedAssistants((p) => ({ ...p, [a._id]: sel }))}
                                          placeholder="Change assistant"
                                        />
                                        <DatePicker
                                          selected={deadlines[a._id] || null}
                                          onChange={(date) => setDeadlines((p) => ({ ...p, [a._id]: date }))}
                                          showTimeSelect
                                          dateFormat="Pp"
                                          className="md-datepicker-input"
                                          placeholderText="New deadline (optional)"
                                          portalId="root"
                                        />
                                        <button className="md-assign-btn" onClick={() => changeAssistant(a._id)}>
                                          Change
                                        </button>
                                        <button className="md-remove-btn" onClick={() => removeAssistant(a._id)}>
                                          Remove
                                        </button>
                                      </div>
                                    );
                                  }

                                  return null;
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {!selectedStatus && !loading && (
            <div className="md-empty-state">
              <FiBookOpen size={40} />
              <p>Select a status card above to view assignments</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}