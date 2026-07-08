import { useMemo, useState, useEffect } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FiSearch,
  FiX,
  FiChevronDown,
  FiChevronRight,
  FiFolder,
  FiPlus,
  FiArrowLeft,
  FiBookOpen,
  FiEye,
  FiTrash2,
} from "react-icons/fi";
import "./CourseManagement.css";
import { usePagination } from "../../hooks/usePagination";
import ReportTeacherFilterSelect from "../ReportTeacherFilterSelect";
import { useReportTeacherOptions } from "../../hooks/useReportTeacherFilter";
import { confirmToast } from "../../utils/confirmToast";

const UNASSIGNED_KEY = "__unassigned__";

function teacherFromCourse(course) {
  const t = course.teacherId;
  if (!t || typeof t !== "object") {
    return { id: UNASSIGNED_KEY, name: "Unassigned", email: null };
  }
  return {
    id: String(t._id || t.id || UNASSIGNED_KEY),
    name: t.name || "Unassigned",
    email: t.email || null,
  };
}

function groupCoursesByTeacher(courses) {
  const map = new Map();

  for (const course of courses) {
    const teacher = teacherFromCourse(course);
    if (!map.has(teacher.id)) {
      map.set(teacher.id, { ...teacher, courses: [] });
    }
    map.get(teacher.id).courses.push(course);
  }

  return [...map.values()].sort((a, b) => {
    if (a.id === UNASSIGNED_KEY) return 1;
    if (b.id === UNASSIGNED_KEY) return -1;
    return a.name.localeCompare(b.name);
  });
}

function courseId(course) {
  return course.googleCourseId || course.id || course._id;
}

export default function CoursesList() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState({});
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [allTeachers, setAllTeachers] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.roleId?.name?.toLowerCase();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isFolderView = isAdmin || isManager;

  useEffect(() => {
    if (!isFolderView) return;
    api.get("/people/teachers")
      .then((r) => setAllTeachers(r.data || []))
      .catch(() => {});
  }, [isFolderView]);

  const listParams = useMemo(() => {
    const params = {};
    if (isManager && user?.id) params.personId = user.id;
    if (search) params.search = search;
    if (teacherFilter !== "all") params.teacherId = teacherFilter;
    return params;
  }, [isManager, user?.id, search, teacherFilter]);

  const url = isAdmin
    ? "/google-classroom/courses"
    : isManager
      ? "/google-classroom/courses/manager"
      : `/google-classroom/teacher-courses/${user?.id}`;

  const { data: courses, loading, fetchPage, page } = usePagination(
    url,
    listParams,
    500,
    "data",
    isManager ? !!user?.id : true
  );

  const teacherFolders = useMemo(
    () => (isFolderView ? groupCoursesByTeacher(courses) : []),
    [courses, isFolderView]
  );

  const teacherOptions = useReportTeacherOptions(isFolderView ? false : true, allTeachers, courses);

  const totalCourses = courses.length;

  const runSearch = () => setSearch(searchInput.trim());
  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: prev[folderId] === false,
    }));
  };

  const isFolderOpen = (folderId) => expandedFolders[folderId] !== false;

  const handleToggleCourse = async (id, currentStatus) => {
    try {
      await api.patch(`/google-classroom/courses/${id}/toggle-active`, {
        active: !currentStatus,
      });
      toast.success(`Course ${!currentStatus ? "enabled" : "disabled"} successfully`);
      fetchPage(page);
    } catch {
      toast.error("Failed to update course status");
    }
  };

  const handleDeleteClassroom = async (course) => {
    const mongoId = course._id;
    if (!mongoId) {
      toast.error("Cannot delete: missing classroom id");
      return;
    }

    const confirmed = await confirmToast(
      `Permanently delete "${course.name}" and all of its assignments, submissions, marking results, attendance, and manager assignments? This cannot be undone.`,
      {
        title: "Delete classroom",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        danger: true,
      }
    );
    if (!confirmed) return;

    setDeletingId(mongoId);
    try {
      await api.delete(`/classrooms/${mongoId}`);
      toast.success(`"${course.name}" and all related items were deleted`);
      fetchPage(page);
    } catch {
      toast.error("Failed to delete classroom");
    } finally {
      setDeletingId(null);
    }
  };

  const basePath = isManager ? "/manager" : isAdmin ? "/director" : "/teacher";

  const goCreateCoursework = (course) => {
    navigate(`${basePath}/coursework/${courseId(course)}`);
  };

  const goViewCoursework = (course) => {
    navigate(`${basePath}/view-coursework/${courseId(course)}`, {
      state: { courseName: course.name },
    });
  };

  return (
    <div className="cm-courses-page">
      <header className="cm-courses-header">
        <button type="button" className="cm-courses-back" onClick={() => navigate(-1)}>
          <FiArrowLeft />
          Back
        </button>

        <div className="cm-courses-header-main">
          <h1>Course management</h1>
          <p>
            {isManager
              ? "Classrooms assigned to you, grouped by teacher"
              : isAdmin
                ? "All classrooms grouped by teacher"
                : "Your Google Classroom courses"}
          </p>
        </div>

        <div className="cm-courses-header-actions">
          {(isManager || isAdmin) && (
            <button
              type="button"
              className="cm-courses-btn cm-courses-btn--primary"
              onClick={() => navigate(`${basePath}/google-classroom`)}
            >
              <FiPlus />
              New course
            </button>
          )}
        </div>
      </header>

      {isFolderView && (
        <div className="cm-search-bar">
          <ReportTeacherFilterSelect
            show
            value={teacherFilter}
            onChange={setTeacherFilter}
            teachers={teacherOptions}
            className="cm-search-input cm-teacher-filter"
          />
          <FiSearch className="cm-search-icon" />
          <input
            className="cm-search-input"
            type="search"
            placeholder="Search teacher, course name, or section…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <button type="button" className="cm-search-btn" onClick={runSearch}>
            Search
          </button>
          {search ? (
            <button type="button" className="cm-search-clear" onClick={clearSearch}>
              <FiX size={15} />
              Clear
            </button>
          ) : null}
        </div>
      )}

      {isFolderView && !loading && (
        <div className="cm-courses-summary">
          <span>{teacherFolders.length} teachers</span>
          <span>{totalCourses} classrooms</span>
        </div>
      )}

      {loading ? (
        <div className="cm-courses-loading">Loading courses…</div>
      ) : isFolderView ? (
        !teacherFolders.length ? (
          <div className="cm-search-empty">
            {search
              ? `No courses match "${search}".`
              : isManager
                ? "No classrooms are assigned to you yet."
                : "No courses found."}
          </div>
        ) : (
          <div className="cm-folder-list">
            {teacherFolders.map((folder) => {
              const open = isFolderOpen(folder.id);
              return (
                <section key={folder.id} className="cm-folder">
                  <button
                    type="button"
                    className="cm-folder-header"
                    onClick={() => toggleFolder(folder.id)}
                  >
                    <span className="cm-folder-icon">
                      {open ? <FiChevronDown /> : <FiChevronRight />}
                    </span>
                    <span className="cm-folder-avatar">
                      {folder.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="cm-folder-info">
                      <strong>{folder.name}</strong>
                      {folder.email ? (
                        <span className="cm-folder-email">{folder.email}</span>
                      ) : null}
                    </span>
                    <span className="cm-folder-count">
                      <FiFolder />
                      {folder.courses.length} course{folder.courses.length === 1 ? "" : "s"}
                    </span>
                  </button>

                  {open && (
                    <div className="cm-folder-body">
                      {folder.courses.map((course) => (
                        <article key={courseId(course)} className="cm-course-card">
                          <div className="cm-course-card-top">
                            <div>
                              <h3>{course.name}</h3>
                              <p>{course.section || "No section"}</p>
                            </div>
                            {isAdmin && (
                              <div className="cm-course-toggle">
                                <label className="switch">
                                  <input
                                    type="checkbox"
                                    checked={course.active !== false}
                                    onChange={() =>
                                      handleToggleCourse(courseId(course), course.active !== false)
                                    }
                                  />
                                  <span className="slider round" />
                                </label>
                                <span>{course.active !== false ? "Active" : "Inactive"}</span>
                              </div>
                            )}
                          </div>

                          <div className="cm-course-actions">
                            <button
                              type="button"
                              className="cm-courses-btn cm-courses-btn--primary"
                              onClick={() => goCreateCoursework(course)}
                            >
                              <FiBookOpen />
                              Create coursework
                            </button>
                            <button
                              type="button"
                              className="cm-courses-btn cm-courses-btn--secondary"
                              onClick={() => goViewCoursework(course)}
                            >
                              <FiEye />
                              View coursework
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                className="cm-courses-btn cm-courses-btn--danger"
                                onClick={() => handleDeleteClassroom(course)}
                                disabled={deletingId === course._id}
                              >
                                <FiTrash2 />
                                {deletingId === course._id ? "Deleting…" : "Delete classroom"}
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div className="cm-legacy-list">
          {courses.map((course) => (
            <article key={courseId(course)} className="cm-course-card">
              <h3>{course.name}</h3>
              <p>{course.section || "No section"}</p>
              <div className="cm-course-actions">
                <button
                  type="button"
                  className="cm-courses-btn cm-courses-btn--primary"
                  onClick={() => goCreateCoursework(course)}
                >
                  Create coursework
                </button>
                <button
                  type="button"
                  className="cm-courses-btn cm-courses-btn--secondary"
                  onClick={() => goViewCoursework(course)}
                >
                  View coursework
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
