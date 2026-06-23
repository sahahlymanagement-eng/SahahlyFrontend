import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import "./AssistantAssignments.css";

import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";


import {
  FiArrowLeft,
  FiFilter,
  FiSend,
  FiSearch,
} from "react-icons/fi";

export default function AssistantAssignments() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  // const [assignments, setAssignments] = useState([]);
  // const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [classroomFilter, setClassroomFilter] = useState("ALL");
  const [search, setSearch] = useState("");

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
    <div className="assistantAssignPage">
      {/* HEADER */}

      <div className="assistantAssignHeader">
        <h2>My Assignments</h2>

        <button
          className="assistantAssignBack"
          onClick={() =>
            navigate("/assistant/dashboard")
          }
        >
          <FiArrowLeft /> Back
        </button>
      </div>

      {/* FILTER BAR */}

      <div className="assistantAssignFilters">
        {/* STATUS FILTER */}

        <div className="filterBlock">
          <label>Status</label>

          <div className="customSelect">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
            >
              <option value="ALL">
                All Status
              </option>
              <option value="ASSIGNED">
                Assigned
              </option>
              <option value="DONE">
                Done
              </option>
            </select>
          </div>
        </div>

        {/* CLASSROOM FILTER */}

        <div className="filterBlock">
          <label>Classroom</label>

          <div className="customSelect">
            <select
              value={classroomFilter}
              onChange={(e) =>
                setClassroomFilter(e.target.value)
              }
            >
              <option value="ALL">
                All Classrooms
              </option>

              {classrooms.map((classroom) => (
                <option
                  key={classroom}
                  value={classroom}
                >
                  {classroom}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* SEARCH */}

        <div className="searchBox">
          <input
            placeholder="Search assignment..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>
      </div>

      {/* TABLE */}

      <div className="assistantAssignTableWrapper">
        <table className="assistantAssignTable">
          <thead>
            <tr>
              <th>Title</th>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Your Deadline</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Submissions</th>
              <th>Students Data</th>
              <th>Reports</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan="8"
                  className="loadingRow"
                >
                  Loading assignments...
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

            {assignments.map(
              (assignment) => {
                const teacher =
                  assignment.classroomId
                    ?.teacherName ||
                  assignment.classroomId
                    ?.teacherId?.name ||
                  "-";

                return (
                  <tr key={assignment._id}>
                    <td>{assignment.title}</td>

                    <td>
                      {assignment.classroomId?.name ||
                        "-"}
                    </td>

                    <td>{teacher}</td>

                    <td>
                      {assignment.assistantDeadline
                        ? new Date(
                            assignment.assistantDeadline
                          ).toLocaleString()
                        : "-"}
                    </td>

                    <td>
                      {assignment.dueDate
                        ? new Date(
                            assignment.dueDate
                          ).toLocaleString()
                        : "-"}
                    </td>

                    <td>
                      <span
                        className={`statusBadge ${
                          assignment.allStudentsGraded
                            ? "status-DONE"
                            : "status-ASSIGNED"
                        }`}
                      >
                        {assignment.allStudentsGraded
                          ? "DONE"
                          : "ASSIGNED"}
                      </span>
                    </td>

                    <td>
                      {(assignment.assistantStatus ===
                        "ASSIGNED" ||
                        assignment.assistantStatus ===
                          "RECHECK_BY_ASSISTANT") && (
                        <button
                          className="submitBtn"
                          onClick={() =>
                            navigate(
                              `/assistant/assignments/${assignment._id}`
                            )
                          }
                        >
                          <FiSend />
                          Open
                        </button>
                      )}
                    </td>

                    <td>
                      {(assignment.assistantStatus ===
                        "ASSIGNED" ||
                        assignment.assistantStatus ===
                          "RECHECK_BY_ASSISTANT") && (
                        <button
                          className="submitBtn"
                          onClick={() =>
                            navigate(
                              `/assistant/assignments/${assignment._id}/students`
                            )
                          }
                        >
                          <FiSend />
                          Data
                        </button>
                      )}
                    </td>
                    <td>
                      {(assignment.assistantStatus ===
                        "ASSIGNED" ||
                        assignment.assistantStatus ===
                          "RECHECK_BY_ASSISTANT") && (
                        <button
                          className="submitBtn"
                          onClick={() =>
                            navigate(
                              `/assistant/assignments/${assignment._id}/students/reports`
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
              }
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
      </div>
    </div>
  );
}