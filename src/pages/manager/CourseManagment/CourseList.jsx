import { useEffect, useState } from "react";
import api from "../../../api/api";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import "./CourseManagement.css";

export default function CoursesList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const res = await api.get("/google-classroom/courses");
      setCourses(res.data);
    } catch {
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h2>Courses</h2>

          <button
            className="pm-back"
            onClick={() => navigate("/manager/google-classroom")}
          >
            + New Course
          </button>
        </header>

        {loading ? (
          <div className="pm-loading-panel">
            <p>Loading courses...</p>
          </div>
        ) : (
          <div className="pm-questions">
            {courses.map(course => (
              <div key={course.id} className="pm-question-card">

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
                    navigate(`/manager/coursework/${course.id}`)
                  }
                >
                  Create Coursework
                </button>

              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}