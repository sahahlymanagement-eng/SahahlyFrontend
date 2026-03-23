import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import "./QualityManagerDashboard.css";

import {
  FiShield,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
  FiSearch,
  FiUserCheck,
  FiUsers,
  FiBookOpen,
  FiFilter,
} from "react-icons/fi";

export default function QualityManagerDashboard() {
  const [user, setUser] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [qualityMembersMap, setQualityMembersMap] = useState({});

  const [classroomTeacherMap, setClassroomTeacherMap] = useState({});
  const [classroomNameMap, setClassroomNameMap] = useState({});

  const [selectedQuality, setSelectedQuality] = useState({});

  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classroomFilter, setClassroomFilter] = useState("ALL");
  const [teacherFilter, setTeacherFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (storedUser) setUser(storedUser);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadDashboard = async () => {
  try {

    setLoading(true);

    const res = await api.get(
      `/quality-manager/dashboard?managerId=${user.id}`
    );

    const { assignments, delegations, classrooms } = res.data;

    setAssignments(assignments);
    setDelegations(delegations);

    const teacherMap = {};
    const nameMap = {};

    classrooms.forEach(c => {
      teacherMap[c._id] = c.teacherId?.name || "Not Assigned";
      nameMap[c._id] = c.name;
    });

    setClassroomTeacherMap(teacherMap);
    setClassroomNameMap(nameMap);

  } catch (err) {
    console.error(err);
    alert("Failed to load dashboard");
  } finally {
    setLoading(false);
  }
};

  const assignQuality = async (assignmentId) => {
    try {
      const personId = selectedQuality[assignmentId];

      if (!personId) {
        alert("Select quality member");
        return;
      }

      await api.post("/assignment-delegations", {
        assignmentId,
        personId,
        role: "quality team",
        assignedBy: user.id,
      });

      await loadDashboard();
    } catch (err) {
      console.error(err);
      alert("Failed to assign quality member");
    }
  };

  const getRelatedDelegations = (assignmentId) => {
    return delegations.filter(
      (d) => d.assignmentId === assignmentId || d.assignmentId?._id === assignmentId
    );
  };

  const tableRows = useMemo(() => {
    return assignments.map((a) => {
      const related = getRelatedDelegations(a._id);

      const assistants = related.filter((d) => d.role === "assistant");
      const qualityTeam = related.filter((d) => d.role === "quality team");

      const classroomId =
        typeof a.classroomId === "object" ? a.classroomId?._id : a.classroomId;

      const classroomName = classroomNameMap[classroomId] || "Unknown";
      const teacherName = classroomTeacherMap[classroomId] || "Not Assigned";

      return {
        ...a,
        classroomKey: classroomId,
        classroomName,
        teacherName,
        assistants,
        qualityTeam,
      };
    });
  }, [assignments, delegations, classroomNameMap, classroomTeacherMap]);

  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      const statusOk = statusFilter === "ALL" ? true : row.status === statusFilter;
      const classroomOk =
        classroomFilter === "ALL" ? true : row.classroomName === classroomFilter;
      const teacherOk =
        teacherFilter === "ALL" ? true : row.teacherName === teacherFilter;

      const assistantsText = row.assistants.map((a) => a.personId?.name).join(" ");
      const qualityText = row.qualityTeam.map((q) => q.personId?.name).join(" ");

      const searchText = [
        row.title,
        row.classroomName,
        row.teacherName,
        assistantsText,
        qualityText,
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchOk = search.trim()
        ? searchText.includes(search.trim().toLowerCase())
        : true;

      return statusOk && classroomOk && teacherOk && searchOk;
    });
  }, [tableRows, statusFilter, classroomFilter, teacherFilter, search]);

  const stats = useMemo(() => {
    return {
      done: tableRows.filter((a) => a.status === "DONE").length,
      doneByQuality: tableRows.filter((a) => a.status === "DONE_BY_QUALITY").length,
      doneByQualityLate: tableRows.filter((a) => a.status === "DONE_BY_QUALITY_LATE").length,
      pendingQuality: tableRows.filter((a) => a.qualityTeam.length === 0).length,
    };
  }, [tableRows]);

  const classrooms = useMemo(() => {
    return [...new Set(tableRows.map((r) => r.classroomName).filter(Boolean))].sort();
  }, [tableRows]);

  const teachers = useMemo(() => {
    return [...new Set(tableRows.map((r) => r.teacherName).filter(Boolean))].sort();
  }, [tableRows]);

  if (!user) return null;

  return (
    <div className="qmPage">
      <div className="qmHeader">
        <div className="qmHeaderLeft">
          <div className="qmHeaderIcon">
            <FiShield />
          </div>

          <div>
            <h2 className="qmTitle">Quality Manager Dashboard</h2>
            <p className="qmSubtitle">
              Monitor assignment outcomes, trace assistants and quality members, and assign quality reviewers
            </p>
          </div>
        </div>
      </div>

      <div className="qmStatsGrid">
        <StatCard icon={<FiCheckCircle />} title="Done" value={stats.done} tone="done" />
        <StatCard
          icon={<FiUserCheck />}
          title="Done by Quality"
          value={stats.doneByQuality}
          tone="quality"
        />
        <StatCard
          icon={<FiAlertTriangle />}
          title="Done by Quality Late"
          value={stats.doneByQualityLate}
          tone="late"
        />
        <StatCard
          icon={<FiClock />}
          title="Pending Quality Assignment"
          value={stats.pendingQuality}
          tone="pending"
        />
      </div>

      <div className="qmFilters">

        <div className="qmFilterBlock">
          <label>Status</label>

          <div className="qmSelect">
            <select
              value={statusFilter}
              onChange={(e)=>setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="UNASSIGNED">UNASSIGNED</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="RECHECK_BY_ASSISTANT">RECHECK_BY_ASSISTANT</option>
              <option value="IN_REVIEW_AFTER_RECHECK">IN_REVIEW_AFTER_RECHECK</option>
              <option value="DONE">DONE</option>
              <option value="DONE_BY_QUALITY">DONE_BY_QUALITY</option>
              <option value="DONE_BY_QUALITY_LATE">DONE_BY_QUALITY_LATE</option>
            </select>
          </div>
        </div>


        <div className="qmFilterBlock">
          <label>Classroom</label>

          <div className="qmSelect">
            <select
              value={classroomFilter}
              onChange={(e)=>setClassroomFilter(e.target.value)}
            >
              <option value="ALL">All Classrooms</option>

              {classrooms.map(c=>(
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>


        <div className="qmFilterBlock">
          <label>Teacher</label>

          <div className="qmSelect">
            <select
              value={teacherFilter}
              onChange={(e)=>setTeacherFilter(e.target.value)}
            >
              <option value="ALL">All Teachers</option>

              {teachers.map(t=>(
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

      </div>
      <div className="qmTableWrapper">
        <table className="qmTable">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Assignment</th>
              <th>Due Date</th>
              <th>Assistant(s)</th>
              <th>Assistant Deadline</th>
              <th>Quality Team</th>
              <th>Status</th>
              <th>Assign Quality</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="9" className="qmEmptyRow">
                  Loading dashboard...
                </td>
              </tr>
            )}

            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan="9" className="qmEmptyRow">
                  No assignments found.
                </td>
              </tr>
            )}

            {!loading &&
              filteredRows.map((a) => {
                const firstAssistantDeadline = a.assistants[0]?.assistantDeadline;

                return (
                  <tr key={a._id}>
                    <td>
                      <div className="qmPrimaryCell">{a.classroomName}</div>
                    </td>

                    <td>{a.teacherName}</td>

                    <td>
                      <div className="qmAssignmentTitle">{a.title}</div>
                    </td>

                    <td>
                      {a.dueDate
                        ? new Date(a.dueDate).toLocaleDateString()
                        : "Not Set"}
                    </td>

                    <td>
                      {a.assistants.length ? (
                        <div className="qmPeopleList">
                          {a.assistants.map((d) => (
                            <span className="qmPersonTag assistantTag" key={d._id}>
                              {d.personId?.name || "Unknown"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="qmMuted">Not Assigned</span>
                      )}
                    </td>

                    <td>
                      {firstAssistantDeadline
                        ? new Date(firstAssistantDeadline).toLocaleString()
                        : "Not Set"}
                    </td>

                    <td>
                      {a.qualityTeam.length ? (
                        <div className="qmPeopleList">
                          {a.qualityTeam.map((d) => (
                            <span className="qmPersonTag qualityTag" key={d._id}>
                              {d.personId?.name || "Unknown"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="qmMuted">Not Assigned</span>
                      )}
                    </td>

                    <td>
                      <span className={`qmStatusBadge qmStatus-${a.status}`}>
                        {a.status}
                      </span>
                    </td>

                    <td>
                      {a.qualityTeam.length === 0 ? (
                        <div className="qmAssignBox">
                          <div className="qmCustomSelect">
                            <select
                              value={selectedQuality[a._id] || ""}
                              onChange={(e) =>
                                setSelectedQuality({
                                  ...selectedQuality,
                                  [a._id]: e.target.value,
                                })
                              }
                            >
                              <option value="">Select member</option>

                              {(qualityMembersMap[a._id] || []).map((q) => (
                                <option key={q.personId._id} value={q.personId._id}>
                                  {q.personId.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            className="qmAssignBtn"
                            onClick={() => assignQuality(a._id)}
                          >
                            Assign
                          </button>
                        </div>
                      ) : (
                        <span className="qmMuted">Already Assigned</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, tone }) {
  return (
    <div className={`qmStatCard ${tone}`}>
      <div className="qmStatTop">
        <div className="qmStatIcon">{icon}</div>
        <span>{title}</span>
      </div>
      <div className="qmStatValue">{value}</div>
    </div>
  );
}