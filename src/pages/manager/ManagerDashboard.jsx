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
  const [classroomTeacherMap, setClassroomTeacherMap] = useState({});

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

      // 1️⃣ Load all classrooms with teacher info
      const classroomsRes = await api.get("/classrooms");

      const teacherMap = {};

      classroomsRes.data.forEach((c) => {
        teacherMap[c._id] = c.teacherId?.name || "Not Assigned";
      });

      // 2️⃣ Get classrooms managed by manager
      const classroomRes = await api.get(
        `/classroom-managers?personId=${user.id}`
      );

      const classroomMap = {};

      classroomRes.data.forEach((m) => {
        classroomMap[m.classroomId._id] = m.classroomId.name;
      });

      const classroomIds = classroomRes.data.map((m) => m.classroomId._id);

      // 3️⃣ Load assignments
      const assignmentRequests = classroomIds.map((id) =>
        api.get(`/assignments?classroomId=${id}`)
      );

      const assignmentResults = await Promise.all(assignmentRequests);

      let allAssignments = assignmentResults.flatMap((res) => res.data);

      // 4️⃣ Attach classroom + teacher info
      allAssignments = allAssignments.map((a) => ({
        ...a,
        classroomName: classroomMap[a.classroomId] || "Unknown",
        teacherName: teacherMap[a.classroomId] || "Not Assigned",
        dashboardStatus: computeDashboardStatus(a),
      }));

      setAssignments(allAssignments);

      // 5️⃣ Load delegations
      const delegationRequests = allAssignments.map((a) =>
        api.get(`/assignment-delegations?assignmentId=${a._id}`)
      );

      const delegationResults = await Promise.all(delegationRequests);

      const allDelegations = delegationResults.flatMap((res) => res.data);

      setDelegations(allDelegations);

      // 6️⃣ Status counts
      const counts = {};
      ALL_STATUSES.forEach((s) => (counts[s] = 0));

      allAssignments.forEach((a) => {
        counts[a.dashboardStatus]++;
      });

      setStatusCounts(counts);

      // 7️⃣ Load assistants
      const assistantsTemp = {};

      for (let a of allAssignments) {

        const classroomRes = await api.get(`/classrooms/${a.classroomId}`);

        const subjectId =
          typeof classroomRes.data.subjectId === "string"
            ? classroomRes.data.subjectId
            : classroomRes.data.subjectId?._id;

        const assistRes = await api.get(
          `/role-subject-assignments?subjectId=${subjectId}&role=assistant`
        );

        assistantsTemp[a._id] = assistRes.data || [];
      }

      setAssistantsMap(assistantsTemp);

    } catch (err) {
      console.error(err);
      toast.error("Failed to load dashboard");
    }
  };
  const assignAssistant = async (assignmentId) => {
    try {
      await api.post("/assignment-delegations", {
        assignmentId,
        personId: selectedAssistants[assignmentId]?.value,
        role: "assistant",
        assignedBy: user.id,
        assistantDeadline: deadlines[assignmentId],
      });

      toast.success("Assistant assigned");
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message);
    }
  };

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: "#081c44",
      borderColor: "rgba(255,255,255,0.2)",
      color: "white",
      minWidth: "200px",
    }),
    singleValue: (base) => ({ ...base, color: "white" }),
    menu: (base) => ({ ...base, backgroundColor: "#081c44" }),
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
                    setSelectedStatus(
                      selectedStatus === status ? null : status
                    )
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

                <div className="filterBar">
                  <DatePicker
                    selected={filterDate}
                    onChange={(date) => setFilterDate(date)}
                    dateFormat="yyyy-MM-dd"
                    className="customDatePicker"
                    placeholderText="Filter by due date"
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
                          if (!filterDate) return true;

                          const assignmentDate = new Date(a.dueDate);
                          const filter = new Date(filterDate);

                          return (
                            assignmentDate.toDateString() ===
                            filter.toDateString()
                          );
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
                              value: as.personId._id,
                              label: as.personId.name,
                            })) || [];

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

                                      <Select
                                        styles={customSelectStyles}
                                        options={assistantOptions}
                                        value={
                                          selectedAssistants[a._id] || null
                                        }
                                        onChange={(selected) =>
                                          setSelectedAssistants({
                                            ...selectedAssistants,
                                            [a._id]: selected,
                                          })
                                        }
                                        placeholder="Assistant"
                                      />

                                      <DatePicker
                                        selected={deadlines[a._id] || null}
                                        onChange={(date) =>
                                          setDeadlines({
                                            ...deadlines,
                                            [a._id]: date,
                                          })
                                        }
                                        showTimeSelect
                                        dateFormat="Pp"
                                        className="customDatePicker"
                                        placeholderText="Deadline"
                                      />

                                      <button
                                        className="assignBtn"
                                        onClick={() =>
                                          assignAssistant(a._id)
                                        }
                                      >
                                        Assign
                                      </button>

                                    </div>
                                  )}

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
        </div>
      </div>
    </div>
  );
}