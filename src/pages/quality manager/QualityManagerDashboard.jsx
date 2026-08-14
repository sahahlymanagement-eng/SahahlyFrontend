import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import "./QualityManagerDashboard.css";

import {
  FiShield,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
  FiUserCheck,
  FiLogOut,
  FiChevronDown,
  FiSearch,
} from "react-icons/fi";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";

export default function QualityManagerDashboard() {
  const navigate = useNavigate();
  const period = useDashboardPeriod();
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [qualityMembersMap, setQualityMembersMap] = useState({});
  const [classroomTeacherMap, setClassroomTeacherMap] = useState({});
  const [classroomNameMap, setClassroomNameMap] = useState({});
  const [selectedQuality, setSelectedQuality] = useState({});
  const [changeQualitySelected, setChangeQualitySelected] = useState({});
  const [changeQualityDeadline, setChangeQualityDeadline] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classroomFilter, setClassroomFilter] = useState("ALL");
  const [teacherFilter, setTeacherFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [submissionCounts, setSubmissionCounts] = useState({});
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (storedUser) setUser(storedUser);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadDashboard();
  }, [user?.id, period.params.from, period.params.to]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/quality-manager/dashboard`, {
        params: { managerId: user.id, ...period.params },
      });
      const { assignments, delegations, classrooms, qualityMembersMap } = res.data;
      setAssignments(assignments);
      setDelegations(delegations);
      setQualityMembersMap(qualityMembersMap || {});
      const teacherMap = {};
      const nameMap = {};
      classrooms.forEach((c) => {
        teacherMap[c._id] = c.teacherId?.name || "Not Assigned";
        nameMap[c._id] = c.name;
      });
      setClassroomTeacherMap(teacherMap);
      setClassroomNameMap(nameMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const assignQuality = async (assignmentId) => {
    try {
      const personId = selectedQuality[assignmentId];
      if (!personId) return;
      setActionLoading((p) => ({ ...p, [assignmentId]: true }));
      await api.post("/quality-manager/assign-quality", {
        assignmentId,
        qualityPersonId: personId,
        qualityManagerId: user.id,
      });
      setSelectedQuality((prev) => ({ ...prev, [assignmentId]: "" }));
      await loadDashboard();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading((p) => ({ ...p, [assignmentId]: false }));
    }
  };

  const changeQuality = async (assignmentId) => {
    try {
      const personId = changeQualitySelected[assignmentId];
      if (!personId) return;
      setActionLoading((p) => ({ ...p, [assignmentId]: true }));
      await api.put("/quality-manager/change-quality", {
        assignmentId,
        qualityPersonId: personId,
        qualityManagerId: user.id,
        qualityDeadline: changeQualityDeadline[assignmentId] || undefined,
      });
      setChangeQualitySelected((p) => ({ ...p, [assignmentId]: "" }));
      setChangeQualityDeadline((p) => ({ ...p, [assignmentId]: "" }));
      await loadDashboard();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading((p) => ({ ...p, [assignmentId]: false }));
    }
  };

  const removeQuality = async (assignmentId) => {
    if (!window.confirm("Remove quality team member from this assignment?")) return;
    try {
      setActionLoading((p) => ({ ...p, [assignmentId]: true }));
      await api.delete("/quality-manager/remove-quality", {
        data: { assignmentId, qualityManagerId: user.id },
      });
      await loadDashboard();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading((p) => ({ ...p, [assignmentId]: false }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const getRelatedDelegations = (assignmentId) =>
    delegations.filter(
      (d) => d.assignmentId === assignmentId || d.assignmentId?._id === assignmentId
    );

  const tableRows = useMemo(() => {
    return assignments.map((a) => {
      const related = getRelatedDelegations(a._id);
      const assistants = related.filter((d) => d.role === "assistant");
      const qualityTeam = related.filter((d) => d.role === "quality team");
      const classroomId = typeof a.classroomId === "object" ? a.classroomId?._id : a.classroomId;
      return {
        ...a,
        classroomKey: classroomId,
        classroomName: classroomNameMap[classroomId] || "Unknown",
        teacherName: classroomTeacherMap[classroomId] || "Not Assigned",
        assistants,
        qualityTeam,
      };
    });
  }, [assignments, delegations, classroomNameMap, classroomTeacherMap]);

  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (classroomFilter !== "ALL" && row.classroomName !== classroomFilter) return false;
      if (teacherFilter !== "ALL" && row.teacherName !== teacherFilter) return false;
      if (search.trim()) {
        const text = [
          row.title, row.classroomName, row.teacherName, row.status,
          ...row.assistants.map((a) => a.personId?.name),
          ...row.qualityTeam.map((q) => q.personId?.name),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [tableRows, statusFilter, classroomFilter, teacherFilter, search]);

  const stats = useMemo(() => ({
    done: tableRows.filter((a) => a.status === "DONE").length,
    doneByQuality: tableRows.filter((a) => a.status === "DONE_BY_QUALITY").length,
    doneByQualityLate: tableRows.filter((a) => a.status === "DONE_BY_QUALITY_LATE").length,
    pendingQuality: tableRows.filter((a) => a.qualityTeam.length === 0).length,
  }), [tableRows]);

  const classrooms = useMemo(() =>
    [...new Set(tableRows.map((r) => r.classroomName).filter(Boolean))].sort(),
    [tableRows]
  );

  const teachers = useMemo(() =>
    [...new Set(tableRows.map((r) => r.teacherName).filter(Boolean))].sort(),
    [tableRows]
  );

  const statusOptions = [
    "UNASSIGNED", "ASSIGNED", "IN_REVIEW", "RECHECK_BY_ASSISTANT",
    "IN_REVIEW_AFTER_RECHECK", "EMERGENCY", "DONE", "DONE_BY_QUALITY", "DONE_BY_QUALITY_LATE",
  ];

  const loadCountsForAssignment = async (assignmentId) => {
    if (submissionCounts[assignmentId] !== undefined) return;
    try {
      setSubmissionCounts((prev) => ({ ...prev, [assignmentId]: "loading" }));
      const res = await api.post("/assignment-submissions/batch-counts", {
        assignmentIds: [assignmentId],
      });
      const payload = res.data?.[assignmentId];
      if (payload?.gone) {
        setExpandedRows((prev) => ({ ...prev, [assignmentId]: false }));
        await loadDashboard();
        return;
      }
      setSubmissionCounts((prev) => ({
        ...prev,
        [assignmentId]: payload || null,
      }));
    } catch {
      setSubmissionCounts((prev) => ({ ...prev, [assignmentId]: null }));
    }
  };

  const toggleRow = (id) => {
    const opening = !expandedRows[id];
    setExpandedRows((prev) => ({ ...prev, [id]: opening }));
    if (opening) loadCountsForAssignment(id);
  };

  if (!user) return null;

  return (
    <div className="qm2-root">

      {/* TOP NAV */}
      <header className="qm2-nav">
        <div className="qm2-nav-brand">
          <div className="qm2-nav-icon"><FiShield size={18} /></div>
          <span className="qm2-nav-title">Quality Control</span>
        </div>
        <div className="qm2-nav-right">
          <div className="qm2-user-pill">
            <div className="qm2-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
            <span>{user.name}</span>
          </div>
          <button className="qm2-logout-btn" onClick={handleLogout}>
            <FiLogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="qm2-main">

        <div className="qm2-page-head">
          <div>
            <h1 className="qm2-page-title">Quality Manager Dashboard</h1>
            <p className="qm2-page-sub">Monitor assignments, trace assistants, and assign quality reviewers</p>
          </div>
        </div>

        <DashboardPeriodFilter
          from={period.from}
          to={period.to}
          setFrom={period.setFrom}
          setTo={period.setTo}
          resetToThisMonth={period.resetToThisMonth}
          monthLabel={period.monthLabel}
        />

        {/* STATS */}
        <div className="qm2-stats">
          <StatCard2 icon={<FiCheckCircle />} label="Done" value={stats.done} accent="var(--success)" />
          <StatCard2 icon={<FiUserCheck />} label="Done by Quality" value={stats.doneByQuality} accent="var(--primary)" />
          <StatCard2 icon={<FiAlertTriangle />} label="Done by Quality Late" value={stats.doneByQualityLate} accent="var(--warning)" />
          <StatCard2 icon={<FiClock />} label="Pending Quality" value={stats.pendingQuality} accent="var(--danger)" />
        </div>

        {/* FILTERS */}
        <div className="qm2-filters-row">
          <div className="qm2-search-wrap">
            <FiSearch size={14} className="qm2-search-icon" />
            <input
              className="qm2-search"
              placeholder="Search assignments, teachers, assistants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="qm2-selects">
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "ALL", label: "All Statuses" }, ...statusOptions.map((s) => ({ value: s, label: formatStatus(s) }))]}
            />
            <FilterSelect
              label="Classroom"
              value={classroomFilter}
              onChange={setClassroomFilter}
              options={[{ value: "ALL", label: "All Classrooms" }, ...classrooms.map((c) => ({ value: c, label: c }))]}
            />
            <FilterSelect
              label="Teacher"
              value={teacherFilter}
              onChange={setTeacherFilter}
              options={[{ value: "ALL", label: "All Teachers" }, ...teachers.map((t) => ({ value: t, label: t }))]}
            />
          </div>
        </div>

        {/* TABLE */}
        <div className="qm2-table-wrap">
          {loading ? (
            <div className="qm2-loading">
              <div className="qm2-spinner" />
              <span>Loading dashboard…</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="qm2-empty">No assignments match your filters.</div>
          ) : (
            /* Scroller inside the rounded box: .qm2-table-wrap uses
               overflow:hidden to clip its radius and can't also scroll. */
            <div className="sah-table-scroll">
            <table className="qm2-table sah-table--cards">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Classroom</th>
                  <th>Assignment</th>
                  <th>Assistant(s)</th>
                  <th>Quality Team</th>
                  <th>Status</th>
                  <th>Quality Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((a) => {
                  const isExpanded = !!expandedRows[a._id];
                  const counts = submissionCounts[a._id];
                  const spinning = counts === "loading" || counts === undefined;
                  const isActioning = !!actionLoading[a._id];

                  const firstAssistant = a.assistants[0];
                  const firstQuality = a.qualityTeam[0];
                  const assistantDeadline = firstAssistant?.assistantDeadline;
                  const qualityDeadline = firstQuality?.qualityDeadline;

                  const members = qualityMembersMap[a._id] || [];
                  const hasQualityMembers = members.length > 0;
                  const hasQualityAssigned = a.qualityTeam.length > 0;

                  return (
                    <>
                      {/* ── MAIN ROW ── */}
                      <tr key={a._id} className="qm2-row">

                        <td>
                          <button
                            className={`qm2-expand-btn ${isExpanded ? "qm2-expand-btn--open" : ""}`}
                            onClick={() => toggleRow(a._id)}
                            title="Show details"
                          >
                            <FiChevronDown size={14} />
                          </button>
                        </td>

                        <td data-label="Classroom"><span className="qm2-bold">{a.classroomName}</span></td>

                        <td data-label="Assignment"><span className="qm2-assignment-title">{a.title}</span></td>

                        <td data-label="Assistant(s)">
                          {a.assistants.length ? (
                            <div className="qm2-tags">
                              {a.assistants.map((d) => (
                                <span key={d._id} className="qm2-tag qm2-tag--assistant">
                                  {d.personId?.name}
                                </span>
                              ))}
                            </div>
                          ) : <span className="qm2-muted">Not Assigned</span>}
                        </td>

                        <td data-label="Quality Team">
                          {a.qualityTeam.length ? (
                            <div className="qm2-tags">
                              {a.qualityTeam.map((d) => (
                                <span key={d._id} className="qm2-tag qm2-tag--quality">
                                  {d.personId?.name}
                                </span>
                              ))}
                            </div>
                          ) : <span className="qm2-muted">Not Assigned</span>}
                        </td>

                        <td data-label="Status">
                          <span className={`qm2-badge qm2-badge--${a.status}`}>
                            {formatStatus(a.status)}
                          </span>
                        </td>

                        <td data-label="Quality Action">
                          {isActioning ? (
                            <span className="qm2-muted">Saving…</span>
                          ) : !hasQualityAssigned ? (
                            <div className="qm2-assign-cell">
                              {hasQualityMembers ? (
                                <>
                                  <div className="qm2-select-wrap">
                                    <select
                                      className="qm2-select"
                                      value={selectedQuality[a._id] || ""}
                                      onChange={(e) =>
                                        setSelectedQuality((prev) => ({ ...prev, [a._id]: e.target.value }))
                                      }
                                    >
                                      <option value="">Select member</option>
                                      {members.map((q) => (
                                        <option key={q.personId._id} value={q.personId._id}>
                                          {q.personId.name}
                                        </option>
                                      ))}
                                    </select>
                                    <FiChevronDown className="qm2-select-arrow" size={12} />
                                  </div>
                                  <button className="qm2-assign-btn" onClick={() => assignQuality(a._id)}>
                                    Assign
                                  </button>
                                </>
                              ) : (
                                <span className="qm2-muted">No members available</span>
                              )}
                            </div>
                          ) : (
                            <div className="qm2-manage-cell">
                              {hasQualityMembers && (
                                <div className="qm2-change-row">
                                  <div className="qm2-select-wrap">
                                    <select
                                      className="qm2-select"
                                      value={changeQualitySelected[a._id] || ""}
                                      onChange={(e) =>
                                        setChangeQualitySelected((prev) => ({ ...prev, [a._id]: e.target.value }))
                                      }
                                    >
                                      <option value="">Change member</option>
                                      {members.map((q) => (
                                        <option key={q.personId._id} value={q.personId._id}>
                                          {q.personId.name}
                                        </option>
                                      ))}
                                    </select>
                                    <FiChevronDown className="qm2-select-arrow" size={12} />
                                  </div>
                                  <input
                                    type="datetime-local"
                                    className="qm2-deadline-input"
                                    value={changeQualityDeadline[a._id] || ""}
                                    onChange={(e) =>
                                      setChangeQualityDeadline((prev) => ({ ...prev, [a._id]: e.target.value }))
                                    }
                                  />
                                  <button className="qm2-assign-btn" onClick={() => changeQuality(a._id)}>
                                    Change
                                  </button>
                                </div>
                              )}
                              <button className="qm2-remove-btn" onClick={() => removeQuality(a._id)}>
                                Remove
                              </button>
                            </div>
                          )}
                        </td>

                      </tr>

                      {/* ── EXPANDED PANEL ── */}
                      {isExpanded && (
                        <tr key={`${a._id}-detail`} className="qm2-detail-row">
                          <td colSpan={7}>
                            <div className="qm2-detail-panel">

                              {/* Details section */}
                              <div className="qm2-detail-section">
                                <span className="qm2-detail-section-label">Details</span>
                                <div className="qm2-detail-grid">

                                  <div className="qm2-detail-item">
                                    <span className="qm2-detail-label">Teacher</span>
                                    <span className="qm2-detail-value">{a.teacherName}</span>
                                  </div>

                                  <div className="qm2-detail-item">
                                    <span className="qm2-detail-label">Due Date</span>
                                    <span className="qm2-detail-value">
                                      {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "—"}
                                    </span>
                                  </div>

                                  <div className="qm2-detail-item">
                                    <span className="qm2-detail-label">Asst. Deadline</span>
                                    <span className="qm2-detail-value">
                                      {assistantDeadline ? new Date(assistantDeadline).toLocaleString() : "—"}
                                    </span>
                                  </div>

                                  <div className="qm2-detail-item">
                                    <span className="qm2-detail-label">Quality Deadline</span>
                                    <span className="qm2-detail-value">
                                      {qualityDeadline ? new Date(qualityDeadline).toLocaleString() : "—"}
                                    </span>
                                  </div>

                                </div>
                              </div>

                              {/* Submissions section */}
                              <div className="qm2-detail-section">
                                <span className="qm2-detail-section-label">Submissions</span>
                                <div className="qm2-detail-grid">
                                  {spinning ? (
                                    ["Submitted", "Not Turned In", "On Time", "Late", "Returned"].map((l) => (
                                      <div className="qm2-detail-item" key={l}>
                                        <span className="qm2-detail-label">{l}</span>
                                        <span className="qm2-counts-spinner" />
                                      </div>
                                    ))
                                  ) : counts?.gone ? (
                                    <div className="qm2-detail-item">
                                      <span className="qm2-detail-label">Submissions</span>
                                      <span className="qm2-muted">Removed from Google Classroom</span>
                                    </div>
                                  ) : counts?.unpublished ? (
                                    <div className="qm2-detail-item">
                                      <span className="qm2-detail-label">Submissions</span>
                                      <span className="qm2-muted">Not published</span>
                                    </div>
                                  ) : counts === null ? (
                                    <div className="qm2-detail-item">
                                      <span className="qm2-detail-label">Submissions</span>
                                      <span className="qm2-muted">Could not load stats</span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="qm2-detail-item">
                                        <span className="qm2-detail-label">Submitted</span>
                                        <span className="qm2-count-pill qm2-count-pill--blue">{counts.submitted}</span>
                                      </div>
                                      <div className="qm2-detail-item">
                                        <span className="qm2-detail-label">Not Turned In</span>
                                        <span className="qm2-count-pill qm2-count-pill--red">{counts.notTurnedIn}</span>
                                      </div>
                                      <div className="qm2-detail-item">
                                        <span className="qm2-detail-label">On Time</span>
                                        <span className="qm2-count-pill qm2-count-pill--green">{counts.onTime}</span>
                                      </div>
                                      <div className="qm2-detail-item">
                                        <span className="qm2-detail-label">Late</span>
                                        <span className="qm2-count-pill qm2-count-pill--orange">{counts.late}</span>
                                      </div>
                                      <div className="qm2-detail-item">
                                        <span className="qm2-detail-label">Returned</span>
                                        <span className="qm2-count-pill qm2-count-pill--purple">{counts.returned}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="qm2-footer-count">
          Showing <strong>{filteredRows.length}</strong> of <strong>{tableRows.length}</strong> assignments
        </div>

      </main>
    </div>
  );
}

function StatCard2({ icon, label, value, accent }) {
  return (
    <div className="qm2-stat" style={{ "--accent": accent }}>
      <div className="qm2-stat-top">
        <div
          className="qm2-stat-icon"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
        >
          {icon}
        </div>
        <span className="qm2-stat-label">{label}</span>
      </div>
      <div className="qm2-stat-value">{value}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="qm2-filter-group">
      <label className="qm2-filter-label">{label}</label>
      <div className="qm2-select-wrap">
        <select
          className="qm2-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <FiChevronDown className="qm2-select-arrow" size={12} />
      </div>
    </div>
  );
}

function formatStatus(s) {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}