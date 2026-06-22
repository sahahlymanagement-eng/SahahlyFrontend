import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";

export default function ViewCoursework() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const [courseworkList, setCourseworkList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoursework = async () => {
      try {
        const res = await api.get(`/google-classroom/coursework?courseId=${courseId}`);
        setCourseworkList(res.data || []);
      } catch (err) {
        toast.error(err.response?.data?.error || "Failed to load coursework");
      } finally {
        setLoading(false);
      }
    };

    fetchCoursework();
  }, [courseId]);

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h2>Coursework</h2>
          <div className="pm-header-actions">
            {state?.courseName && (
              <div className="pm-powered-by">{state.courseName}</div>
            )}
            <button className="pm-back" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>
        </header>

        {loading ? (
          <div className="pm-loading-panel"><p>Loading...</p></div>
        ) : courseworkList.length === 0 ? (
          <div className="pm-loading-panel"><p>No coursework found.</p></div>
        ) : (
          <div className="pm-questions">
            {courseworkList.map((cw) => (
              <div key={cw.id} className="pm-question-card">
                <div className="pm-q-header">
                  <span className="pm-q-number">{cw.title}</span>
                </div>
                {cw.description && (
                  <p style={{ opacity: 0.6 }}>{cw.description}</p>
                )}
                <p style={{ opacity: 0.5, fontSize: 13 }}>
                  {cw.maxPoints ? `Max Points: ${cw.maxPoints}` : "Ungraded"}
                  {cw.dueDate
                    ? ` · Due: ${cw.dueDate.month}/${cw.dueDate.day}/${cw.dueDate.year}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}