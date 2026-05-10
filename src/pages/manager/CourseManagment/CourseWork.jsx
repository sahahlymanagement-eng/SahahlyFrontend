import { useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";

export default function Coursework() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxPoints, setMaxPoints] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title) {
      return toast.warn("Title is required");
    }
    if (maxPoints === "" || maxPoints === null || maxPoints === undefined) {
      return toast.warn("Max Points is required");
    }

    setLoading(true);

    try {
      await api.post("/google-classroom/coursework", {
        courseId,
        courseworkData: {
          title,
          description,
          maxPoints: Number(maxPoints)
        }
      });

      toast.success("Coursework created successfully");

      setTitle("");
      setDescription("");
      setMaxPoints("");

      // optional: go back to courses
      // navigate("/manager/courses");

    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create coursework");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        {/* HEADER */}
        <header className="pm-header">
          <h2>Create Coursework</h2>

          <div className="pm-header-right">
            {state?.courseName && (
              <div className="pm-powered-by">
                {state.courseName}
              </div>
            )}

            <button
              className="pm-back"
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          </div>
        </header>

        {/* FORM PANEL */}
        <div className="pm-panel">

          <div className="pm-input-group">
            <label className="pm-input-label">Title</label>
            <input
              className="pm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Assignment 1: Forces"
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Description</label>
            <textarea
              className="pm-input pm-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions for students..."
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Max Points</label>
            <input
              type="number"
              className="pm-input"
              value={maxPoints}
              onChange={(e) => setMaxPoints(e.target.value)}
              placeholder="e.g. 100"
            />
          </div>

          <button
            className="pm-mark-btn"
            onClick={handleCreate}
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            {loading ? "Creating..." : "Create Coursework"}
          </button>

        </div>

      </div>
    </div>
  );
}