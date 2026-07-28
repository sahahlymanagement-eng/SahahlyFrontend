import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import { usePagination } from "../../hooks/usePagination";
import usePersistedState from "../../hooks/usePersistedState";
import Pagination from "../../components/Pagination";
import { AssistantPageHeader } from "./AssistantUI";

import { FiSend, FiSearch, FiCheckCircle, FiRotateCcw, FiAlertCircle } from "react-icons/fi";

export default function AssistantAssignments() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  // const [assignments, setAssignments] = useState([]);
  // const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = usePersistedState("assistant:assignments:status", "ALL");
  const [classroomFilter, setClassroomFilter] = usePersistedState("assistant:assignments:classroom", "ALL");
  const [search, setSearch] = usePersistedState("assistant:assignments:search", "");
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

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

    if (role !== "assistant") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsed);
  }, [navigate]);

  /* HELPERS */

    const params = useMemo(() => ({
    personId: user?.id,
    status: statusFilter,
    classroom: classroomFilter,
    search
  }), [user?.id, statusFilter, classroomFilter, search]);

  const { data: assignments, page, totalPages, loading, fetchPage } =
    usePagination(
      "/assignment-workflow/assistant/assignments", 
      params,
      10,
      "data",
      !!user?.id );

  /* LOAD */

  // const loadAssignments = async (personId) => {
  //   try {
  //     setLoading(true);

  //     const res = await api.get(
  //       "/assignment-workflow/assistant/assignments",
  //       {
  //         params: { personId },
  //       }
  //     );

  //     const baseAssignments = Array.isArray(res.data)
  //       ? res.data
  //       : [];

  //     const enriched = await Promise.all(
  //       baseAssignments.map(async (assignment) => {
  //         const done = await getAllStudentsGraded(
  //           assignment._id
  //         );

  //         return {
  //           ...assignment,
  //           allStudentsGraded: done,
  //         };
  //       })
  //     );

  //     setAssignments(enriched);
  //   } catch (err) {
  //     toast.error(
  //       err.response?.data?.message ||
  //         "Failed to load assignments"
  //     );
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // useEffect(() => {
  //   if (!user?.id) return;

  //   loadAssignments(user.id);
  // }, [user?.id]);

  const updateAssignmentStatus = async (assignmentId, status) => {
    try {
      setUpdatingStatusId(assignmentId);
      await api.post(
        `/assignment-workflow/assistant/assignments/${assignmentId}/status`,
        { personId: user.id, status }
      );
      toast.success(
        status === "DONE"
          ? "Marked as done — manager notified"
          : "Returned to assigned — manager notified"
      );
      fetchPage(page);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const formatAssistantStatus = (status) =>
    String(status || "ASSIGNED")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

  const statusBadgeClass = (status) => {
    switch (status) {
      case "DONE":
      case "DONE_BY_QUALITY":
        return "ast-badge--done";
      case "FAILED_DEADLINE":
        return "ast-badge--failed";
      default:
        return "ast-badge--assigned";
    }
  };

  const canOpenWorkflow = (status) =>
    ["ASSIGNED", "DONE", "FAILED_DEADLINE", "RECHECK_BY_ASSISTANT"].includes(status);

  const showManagerContactNotice = () => {
    toast.info(
      <div className="ast-manager-toast">
        <div className="ast-manager-toast-icon" aria-hidden="true">
          <FiAlertCircle size={22} />
        </div>
        <div className="ast-manager-toast-body">
          <p className="ast-manager-toast-title">Deadline passed</p>
          <p className="ast-manager-toast-text">Please contact your manager</p>
        </div>
      </div>,
      {
        autoClose: 4500,
        className: "ast-manager-toast-wrap",
        icon: false,
      }
    );
  };

  const openWorkflowOrNotify = (assistantStatus, path) => {
    if (assistantStatus === "FAILED_DEADLINE") {
      showManagerContactNotice();
      return;
    }
    navigate(path);
  };

  const workflowBtnClass = (assistantStatus) =>
    `ast-table-btn${assistantStatus === "FAILED_DEADLINE" ? " ast-table-btn--blocked" : ""}`;

  /* SUBMIT */

  const submitAssignment = async (id) => {
    try {
      await api.post(
        `/assignment-workflow/assistant/assignments/${id}/submit`,
        {
          personId: user.id,
        }
      );

      toast.success("Submitted to Quality Team");

      fetchPage(page);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Submit failed"
      );
    }
  };

  /* FILTERED DATA */

  // const filteredAssignments = useMemo(() => {
  //   return assignments.filter((assignment) => {
  //     const teacherName =
  //       assignment.classroomId?.teacherId?.name || "";

  //     if (
  //       statusFilter !== "ALL" &&
  //       assignment.assistantStatus !== statusFilter
  //     ) {
  //       return false;
  //     }

  //     if (
  //       classroomFilter !== "ALL" &&
  //       assignment.classroomId?.name !== classroomFilter
  //     ) {
  //       return false;
  //     }

  //     if (search) {
  //       const s = search.toLowerCase();

  //       return (
  //         assignment.title?.toLowerCase().includes(s) ||
  //         teacherName.toLowerCase().includes(s) ||
  //         assignment.classroomId?.name
  //           ?.toLowerCase()
  //           .includes(s)
  //       );
  //     }

  //     return true;
  //   });
  // }, [
  //   assignments,
  //   statusFilter,
  //   classroomFilter,
  //   search,
  // ]);

  /* UNIQUE CLASSROOMS */

  const classrooms = useMemo(() => {
    const classroomSet = new Set();

    assignments.forEach((assignment) => {
      if (assignment.classroomId?.name) {
        classroomSet.add(assignment.classroomId.name);
      }
    });

    return Array.from(classroomSet);
  }, [assignments]);

  if (!user) return null;

  return (
    <div className="ast-page ast-page--wide">
      <AssistantPageHeader
        eyebrow="Workflow"
        title="My Assignments"
        subtitle="Filter, open submissions, manage student data, and send reports"
      />

      <div className="ast-filters">
        <div className="ast-filter-block">
          <label>Status</label>
          <select
            className="ast-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Status</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="DONE">Done</option>
            <option value="FAILED_DEADLINE">Failed Deadline</option>
          </select>
        </div>

        <div className="ast-filter-block">
          <label>Classroom</label>
          <select
            className="ast-select"
            value={classroomFilter}
            onChange={(e) => setClassroomFilter(e.target.value)}
          >
            <option value="ALL">All Classrooms</option>
            {classrooms.map((classroom) => (
              <option key={classroom} value={classroom}>
                {classroom}
              </option>
            ))}
          </select>
        </div>

        <div className="ast-search">
          <FiSearch className="ast-search-icon" size={16} />
          <input
            placeholder="Search assignment, teacher, or classroom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="ast-table-card">
        <div className="ast-table-wrap">
        <table className="ast-table sah-table--cards">
          <thead>
            <tr>
              <th>Title</th>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Your Deadline</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Update Status</th>
              <th>Submissions</th>
              <th>Students Data</th>
              <th>Reports</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="10" className="ast-table-loading">
                  Loading assignments…
                </td>
              </tr>
            )}

            {/* {!loading &&
              filteredAssignments.length === 0 && (
                <tr>
                  <td
                    colSpan="8"
                    className="emptyRow"
                  >
                    No assignments found
                  </td>
                </tr>
              )} */}

            {assignments.map((assignment) => {
                const teacher =
                  assignment.classroomId?.teacherName ||
                  assignment.classroomId?.teacherId?.name ||
                  "-";
                const assistantStatus = assignment.assistantStatus || "ASSIGNED";
                const isUpdating = updatingStatusId === assignment._id;

                return (
                  <tr key={assignment._id}>
                    <td data-label="Title">{assignment.title}</td>

                    <td data-label="Classroom">
                      {assignment.classroomId?.name ||
                        "-"}
                    </td>

                    <td data-label="Teacher">{teacher}</td>

                    <td data-label="Your Deadline">
                      {assignment.assistantDeadline
                        ? new Date(
                            assignment.assistantDeadline
                          ).toLocaleString()
                        : "-"}
                    </td>

                    <td data-label="Due Date">
                      {assignment.dueDate
                        ? new Date(
                            assignment.dueDate
                          ).toLocaleString()
                        : "-"}
                    </td>

                    <td data-label="Status">
                      <span className={`ast-badge ${statusBadgeClass(assistantStatus)}`}>
                        {formatAssistantStatus(assistantStatus)}
                      </span>
                    </td>

                    <td data-label="Update Status">
                      {assistantStatus === "ASSIGNED" && (
                        <button
                          type="button"
                          className="ast-table-btn ast-table-btn--done"
                          disabled={isUpdating}
                          onClick={() => updateAssignmentStatus(assignment._id, "DONE")}
                        >
                          <FiCheckCircle />
                          {isUpdating ? "Updating…" : "Mark Done"}
                        </button>
                      )}
                      {assistantStatus === "DONE" && (
                        <button
                          type="button"
                          className="ast-table-btn ast-table-btn--reopen"
                          disabled={isUpdating}
                          onClick={() => updateAssignmentStatus(assignment._id, "ASSIGNED")}
                        >
                          <FiRotateCcw />
                          {isUpdating ? "Updating…" : "Mark Assigned"}
                        </button>
                      )}
                      {assistantStatus === "FAILED_DEADLINE" && (
                        <span className="ast-status-hint">Deadline passed</span>
                      )}
                    </td>

                    <td data-label="Submissions">
                      {canOpenWorkflow(assistantStatus) && (
                        <button
                          type="button"
                          className={workflowBtnClass(assistantStatus)}
                          onClick={() =>
                            openWorkflowOrNotify(
                              assistantStatus,
                              `/assistant/assignments/${assignment._id}`
                            )
                          }
                        >
                          <FiSend />
                          Open
                        </button>
                      )}
                    </td>

                    <td data-label="Students Data">
                      {canOpenWorkflow(assistantStatus) && (
                        <button
                          type="button"
                          className={workflowBtnClass(assistantStatus)}
                          onClick={() =>
                            openWorkflowOrNotify(
                              assistantStatus,
                              `/assistant/assignments/${assignment._id}/students`
                            )
                          }
                        >
                          <FiSend />
                          Data
                        </button>
                      )}
                    </td>
                    <td data-label="Reports">
                      {canOpenWorkflow(assistantStatus) && (
                        <button
                          type="button"
                          className={workflowBtnClass(assistantStatus)}
                          onClick={() =>
                            openWorkflowOrNotify(
                              assistantStatus,
                              "/assistant/reports"
                            )
                          }
                        >
                          <FiSend />
                          Reports
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
      </div>
    </div>
  );
}