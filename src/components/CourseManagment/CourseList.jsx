import { useEffect, useState } from "react";
import api from "../../api/api";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import "./CourseManagement.css";

export default function CoursesList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  // Get user once
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const role = user?.roleId?.name?.toLowerCase();

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      let url = null;

      // Manager → Google Classroom
      if (role === "manager" ||role === "admin" ) {
        url = "/google-classroom/courses";
      }

      // Teacher → DB courses
      else if (role === "teacher") {
        url = `/google-classroom/teacher-courses/${user.id}`;
      }

      // Safety check
      if (!url) {
        throw new Error("Invalid role or missing teacherId");
      }

      const res = await api.get(url);
      setCourses(res.data);
    } catch (err) {
      console.error(err);
      console.log(user.id);
      toast.error(err.message || "Failed to load courses");
    } finally {
      setLoading(false);
    }
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

        {loading ? (
          <div className="pm-loading-panel">
            <p>Loading courses...</p>
          </div>
        ) : (
          <div className="pm-questions">
            {courses.map((course) => (
              <div
                key={course.googleCourseId || course.id || course._id}
                className="pm-question-card"
              >
                <div className="pm-q-header">
                  <span className="pm-q-number">
                    {course.name}
                  </span>
                </div>

                <p style={{ opacity: 0.6 }}>
                  {course.section || "No section"}
                </p>

          
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
                    📋 View Coursework
                  </button> 

              </div>
            ))}
          </div>
                    
        )}

      </div>
    </div>
  );
}