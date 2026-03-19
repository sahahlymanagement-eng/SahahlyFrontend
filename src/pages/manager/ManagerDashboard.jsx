import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import Select from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./ManagerDashboard.css";

const ALL_STATUSES = [
  "UNASSIGNED",
  "ASSIGNED",
  "IN_REVIEW",
  "RECHECK_BY_ASSISTANT",
  "IN_REVIEW_AFTER_RECHECK",
  "EMERGENCY",
  "DONE",
  "DONE_BY_QUALITY",
  "DONE_BY_QUALITY_LATE",
];

const formatStatus = (status) =>
  status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

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

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsed = JSON.parse(storedUser);

    if (parsed?.roleId?.name?.toLowerCase() !== "manager") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsed);
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;
    loadDashboard();
  }, [user]);

  const computeDashboardStatus = (assignment) => {
    if (assignment.status === "UNASSIGNED" && assignment.assignedAssistantId) {
      return "ASSIGNED";
    }
    return assignment.status || "UNASSIGNED";
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // 1) Load all classrooms once
      const classroomsRes = await api.get("/classrooms");

      const teacherMap = {};
      const classroomSubjectMap = {};

      classroomsRes.data.forEach((c) => {
        teacherMap[c._id] = c.teacherId?.name || "Not Assigned";
        classroomSubjectMap[c._id] =
          typeof c.subjectId === "string"
            ? c.subjectId
            : c.subjectId?._id || null;
      });

      // 2) Get manager classrooms
      const classroomManagersRes = await api.get(
        `/classroom-managers?personId=${user.id}`
      );

      const classroomMap = {};
      classroomManagersRes.data.forEach((m) => {
        if (m.classroomId?._id) {
          classroomMap[m.classroomId._id] = m.classroomId.name;
        }
      });

      const classroomIds = classroomManagersRes.data
        .map((m) => m.classroomId?._id)
        .filter(Boolean);

      // Nothing assigned to this manager
      if (!classroomIds.length) {
        setAssignments([]);
        setDelegations([]);
        setAssistantsMap({});

        const emptyCounts = {};
        ALL_STATUSES.forEach((s) => {
          emptyCounts[s] = 0;
        });
        setStatusCounts(emptyCounts);
        return;
      }

      // 3) Batch load assignments
      const assignmentsRes = await api.get(
        `/assignments/by-classrooms?classroomIds=${classroomIds.join(",")}`
      );

      let allAssignments = assignmentsRes.data || [];

      // 4) Attach extra fields
      allAssignments = allAssignments.map((a) => ({
        ...a,
        classroomName: classroomMap[a.classroomId] || "Unknown",
        teacherName: teacherMap[a.classroomId] || "Not Assigned",
        dashboardStatus: computeDashboardStatus(a),
      }));

      setAssignments(allAssignments);

      // 5) Batch load delegations
      const assignmentIds = allAssignments.map((a) => a._id).filter(Boolean);

      let allDelegations = [];
      if (assignmentIds.length) {
        const delegationsRes = await api.get(
          `/assignment-delegations/by-assignments?assignmentIds=${assignmentIds.join(",")}`
        );
        allDelegations = delegationsRes.data || [];
      }

      setDelegations(allDelegations);

      // 6) Status counts
      const counts = {};
      ALL_STATUSES.forEach((s) => {
        counts[s] = 0;
      });

      allAssignments.forEach((a) => {
        counts[a.dashboardStatus] = (counts[a.dashboardStatus] || 0) + 1;
      });

      setStatusCounts(counts);

      // 7) Load assistants once per unique subject
      const assistantsTemp = {};

      const uniqueSubjectIds = [
        ...new Set(
          allAssignments
            .map((a) => classroomSubjectMap[a.classroomId])
            .filter(Boolean)
        ),
      ];

      const subjectAssistantsMap = {};

      await Promise.all(
        uniqueSubjectIds.map(async (subjectId) => {
          const res = await api.get(
            `/role-subject-assignments?subjectId=${subjectId}&role=assistant`
          );
          subjectAssistantsMap[subjectId] = res.data || [];
        })
      );

      // 8) Map subject assistants to each assignment
      allAssignments.forEach((a) => {
        const subjectId = classroomSubjectMap[a.classroomId];

        if (!subjectId) {
          assistantsTemp[a._id] = [];
          return;
        }

        assistantsTemp[a._id] = subjectAssistantsMap[subjectId] || [];
      });

      setAssistantsMap(assistantsTemp);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const assignAssistant = async (assignmentId) => {
    try {
      const selectedAssistant = selectedAssistants[assignmentId];
      const deadline = deadlines[assignmentId];

      if (!selectedAssistant?.value) {
        toast.error("Please select an assistant");
        return;
      }

      if (!deadline) {
        toast.error("Please select a deadline");
        return;
      }

      await api.post("/assignment-delegations", {
        assignmentId,
        personId: selectedAssistant.value,
        role: "assistant",
        assignedBy: user.id,
        assistantDeadline: deadline,
      });

      toast.success("Assistant assigned");
      loadDashboard();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to assign assistant");
    }
  };

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: "#081c44",
      borderColor: "rgba(255,255,255,0.2)",
      color: "white",
      minWidth: "200px",
      boxShadow: "none",
    }),
    singleValue: (base) => ({
      ...base,
      color: "white",
    }),
    input: (base) => ({
      ...base,
      color: "white",
    }),
    placeholder: (base) => ({
      ...base,
      color: "rgba(255,255,255,0.7)",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "#081c44",
      zIndex: 30,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? "#0d2b63" : "#081c44",
      color: "white",
      cursor: "pointer",
    }),
  };

  if (!user) return null;

  return (
    <div className="managerLayout">
      <div className={`managerSidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebarHeader">
          <button
            className="sidebarToggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            ☰
          </button>
          {!sidebarCollapsed && <span className="sidebarTitle">Manager</span>}
        </div>

        <div className="sidebarMenu">
          <div className="sidebarItem active">
            <span>🏠</span>
            {!sidebarCollapsed && <p>Dashboard</p>}
          </div>

          <div className="sidebarItem">
            <span>📋</span>
            {!sidebarCollapsed && <p>Delegations</p>}
          </div>

          <div className="sidebarItem">
            <span>📊</span>
            {!sidebarCollapsed && <p>Reports</p>}
          </div>
        </div>
      </div>

      <div className="managerMain">
        <div className="managerDash-container">
          <div className="managerDash-content">
            <h2 className="managerDash-title">
              Manager Dashboard
              <br />
              Welcome, Mr. / Mrs. {user.name}
            </h2>

            <div className="managerDash-statusGrid">
              {ALL_STATUSES.map((status) => (
                <div
                  key={status}
                  className={`managerDash-statusCard ${
                    selectedStatus === status ? "active" : ""
                  }`}
                  onClick={() =>
                    setSelectedStatus(selectedStatus === status ? null : status)
                  }
                >
                  <h3>{statusCounts[status] || 0}</h3>
                  <p>{formatStatus(status)}</p>
                </div>
              ))}
            </div>

            {selectedStatus && (
              <div className="managerDash-section">
                <h3>{formatStatus(selectedStatus)}</h3>

                <div className="filterBar managerFilterGrid">
                  <input
                    className="managerFilterInput"
                    placeholder="Search Classroom"
                    value={filterClassroom}
                    onChange={(e) => setFilterClassroom(e.target.value)}
                  />

                  <input
                    className="managerFilterInput"
                    placeholder="Search Teacher"
                    value={filterTeacher}
                    onChange={(e) => setFilterTeacher(e.target.value)}
                  />

                  <input
                    className="managerFilterInput"
                    placeholder="Search Assignment"
                    value={filterAssignment}
                    onChange={(e) => setFilterAssignment(e.target.value)}
                  />

                  <input
                    className="managerFilterInput"
                    placeholder="Search Assistant"
                    value={filterAssistant}
                    onChange={(e) => setFilterAssistant(e.target.value)}
                  />

                  <input
                    className="managerFilterInput"
                    placeholder="Search Quality"
                    value={filterQuality}
                    onChange={(e) => setFilterQuality(e.target.value)}
                  />

                  <DatePicker
                    selected={filterDate}
                    onChange={(date) => setFilterDate(date)}
                    dateFormat="yyyy-MM-dd"
                    className="customDatePicker"
                    placeholderText="Filter Deadline"
                    isClearable
                  />

                </div>

                <div className="assignmentTableWrapper">
                  <table className="assignmentTable">
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

                        const related = delegations.filter(
                          (d) =>
                            d.assignmentId === a._id ||
                            d.assignmentId?._id === a._id
                        );

                        const assistants = related
                          .filter((d) => d.role === "assistant")
                          .map((d) => d.personId?.name?.toLowerCase() || "");

                        const qualityTeam = related
                          .filter((d) => d.role === "quality team")
                          .map((d) => d.personId?.name?.toLowerCase() || "");

                        if (
                          filterClassroom &&
                          !a.classroomName.toLowerCase().includes(filterClassroom.toLowerCase())
                        )
                          return false;

                        if (
                          filterTeacher &&
                          !a.teacherName.toLowerCase().includes(filterTeacher.toLowerCase())
                        )
                          return false;

                        if (
                          filterAssignment &&
                          !a.title.toLowerCase().includes(filterAssignment.toLowerCase())
                        )
                          return false;

                        if (
                          filterAssistant &&
                          !assistants.some((name) =>
                            name.includes(filterAssistant.toLowerCase())
                          )
                        )
                          return false;

                        if (
                          filterQuality &&
                          !qualityTeam.some((name) =>
                            name.includes(filterQuality.toLowerCase())
                          )
                        )
                          return false;

                        if (filterDate) {
                          const assignmentDate = new Date(a.dueDate);
                          const filter = new Date(filterDate);

                          if (assignmentDate.toDateString() !== filter.toDateString())
                            return false;
                        }

                        return true;
                      })
                        .map((a) => {
                          const related = delegations.filter(
                            (d) =>
                              d.assignmentId === a._id ||
                              d.assignmentId?._id === a._id
                          );

                          const assistants = related.filter(
                            (d) => d.role === "assistant"
                          );

                          const qualityTeam = related.filter(
                            (d) => d.role === "quality team"
                          );

                          const assistantOptions =
                            assistantsMap[a._id]?.map((as) => ({
                              value: as.personId?._id,
                              label: as.personId?.name,
                            })) || [];

                          const hasSubjectAssistants = assistantOptions.length > 0;

                          return (
                            <tr key={a._id}>
                              <td>{a.classroomName}</td>
                              <td>{a.teacherName}</td>
                              <td>{a.title}</td>

                              <td>
                                {assistants.length
                                  ? assistants
                                      .map((d) => d.personId?.name)
                                      .join(", ")
                                  : "Not Assigned"}
                              </td>

                              <td>
                                {assistants[0]?.assistantDeadline
                                  ? new Date(
                                      assistants[0].assistantDeadline
                                    ).toLocaleString()
                                  : "Not Set"}
                              </td>

                              <td>
                                {qualityTeam.length
                                  ? qualityTeam
                                      .map((d) => d.personId?.name)
                                      .join(", ")
                                  : "Not Assigned"}
                              </td>

                              <td>
                                {!assistants.length &&
                                  selectedStatus === "UNASSIGNED" && (
                                    <div className="assignControls">
                                      {hasSubjectAssistants ? (
                                        <>
                                          <Select
                                            styles={customSelectStyles}
                                            options={assistantOptions}
                                            value={selectedAssistants[a._id] || null}
                                            onChange={(selected) =>
                                              setSelectedAssistants((prev) => ({
                                                ...prev,
                                                [a._id]: selected,
                                              }))
                                            }
                                            placeholder="Assistant"
                                          />

                                          <DatePicker
                                            selected={deadlines[a._id] || null}
                                            onChange={(date) =>
                                              setDeadlines((prev) => ({
                                                ...prev,
                                                [a._id]: date,
                                              }))
                                            }
                                            showTimeSelect
                                            dateFormat="Pp"
                                            className="customDatePicker"
                                            placeholderText="Deadline"
                                          />

                                          <button
                                            className="assignBtn"
                                            onClick={() => assignAssistant(a._id)}
                                          >
                                            Assign
                                          </button>
                                        </>
                                      ) : (
                                        <span style={{ color: "#ffd27a" }}>
                                          No subject assistants available
                                        </span>
                                      )}
                                    </div>
                                  )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>

                  {loading && (
                    <div style={{ marginTop: "12px", color: "#fff" }}>
                      Loading...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}