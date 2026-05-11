import { useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";

export default function SubmissionActions() {
  const { courseId, courseWorkId, submissionId } = useParams();

  const [assignedGrade, setAssignedGrade] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Attach PDF
  const handleAttach = async () => {
    setLoading(true);
    try {

      await api.post("/google-classroom/attachments", {
        courseId,
        courseWorkId,
        submissionId,
        attachments: [
          {
            driveFile: {
              id: "1wFZ5oIyAeIaEGbe5cAh4HqfWZ8aD84N5" // hardcoded
            }
          }
        ]
      });

      toast.success("PDF attached successfully");

    } catch (err) {
      toast.error(err.response?.data?.error || "Attach failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Update grade
  const handleGrade = async () => {
    if (!assignedGrade) {
      return toast.warn("Enter the grade");
    }

    setLoading(true);

    try {
      await api.patch("/google-classroom/grade", {
        courseId,
        courseWorkId,
        submissionId,
        assignedGrade: assignedGrade ? Number(assignedGrade) : undefined
      });

      toast.success("Grade updated");

    } catch (err) {
      toast.error(err.response?.data?.error || "Grading failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h2>Submission Actions</h2>
        </header>

        <div className="pm-panel">

          {/* ATTACHMENT */}
          <div className="pm-input-group">
            <label className="pm-input-label">Attach Marked PDF</label>

            <button
              className="pm-mark-btn"
              onClick={handleAttach}
              disabled={loading}
            >
              {loading ? "Uploading..." : "Attach PDF"}
            </button>
          </div>


          {/* ASSIGNED GRADE */}
          <div className="pm-input-group">
            <label className="pm-input-label">Assigned Grade</label>
            <input
              type="number"
              className="pm-input"
              value={assignedGrade}
              onChange={(e) => setAssignedGrade(e.target.value)}
              placeholder="e.g. 75"
            />
          </div>

          {/* SUBMIT */}
          <button
            className="pm-mark-btn"
            onClick={handleGrade}
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            {loading ? "Saving..." : "Update Grade"}
          </button>

        </div>

      </div>
    </div>
  );
}