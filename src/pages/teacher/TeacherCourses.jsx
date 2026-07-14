import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import {
  FiBookOpen,
  FiChevronRight,
  FiEye,
  FiPlus,
  FiSearch,
} from "react-icons/fi";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";
import { TeacherPageHeader, TeacherLoading, TeacherEmpty } from "./TeacherUI";
import "./teacher.css";

const STAT_LABELS = [
  "Submissions",
  "Not Turned In",
  "On Time",
  "Late",
  "Returned",
];

function formatGoogleDue(cw) {
  if (!cw?.dueDate) return "—";
  const { month, day, year } = cw.dueDate;
  return `${month}/${day}/${year}`;
}

function SubmissionDetailGrid({ counts }) {
  const spinning = counts === "loading" || counts === undefined;

  if (spinning) {
    return (
      <div className="tch-detail-grid">
        {STAT_LABELS.map((label) => (
          <div className="tch-detail-item" key={label}>
            <span className="tch-detail-label">{label}</span>
            <span className="tch-counts-spinner" />
          </div>
        ))}
      </div>
    );
  }

  if (counts === null) {
    return (
      <div className="tch-detail-grid">
        {STAT_LABELS.map((label) => (
          <div className="tch-detail-item" key={label}>
            <span className="tch-detail-label">{label}</span>
            <span className="tch-detail-error">Error</span>
          </div>
        ))}
      </div>
    );
  }

  if (!counts) {
    return (
      <p className="tch-stats-hint">
        Submission stats appear once this assignment is tracked in Sahahly.
      </p>
    );
  }

  const items = [
    { label: "Submissions", value: counts.submitted, tone: "blue" },
    { label: "Not Turned In", value: counts.notTurnedIn, tone: "red" },
    { label: "On Time", value: counts.onTime, tone: "green" },
    { label: "Late", value: counts.late, tone: "orange" },
    { label: "Returned", value: counts.returned, tone: "orange" },
  ];

  return (
    <div className="tch-detail-grid">
      {items.map((item) => (
        <div className="tch-detail-item" key={item.label}>
          <span className="tch-detail-label">{item.label}</span>
          <span className={`tch-count-pill tch-count-pill--${item.tone}`}>
            {item.value ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TeacherCourses() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [search, setSearch] = useState("");
  const [expandedCourses, setExpandedCourses] = useState({});
  const [expandedAssignments, setExpandedAssignments] = useState({});
  const [courseCache, setCourseCache] = useState({});
  const [submissionCounts, setSubmissionCounts] = useState({});

  const { data: courses, page, totalPages, total, loading, fetchPage } =
    usePagination(`/google-classroom/teacher-courses/${user?.id}`, {}, 12);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((course) => {
      const name = (course.name || "").toLowerCase();
      const section = (course.section || "").toLowerCase();
      return name.includes(q) || section.includes(q);
    });
  }, [courses, search]);

  const courseIdOf = (course) => course.googleCourseId || course.id || course._id;

  const loadCourseAssignments = async (courseId) => {
    setCourseCache((prev) => ({
      ...prev,
      [courseId]: { ...prev[courseId], loading: true, error: null },
    }));

    try {
      const [courseworkRes, dbRes] = await Promise.all([
        api.get("/google-classroom/coursework", {
          params: { courseId, page: 1, limit: 100 },
        }),
        api.get(`/assignments/by-google-course/${courseId}`),
      ]);

      const excluded = new Set(dbRes.data?.excludedGoogleCourseWorkIds || []);
      const dbMap = {};
      for (const row of dbRes.data?.data || []) {
        if (row.googleCourseWorkId) dbMap[row.googleCourseWorkId] = row;
      }

      const assignments = (courseworkRes.data?.data || []).filter(
        (cw) => !excluded.has(cw.id)
      );

      setCourseCache((prev) => ({
        ...prev,
        [courseId]: {
          loading: false,
          error: null,
          assignments,
          dbMap,
        },
      }));
    } catch (err) {
      setCourseCache((prev) => ({
        ...prev,
        [courseId]: {
          loading: false,
          error: err.response?.data?.message || "Failed to load assignments",
          assignments: [],
          dbMap: {},
        },
      }));
    }
  };

  const toggleCourse = (courseId) => {
    const opening = !expandedCourses[courseId];
    setExpandedCourses((prev) => ({ ...prev, [courseId]: opening }));
    if (opening && !courseCache[courseId]?.assignments) {
      loadCourseAssignments(courseId);
    }
  };

  const loadCountsForAssignment = async (assignmentId) => {
    if (submissionCounts[assignmentId] !== undefined) return;

    setSubmissionCounts((prev) => ({ ...prev, [assignmentId]: "loading" }));

    try {
      const res = await api.post("/assignment-submissions/batch-counts", {
        assignmentIds: [assignmentId],
      });
      setSubmissionCounts((prev) => ({
        ...prev,
        [assignmentId]: res.data?.[assignmentId] ?? null,
      }));
    } catch {
      setSubmissionCounts((prev) => ({ ...prev, [assignmentId]: null }));
    }
  };

  const toggleAssignment = (assignmentId) => {
    if (!assignmentId) return;
    const opening = !expandedAssignments[assignmentId];
    setExpandedAssignments((prev) => ({ ...prev, [assignmentId]: opening }));
    if (opening) loadCountsForAssignment(assignmentId);
  };

  return (
    <div className="tch-page tch-page--wide">
      <TeacherPageHeader
        eyebrow="Course management"
        title="My courses"
        subtitle={`${total} Google Classroom course${total === 1 ? "" : "s"} — expand a classroom to see assignment submission stats`}
        backTo="/teacher/dashboard"
        backLabel="Dashboard"
      />

      <div className="tch-search-bar">
        <div className="tch-search-wrap">
          <FiSearch className="tch-search-icon" size={16} />
          <input
            className="tch-search-input"
            type="search"
            placeholder="Search by course name or section…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <TeacherLoading message="Loading your courses…" />
      ) : filteredCourses.length === 0 ? (
        <TeacherEmpty
          icon={<FiBookOpen />}
          title={search ? "No courses match your search" : "No courses yet"}
          description={
            search
              ? "Try a different search term or clear the filter."
              : "Courses assigned to you in Google Classroom will appear here."
          }
          action={
            search ? (
              <button
                type="button"
                className="tch-btn tch-btn--secondary"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            ) : (
              <button
                type="button"
                className="tch-btn tch-btn--primary"
                onClick={() => navigate("/teacher/dashboard")}
              >
                Back to dashboard
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="tch-classroom-list">
            {filteredCourses.map((course, i) => {
              const id = courseIdOf(course);
              const isExpanded = !!expandedCourses[id];
              const cache = courseCache[id];
              const assignmentCount = cache?.assignments?.length;

              return (
                <div
                  key={id}
                  className="tch-classroom-block"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="tch-classroom-row">
                    <button
                      type="button"
                      className={`tch-expand-btn ${isExpanded ? "tch-expand-btn--open" : ""}`}
                      onClick={() => toggleCourse(id)}
                      aria-label={isExpanded ? "Collapse classroom" : "Expand classroom"}
                    >
                      <FiChevronRight size={16} />
                    </button>

                    <div className="tch-classroom-main">
                      <div className="tch-course-icon tch-course-icon--sm">
                        <FiBookOpen />
                      </div>
                      <div>
                        <h3 className="tch-classroom-name">{course.name}</h3>
                        <p className="tch-classroom-section">
                          {course.section || "No section"}
                          {cache?.assignments
                            ? ` · ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="tch-classroom-actions">
                      <button
                        type="button"
                        className="tch-btn tch-btn--primary"
                        onClick={() =>
                          navigate(`/teacher/coursework/${id}`, {
                            state: { courseName: course.name },
                          })
                        }
                      >
                        <FiPlus size={15} />
                        Create
                      </button>
                      <button
                        type="button"
                        className="tch-btn tch-btn--secondary"
                        onClick={() =>
                          navigate(`/teacher/view-coursework/${id}`, {
                            state: { courseName: course.name },
                          })
                        }
                      >
                        <FiEye size={15} />
                        View all
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="tch-classroom-panel">
                      {cache?.loading ? (
                        <TeacherLoading message="Loading assignments…" />
                      ) : cache?.error ? (
                        <p className="tch-detail-error">{cache.error}</p>
                      ) : !cache?.assignments?.length ? (
                        <p className="tch-stats-hint">No assignments in this classroom yet.</p>
                      ) : (
                        <div className="tch-assign-table-wrap">
                          <table className="tch-assign-table sah-table--cards">
                            <thead>
                              <tr>
                                <th style={{ width: 44 }} />
                                <th>Assignment</th>
                                <th>Due date</th>
                                <th>Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cache.assignments.map((cw) => {
                                const dbAssignment = cache.dbMap[cw.id];
                                const mongoId = dbAssignment?._id;
                                const rowKey = mongoId || cw.id;
                                const isAssignExpanded = !!expandedAssignments[rowKey];
                                const counts = mongoId
                                  ? submissionCounts[mongoId]
                                  : undefined;

                                return (
                                  <Fragment key={cw.id}>
                                    <tr className="tch-assign-row">
                                      <td>
                                        <button
                                          type="button"
                                          className={`tch-expand-btn tch-expand-btn--sm ${
                                            isAssignExpanded ? "tch-expand-btn--open" : ""
                                          }`}
                                          onClick={() => toggleAssignment(mongoId || rowKey)}
                                          disabled={!mongoId}
                                          title={
                                            mongoId
                                              ? "View submission stats"
                                              : "Stats available after Sahahly tracks this assignment"
                                          }
                                        >
                                          <FiChevronRight size={14} />
                                        </button>
                                      </td>
                                      <td data-label="Assignment">
                                        <span className="tch-assign-title">{cw.title}</span>
                                      </td>
                                      <td data-label="Due date">{formatGoogleDue(cw)}</td>
                                      <td data-label="Points">{cw.maxPoints ? cw.maxPoints : "Ungraded"}</td>
                                    </tr>

                                    {isAssignExpanded && mongoId && (
                                      <tr className="tch-assign-detail-row">
                                        <td colSpan={4}>
                                          <div className="tch-detail-panel">
                                            <SubmissionDetailGrid counts={counts} />
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!search && (
            <div style={{ marginTop: 28 }}>
              <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
