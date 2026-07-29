import { useCallback, useEffect, useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { confirmToast } from "../../utils/confirmToast";
import Select from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./ManagerDashboard.css";
import "../teacher/teacher.css";
import { TeacherActionLink } from "../teacher/TeacherUI";
import { selectStyles } from "../../utils/selectTheme";
import {
  FiBarChart2, FiSearch, FiCalendar, FiChevronRight,
  FiUser, FiUsers, FiBookOpen, FiClock, FiCheckCircle,
  FiAlertTriangle, FiClipboard, FiRefreshCw, FiAlertCircle,
} from "react-icons/fi";

import { isDirectorLikeRole } from "../../utils/directorLikeAccess";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

const DASHBOARD_STATUSES = [
  "UNASSIGNED",
  "ASSIGNED",
  "FAILED_DEADLINE",
  "DONE",
];

// Palette-aligned status accents (kept as static hex so the `${accent}18`
// alpha trick below still works; these read well on both themes).
const STATUS_META = {
  UNASSIGNED:      { icon: <FiClock />,         accent: "#8A94A6", iconClass: "tch-stat-icon--muted" },
  ASSIGNED:        { icon: <FiUser />,          accent: "#7A9CB3", iconClass: "tch-stat-icon--blue" },
  FAILED_DEADLINE: { icon: <FiAlertTriangle />, accent: "#C15F52", iconClass: "md-stat-icon--danger" },
  DONE:            { icon: <FiCheckCircle />,   accent: "#5B9279", iconClass: "tch-stat-icon--green" },
};

const formatStatus = (s) =>
  s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

export default function ManagerDashboard({ scope = "manager" }) {
  const navigate = useNavigate();
  const isDirectorScope = scope === "director";

  const [user, setUser] = useState(null);
  const [classroomIds, setClassroomIds] = useState([]);
  const [classroomMap, setClassroomMap] = useState({});
  const [teacherMap, setTeacherMap] = useState({});
  const [delegations, setDelegations] = useState([]);
  const [assistantsMap, setAssistantsMap] = useState({});
  const [assistantMetaMap, setAssistantMetaMap] = useState({});
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
  const [contextLoading, setContextLoading] = useState(false);
  const [submissionCounts, setSubmissionCounts] = useState({});
  const [expandedRows, setExpandedRows] = useState({});
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(true);

  const basePath = isDirectorScope ? "/director" : "/manager";

  const loadBriefing = useCallback(async () => {
    if (!user?.id) return;
    try {
      setBriefingLoading(true);
      const res = await api.get("/manager-dashboard/briefing", {
        params: {
          personId: user.id,
          scope: isDirectorScope ? "director" : "manager",
        },
      });
      setBriefing(res.data);
    } catch {
      setBriefing(null);
    } finally {
      setBriefingLoading(false);
    }
  }, [user?.id, isDirectorScope]);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) { navigate("/login", { replace: true }); return; }
    const parsed = JSON.parse(storedUser);
    const roleName = parsed?.roleId?.name?.toLowerCase();
    if (isDirectorScope) {
      if (!isDirectorLikeRole(roleName)) { navigate("/login", { replace: true }); return; }
    } else if (roleName !== "manager") {
      navigate("/login", { replace: true });
      return;
    }
    setUser(parsed);
  }, [navigate, isDirectorScope]);

  const computeDashboardStatus = (a) => {
    if (a.status === "UNASSIGNED" && a.assignedAssistantId) return "ASSIGNED";
    return a.status || "UNASSIGNED";
  };

  const paginationParams = useMemo(() => {
    const base = { classroomIds: classroomIds.join(",") };
    if (!selectedStatus) return base;
    return {
      ...base,
      status: selectedStatus,
      ...(filterClassroom ? { filterClassroom } : {}),
      ...(filterTeacher ? { filterTeacher } : {}),
      ...(filterAssignment ? { filterAssignment } : {}),
      ...(filterAssistant ? { filterAssistant } : {}),
      ...(filterQuality ? { filterQuality } : {}),
      ...(filterDate ? { filterDate: filterDate.toISOString() } : {}),
    };
  }, [classroomIds, selectedStatus, filterClassroom, filterTeacher, filterAssignment, filterAssistant, filterQuality, filterDate]);

  const { data, page, totalPages, loading, fetchPage, extra } =
    usePagination(
      "/assignments/by-classrooms",
      paginationParams,
      10,
      "data",
      !!classroomIds.length
    );

  const assignments = useMemo(() =>
    (data || []).map((a) => ({
      ...a,
      classroomName: classroomMap[String(a.classroomId)] || "Unknown",
      teacherName: teacherMap[String(a.classroomId)] || "Not Assigned",
      dashboardStatus: computeDashboardStatus(a),
    })),
  [data, classroomMap, teacherMap]);

  useEffect(() => { if (!user?.id) return; loadClassroomContext(); }, [user]);
  useEffect(() => { if (user?.id) loadBriefing(); }, [user, loadBriefing]);

  useEffect(() => {
    if (extra.statusCounts) {
      setStatusCounts(extra.statusCounts);
    }
  }, [extra]);

  useEffect(() => {
    if (!data.length) {
      setDelegations([]);
      return;
    }
    const assignmentIds = data.map((a) => a._id).filter(Boolean);
    api.post("/assignment-delegations/by-assignments", { assignmentIds })
      .then((delRes) => setDelegations(delRes.data || []))
      .catch((err) => console.error("Failed to load delegations", err));
  }, [data]);

  useEffect(() => {
    if (!data.length) {
      setAssistantsMap({});
      setAssistantMetaMap({});
      return;
    }

    const classroomIds = [
      ...new Set(data.map((a) => String(a.classroomId)).filter(Boolean)),
    ];
    if (!classroomIds.length) return;

    api
      .get("/assignment-delegations/available-assistants", {
        params: { classroomIds: classroomIds.join(",") },
      })
      .then((res) => {
        const assistantsTemp = {};
        const metaTemp = {};
        data.forEach((a) => {
          const info = res.data?.[String(a.classroomId)] || {};
          assistantsTemp[a._id] = info.assistants || [];
          metaTemp[a._id] = {
            subjectName: info.subjectName,
            reason: info.reason,
          };
        });
        setAssistantsMap(assistantsTemp);
        setAssistantMetaMap(metaTemp);
      })
      .catch((err) => console.error("Failed to load assistants", err));
  }, [data]);

  const renderAssistantUnavailable = (assignmentId) => {
    const meta = assistantMetaMap[assignmentId];
    if (meta?.reason === "no_subject") {
      return <span className="md-no-assistants">No subject linked to this classroom</span>;
    }
    if (meta?.reason === "no_assistants_on_subject" && meta?.subjectName) {
      return (
        <span className="md-no-assistants" title={`Subject "${meta.subjectName}" has no assistants assigned in People`}>
          No assistants on {meta.subjectName}
        </span>
      );
    }
    return <span className="md-no-assistants">No assistants available</span>;
  };

  const loadClassroomContext = async () => {
    try {
      setContextLoading(true);

      if (isDirectorScope) {
        const classroomsRes = await api.get("/classrooms", { params: { page: 1, limit: 5000 } });
        const map = {};
        const teachers = {};
        (classroomsRes.data.data || []).forEach((c) => {
          if (!c?._id) return;
          const cid = String(c._id);
          map[cid] = c.name;
          teachers[cid] = c.teacherId?.name || "Not Assigned";
        });
        setTeacherMap(teachers);
        setClassroomMap(map);
        const ids = (classroomsRes.data.data || [])
          .map((c) => c._id)
          .filter(Boolean)
          .map(String);
        setClassroomIds(ids);

        if (!ids.length) {
          setDelegations([]);
          setAssistantsMap({});
          setAssistantMetaMap({});
          const e = {};
          DASHBOARD_STATUSES.forEach((s) => {
            e[s] = 0;
          });
          setStatusCounts(e);
        }
        return;
      }

      const classroomManagersRes = await api.get(`/classroom-managers?personId=${user.id}`, { params: { page: 1, limit: 5000 } });
      const map = {};
      const teachers = {};
      (classroomManagersRes.data.data || []).forEach((m) => {
        const c = m.classroomId;
        if (!c?._id) return;
        const cid = String(c._id);
        map[cid] = c.name;
        teachers[cid] = c.teacherId?.name || "Not Assigned";
      });
      setTeacherMap(teachers);
      setClassroomMap(map);
      const ids = (classroomManagersRes.data.data || [])
        .map((m) => m.classroomId?._id)
        .filter(Boolean)
        .map(String);
      setClassroomIds(ids);

      if (!ids.length) {
        setDelegations([]);
        setAssistantsMap({});
        setAssistantMetaMap({});
        const e = {};
        DASHBOARD_STATUSES.forEach((s) => {
          e[s] = 0;
        });
        setStatusCounts(e);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load dashboard");
    } finally {
      setContextLoading(false);
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
      fetchPage(page);
      loadBriefing();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to assign assistant");
    }
  };

  // Shared token-based react-select styles (src/utils/selectTheme.js), with
  // the 180px minWidth this page's assistant-picker control needs.
  const customSelectStyles = {
    ...selectStyles,
    control: (base, state) => ({ ...selectStyles.control(base, state), minWidth: "180px" }),
  };

  if (!user) return null;

  const briefingSummary = briefing?.summary;

  const totalAssignments = DASHBOARD_STATUSES.reduce(
    (sum, status) => sum + (statusCounts[status] || 0),
    0
  );

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
    fetchPage(page);
    loadBriefing();
  } catch (err) {
    toast.error(err.response?.data?.message || "Failed to change assistant");
  }
};

const removeAssistant = async (assignmentId) => {
  const confirmed = await confirmToast(
    "Remove assistant (and quality team if assigned)? Task will become UNASSIGNED.",
    { title: "Remove assistant", confirmLabel: "Remove", danger: true }
  );
  if (!confirmed) return;
  try {
    await api.delete("/assignment-delegations/remove-assistant", {
      data: { assignmentId, assignedBy: user.id },
    });
    toast.success("Assistant removed. Task is now UNASSIGNED.");
    fetchPage(page);
    loadBriefing();
  } catch (err) {
    toast.error(err.response?.data?.message || "Failed to remove assistant");
  }
};

const loadCountsForAssignment = async (assignmentId) => {

  if (submissionCounts[assignmentId] !== undefined) return;

  try {
    setSubmissionCounts(prev => ({
      ...prev,
      [assignmentId]: "loading"
    }));

    const res = await api.post(
      "/assignment-submissions/batch-counts",
      { assignmentIds: [assignmentId] }
    );

    setSubmissionCounts(prev => ({
      ...prev,
      [assignmentId]: res.data?.[assignmentId] || null
    }));

  } catch (err) {
    console.error("Counts failed", err);

    setSubmissionCounts(prev => ({
      ...prev,
      [assignmentId]: null
    }));
  }
};

const toggleRow = (id) => {

  const opening = !expandedRows[id];

  setExpandedRows(prev => ({
    ...prev,
    [id]: opening
  }));

  if (opening) {
    loadCountsForAssignment(id);
  }
};

const goToSubmissionViewer = (assignment) => {
  if (!assignment?.classroomId || !assignment?._id) return;
  const base = isDirectorScope ? "/director/submissions" : "/manager/submissions";
  navigate(
    `${base}?classroomId=${assignment.classroomId}&assignmentId=${assignment._id}`
  );
};


  return (
    <div className="tch-page md-dashboard-page">
      <section className="tch-hero">
        <p className="tch-hero-greeting">
          {briefing?.greeting ||
            `Welcome back${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        </p>
        <h1>
          {isDirectorScope ? (
            <>Assign assistants, <span>org-wide</span></>
          ) : (
            <>Welcome back, <span>{user.name?.split(" ")[0] || "Manager"}</span></>
          )}
        </h1>
        <p>
          {isDirectorScope
            ? "Assign assistants to coursework across all classrooms, track deadlines, and monitor submission progress from one place."
            : "Assign assistants, track submission progress, and manage student reports across your classrooms — all from one place."}
        </p>
      </section>

      <section className="tch-briefing" aria-label="Today's briefing">
        <div className="tch-briefing-head">
          <div>
            <div className="tch-briefing-eyebrow">Today&apos;s briefing</div>
            <h2 className="tch-briefing-title">What needs attention</h2>
          </div>
          <div className="md-total-pill">
            <FiBookOpen size={13} />
            <span>{totalAssignments} assignments</span>
          </div>
        </div>

        {briefingLoading ? (
          <div className="tch-briefing-loading">Loading your briefing…</div>
        ) : briefing ? (
          <>
            <div className="tch-briefing-stats">
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {briefingSummary?.unassigned ?? statusCounts.UNASSIGNED ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Unassigned</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {briefingSummary?.assigned ?? statusCounts.ASSIGNED ?? 0}
                </span>
                <span className="tch-briefing-stat-label">In progress</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {briefingSummary?.assistantsBehind ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Assistants behind</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {briefingSummary?.failedDeadline ?? statusCounts.FAILED_DEADLINE ?? 0}
                </span>
                <span className="tch-briefing-stat-label">Failed deadline</span>
              </div>
              <div className="tch-briefing-stat">
                <span className="tch-briefing-stat-value">
                  {briefingSummary?.classroomsManaged ?? classroomIds.length}
                </span>
                <span className="tch-briefing-stat-label">Classrooms</span>
              </div>
            </div>
            <ul className="tch-briefing-lines">
              {(briefing.lines || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {briefing.details?.assistantsBehind?.length > 0 && (
              <div className="tch-briefing-alert">
                <FiAlertCircle size={16} />
                <div>
                  <strong>Behind schedule</strong>
                  <p>
                    {briefing.details.assistantsBehind
                      .slice(0, 3)
                      .map(
                        (a) =>
                          `${a.assistantName} on “${a.assignmentTitle}”${
                            a.className ? ` (${a.className})` : ""
                          }`
                      )
                      .join(" · ")}
                    {briefing.details.assistantsBehind.length > 3
                      ? ` · +${briefing.details.assistantsBehind.length - 3} more`
                      : ""}
                  </p>
                </div>
              </div>
            )}
            {briefing.details?.unassignedAssignments?.length > 0 && (
              <div className="tch-briefing-alert md-briefing-alert--info">
                <FiClock size={16} />
                <div>
                  <strong>Needs assistant assignment</strong>
                  <p>
                    {briefing.details.unassignedAssignments
                      .slice(0, 3)
                      .map(
                        (a) =>
                          `“${a.title}”${a.className ? ` (${a.className})` : ""}`
                      )
                      .join(" · ")}
                    {briefing.details.unassignedAssignments.length > 3
                      ? ` · +${briefing.details.unassignedAssignments.length - 3} more`
                      : ""}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="tch-briefing-loading">
            Briefing unavailable right now. Try refresh.
          </div>
        )}
      </section>

      <div className="tch-stats-row">
        {DASHBOARD_STATUSES.map((status, i) => {
          const meta = STATUS_META[status];
          const isActive = selectedStatus === status;
          const count = statusCounts[status] || 0;
          return (
            <button
              key={status}
              type="button"
              className={`tch-stat-card md-stat-filter ${isActive ? "md-stat-filter--active" : ""}`}
              style={{ animationDelay: `${i * 0.05}s` }}
              onClick={() => setSelectedStatus(isActive ? null : status)}
            >
              <div className={`tch-stat-icon ${meta.iconClass}`}>
                {meta.icon}
              </div>
              <div>
                <div className="tch-stat-value">{count}</div>
                <div className="tch-stat-label">{formatStatus(status)}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="tch-actions-grid">
        {!isDirectorScope && (
          <button
            type="button"
            className="tch-action-card"
            style={{ animationDelay: "0.12s" }}
            onClick={() => navigate(`${basePath}/students`)}
          >
            <div className="tch-action-card-icon">
              <FiUsers />
            </div>
            <h3>Students data</h3>
            <p>
              View and edit student contact details, parent phones, and classroom
              rosters across your managed classes.
            </p>
            <TeacherActionLink>Open students</TeacherActionLink>
          </button>
        )}

        <button
          type="button"
          className="tch-action-card"
          style={{ animationDelay: "0.15s" }}
          onClick={() =>
            navigate(isDirectorScope ? `${basePath}/reports` : `${basePath}/assignments`)
          }
        >
          <div className="tch-action-card-icon">
            <FiClipboard />
          </div>
          <h3>{isDirectorScope ? "Assignment reports" : "Assignments & reports"}</h3>
          <p>
            Review assignment status, send WhatsApp grade reports to parents, and
            track report delivery.
          </p>
          <TeacherActionLink>Open reports</TeacherActionLink>
        </button>

        <button
          type="button"
          className="tch-action-card"
          style={{ animationDelay: "0.18s" }}
          onClick={() => navigate(`${basePath}/submissions`)}
        >
          <div className="tch-action-card-icon">
            <FiBarChart2 />
          </div>
          <h3>Submission viewer</h3>
          <p>
            Browse student submissions, compare on-time and late work, and open
            the marking workflow for any assignment.
          </p>
          <TeacherActionLink>Open submissions</TeacherActionLink>
        </button>

        {!isDirectorScope && (
          <button
            type="button"
            className="tch-action-card"
            style={{ animationDelay: "0.21s" }}
            onClick={() => navigate(`${basePath}/operation-metrics`)}
          >
            <div className="tch-action-card-icon">
              <FiBarChart2 />
            </div>
            <h3>Operation metrics</h3>
            <p>
              Monitor assistant workload, marking throughput, and operational
              performance across your classrooms.
            </p>
            <TeacherActionLink>View metrics</TeacherActionLink>
          </button>
        )}
      </div>

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
                {loading || contextLoading ? (
                  <div className="md-loading">
                    <div className="md-spinner" />
                    <span>Loading…</span>
                  </div>
                ) : (
                  <table className="md-table sah-table--cards">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }} />
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
                        .map((a) => {
                          const related = delegations.filter((d) => d.assignmentId === a._id || d.assignmentId?._id === a._id);
                          const assistants = related.filter((d) => d.role === "assistant");
                          const qualityTeam = related.filter((d) => d.role === "quality team");
                          const assistantOptions = assistantsMap[a._id]?.map((as) => ({ value: as.personId?._id, label: as.personId?.name })) || [];
                          const hasSubjectAssistants = assistantOptions.length > 0;
                          const isExpanded = !!expandedRows[a._id];
                          const counts = submissionCounts[a._id];
                          const countsSpinning = counts === "loading" || counts === undefined;
                          return (
                             <Fragment key={a._id}>
                              <tr className="md-row">
                                {/* Expand toggle */}
                                <td>
                                  <button
                                    className={`md-expand-btn ${isExpanded ? "md-expand-btn--open" : ""}`}
                                    onClick={() => toggleRow(a._id)}
                                    aria-label="Toggle details"
                                  >
                                    <FiChevronRight size={14} />
                                  </button>
                                </td>

                                <td data-label="Classroom"><span className="md-cell-primary">{a.classroomName}</span></td>
                                <td data-label="Teacher"><span className="md-cell-muted">{a.teacherName}</span></td>
                                <td data-label="Assignment"><span className="md-cell-title">{a.title}</span></td>

                                <td data-label="Assistant(s)">
                                  {assistants.length ? (
                                    <div className="md-tags">
                                      {assistants.map((d) => (
                                        <span key={d._id} className="md-tag md-tag--assistant">{d.personId?.name}</span>
                                      ))}
                                    </div>
                                  ) : <span className="md-cell-empty">Not Assigned</span>}
                                </td>

                                <td data-label="Deadline">
                                  <span className="md-cell-muted">
                                    {assistants[0]?.assistantDeadline
                                      ? new Date(assistants[0].assistantDeadline).toLocaleString()
                                      : "—"}
                                  </span>
                                </td>

                                <td data-label="Quality Team">
                                  {qualityTeam.length ? (
                                    <div className="md-tags">
                                      {qualityTeam.map((d) => (
                                        <span key={d._id} className="md-tag md-tag--quality">{d.personId?.name}</span>
                                      ))}
                                    </div>
                                  ) : <span className="md-cell-empty">Not Assigned</span>}
                                </td>

                                <td data-label="Action">
                                  {(() => {
                                    const isInitialAssign = selectedStatus === "UNASSIGNED" && !assistants.length;
                                    const canManage = ["ASSIGNED","FAILED_DEADLINE","IN_REVIEW","RECHECK_BY_ASSISTANT"].includes(selectedStatus);

                                    if (isInitialAssign) {
                                      if (!hasSubjectAssistants) return renderAssistantUnavailable(a._id);
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
                                            timeIntervals={1}
                                            dateFormat="Pp"
                                            className="md-datepicker-input"
                                            placeholderText="Set deadline"
                                            portalId="root"
                                          />
                                          <button className="md-assign-btn" onClick={() => assignAssistant(a._id)}>Assign</button>
                                        </div>
                                      );
                                    }

                                    if (canManage) {
                                      if (!hasSubjectAssistants) {
                                        return <button className="md-remove-btn" onClick={() => removeAssistant(a._id)}>Remove</button>;
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
                                            timeIntervals={1}
                                            dateFormat="Pp"
                                            className="md-datepicker-input"
                                            placeholderText="New deadline (optional)"
                                            portalId="root"
                                          />
                                          <button className="md-assign-btn" onClick={() => changeAssistant(a._id)}>Change</button>
                                          <button className="md-remove-btn" onClick={() => removeAssistant(a._id)}>Remove</button>
                                        </div>
                                      );
                                    }

                                    return null;
                                  })()}
                                </td>
                              </tr>

                              {/* ── EXPANDED DETAIL PANEL ── */}
                              {isExpanded && (
                                <tr className="md-detail-row">
                                  <td colSpan={8} className="md-detail-cell">
                                    <div className="md-detail-panel">
                                      <div className="md-detail-panel-top">
                                      <div className="md-detail-grid">

                                        <div className="md-detail-item">
                                          <span className="md-detail-label">Due Date</span>
                                          <span className="md-detail-value">
                                            {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "—"}
                                          </span>
                                        </div>

                                        {countsSpinning ? (
                                          ["Submissions","Not Turned In","On Time","Late","Returned"].map((label) => (
                                            <div className="md-detail-item" key={label}>
                                              <span className="md-detail-label">{label}</span>
                                              <span className="md-counts-spinner" />
                                            </div>
                                          ))
                                        ) : counts === null ? (
                                          ["Submissions","Not Turned In","On Time","Late", "Returned"].map((label) => (
                                            <div className="md-detail-item" key={label}>
                                              <span className="md-detail-label">{label}</span>
                                              <span className="md-no-assistants">Error</span>                                            </div>
                                          ))
                                        ) : (
                                          <>
                                            <div className="md-detail-item">
                                              <span className="md-detail-label">Submissions</span>
                                              <span className="md-count-pill md-count-pill--blue">
                                                {counts.submitted}
                                              </span>                                            
                                            </div>
                                            <div className="md-detail-item">
                                              <span className="md-detail-label">Not Turned In</span>
                                              <span className="md-count-pill md-count-pill--red">{counts.notTurnedIn}</span>
                                            </div>
                                            <div className="md-detail-item">
                                              <span className="md-detail-label">On Time</span>
                                              <span className="md-count-pill md-count-pill--green">{counts.onTime}</span>
                                            </div>
                                            <div className="md-detail-item">
                                              <span className="md-detail-label">Late</span>
                                              <span className="md-count-pill md-count-pill--orange">{counts.late}</span>
                                            </div>
                                            <div className="md-detail-item">
                                              <span className="md-detail-label">Returned</span>
                                              <span className="md-count-pill md-count-pill--orange">{counts.returned}</span>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        className="md-submission-viewer-btn"
                                        onClick={() => goToSubmissionViewer(a)}
                                      >
                                        <FiBarChart2 size={14} />
                                        Go to submission viewer
                                      </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>

                )}
                <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
              </div>
            </div>
          )}

          {!selectedStatus && !contextLoading && (
        <div className="tch-empty md-dashboard-hint">
          <div className="tch-empty-icon">
            <FiBookOpen size={28} />
          </div>
          <h3>Select a status above</h3>
          <p>Choose Unassigned, Assigned, Failed Deadline, or Done to view and manage assignments.</p>
        </div>
      )}

      <div className="md-dashboard-refresh">
        <button
          type="button"
          className="tch-btn tch-btn--ghost"
          onClick={() => {
            loadBriefing();
            if (classroomIds.length) fetchPage(page);
          }}
          disabled={briefingLoading || contextLoading}
        >
          <FiRefreshCw size={15} />
          Refresh
        </button>
      </div>
    </div>
  );
}