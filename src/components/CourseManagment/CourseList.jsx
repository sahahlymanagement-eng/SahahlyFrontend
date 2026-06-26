import { useState, useMemo } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FiSearch, FiX } from "react-icons/fi";
import "./CourseManagement.css";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

export default function CoursesList() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const handleToggleCourse = async (courseId, currentStatus) => {
    try {
      await api.patch(`/google-classroom/courses/${courseId}/toggle-active`, {
        active: !currentStatus,
      });

      toast.success(
        `Course ${!currentStatus ? "enabled" : "disabled"} successfully`
      );

      fetchPage(page); // refresh current page
    } catch (error) {
      toast.error("Failed to update course status");
    }
  };

  // Get user once
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const role = user?.roleId?.name?.toLowerCase();

  const listParams = useMemo(() => {
    if (role === "admin" && search) return { search };
    return {};
  }, [role, search]);

const url =
  role === "admin"
    ? "/google-classroom/courses"
    : role === "manager"
      ? "/google-classroom/courses/manager"
      : `/google-classroom/teacher-courses/${user?.id}`;

const { data: courses, page, totalPages, total, loading, fetchPage } =
  usePagination(url, listParams, 6);

  const runSearch = () => {
    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") runSearch();
  };

  const teacherLabel = (course) => {
    const t = course.teacherId;
    if (!t) return null;
    if (typeof t === "object") return t.name || t.email || null;
    return null;
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header" >
          <button className="pm-back-btn" style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              color: "#6b7280",
            }} 
          onClick={() => navigate(-1)}>
                    ← Back
                  </button>

            <h2 style={{position: "absolute",left: "50%",transform: "translateX(-50%)",margin: 0 }} >Courses</h2> 
{/* 
            {(role === "manager")&&
            <button
              className="pm-back"
              onClick={() => navigate("/manager/google-classroom")}
            >
              + New Course
            </button>
}
            { role === "admin" &&
            <button
              className="pm-back"
              onClick={() => navigate("/director/google-classroom")}
            >
              + New Course
            </button>
} */}
        </header>

        {role === "admin" && (
          <div className="cm-search-bar">
            <input
              className="cm-search-input"
              type="search"
              placeholder="Search by name, section, teacher, ID, status…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button type="button" className="cm-search-btn" onClick={runSearch}>
              <FiSearch size={15} />
              Search
            </button>
            {search ? (
              <button type="button" className="cm-search-clear" onClick={clearSearch}>
                <FiX size={15} />
                Clear
              </button>
            ) : null}
            {search ? (
              <span className="cm-search-meta">
                {total} result{total === 1 ? "" : "s"} for &ldquo;{search}&rdquo;
              </span>
            ) : null}
          </div>
        )}

        {loading ? (
          <div className="pm-loading-panel">
            <p>Loading courses...</p>
          </div>
        ) : (
          <>
            <div className="pm-questions">
              {!courses.length && (
                <div className="cm-search-empty">
                  {search
                    ? `No courses match "${search}". Try another term or clear the search.`
                    : "No courses found."}
                </div>
              )}
              {courses.map((course) => (
                <div
                  key={course.googleCourseId || course.id || course._id}
                  className="pm-question-card"
                >
                  <div className="pm-q-header">
                    <span className="pm-q-number">
                      {course.name}
                    {role === "admin" && (
  <div className="course-toggle">
    <label className="switch">
      <input
        type="checkbox"
        checked={course.active}
        onChange={() =>
          handleToggleCourse(
            course.googleCourseId || course.id || course._id,
            course.active
          )
        }
      />
      <span className="slider round"></span>
    </label>

    <span>
      {course.active ? "Active" : "Inactive"}
    </span>
  </div>
)}  
                    </span>
                  </div>

                  <p style={{ opacity: 0.6 }}>
                    {course.section || "No section"}
                  </p>

                  {role === "admin" && teacherLabel(course) && (
                    <p style={{ opacity: 0.75, marginTop: 4 }}>
                      Teacher: {teacherLabel(course)}
                    </p>
                  )}

            
                    <button
                      className="pm-mark-btn"
                      style={{ marginTop: 12 }}
                        onClick={() =>
                        navigate(
                          role === "manager"
                            ? `/manager/coursework/${
                            course.googleCourseId || course.id}`
                            : role === "admin"
                            ? `/director/coursework/${
                            course.googleCourseId || course.id}`
                            : `/teacher/coursework/${
                            course.googleCourseId || course.id}`
                        )
                      }>
                      Create Coursework
                    </button>
                    
                    <button
                      className="pm-mark-btn"
                      onClick={() =>
                        navigate(
                          role === "manager"
                            ? `/manager/view-coursework/${course.googleCourseId || course.id}`
                            : role === "admin"
                            ? `/director/view-coursework/${course.googleCourseId || course.id}`
                            : `/teacher/view-coursework/${course.googleCourseId || course.id}`,
                          { state: { courseName: course.name } }
                        )
                      }
                    >
                       View Coursework
                    </button> 

                </div>
              ))}
              <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
            </div>
          </>       
        )}

      </div>
    </div>
  );
}