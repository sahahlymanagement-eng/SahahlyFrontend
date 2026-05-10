import { useState } from "react";
import api from "../../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";
import { useNavigate } from "react-router-dom";

export default function CreateCourse() {
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name) {
      return toast.warn("Course name is required");
    }

    setLoading(true);

    try {
      await api.post("/google-classroom/courses", {
        courseData: {
          name,
          section,
          description,
        }
      });

      toast.success("Course created successfully");

      setName("");
      setSection("");
      setDescription("");

    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create course");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h2>Create Google Classroom Course</h2>
        </header>

          <div className="pm-header-right">
            <button className="pm-back" onClick={() => navigate("/manager/courses")}>
              View Courses
            </button>
          </div>

        <div className="pm-panel">

          <div className="pm-input-group">
            <label className="pm-input-label">Course Name</label>
            <input
              className="pm-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Fundamentals"
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Section</label>
            <input
              className="pm-input"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. Section A"
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Description</label>
            <textarea
              className="pm-input pm-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Course description..."
            />
          </div>

          <button
            className="pm-mark-btn"
            onClick={handleCreate}
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            {loading ? "Creating..." : "Create Course"}
          </button>

        </div>


      </div>
    </div>
  );
}