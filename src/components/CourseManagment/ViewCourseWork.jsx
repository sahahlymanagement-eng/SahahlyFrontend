import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

export default function ViewCoursework() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.roleId?.name?.toLowerCase();
  const canDelete = role === "manager" || role === "admin" || role === "teacher";

  const [dbAssignments, setDbAssignments] = useState([]);
  const [excludedGoogleIds, setExcludedGoogleIds] = useState([]);
  const [dbLoading, setDbLoading] = useState(canDelete);
  const [deletingId, setDeletingId] = useState(null);

  const { data: courseworkList, page, totalPages, loading, fetchPage } =
    usePagination(`/google-classroom/coursework`, { courseId });

  const excludedSet = useMemo(
    () => new Set(excludedGoogleIds),
    [excludedGoogleIds]
  );

  const visibleCoursework = useMemo(
    () => courseworkList.filter((cw) => !excludedSet.has(cw.id)),
    [courseworkList, excludedSet]
  );

  const dbAssignmentByGoogleId = useMemo(() => {
    const map = {};
    for (const a of dbAssignments) {
      if (a.googleCourseWorkId) map[a.googleCourseWorkId] = a;
    }
    return map;
  }, [dbAssignments]);

  useEffect(() => {
    if (!canDelete || !courseId) {
      setDbLoading(false);
      return;
    }

    const loadDbAssignments = async () => {
      setDbLoading(true);
      try {
        const res = await api.get(`/assignments/by-google-course/${courseId}`);
        setDbAssignments(res.data?.data || []);
        setExcludedGoogleIds(res.data?.excludedGoogleCourseWorkIds || []);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load Sahahly assignments");
      } finally {
        setDbLoading(false);
      }
    };

    loadDbAssignments();
  }, [courseId, canDelete]);

  const handleDeleteAssignment = async (dbAssignment, googleCourseWorkId, title) => {
    const label = title || dbAssignment.title || "this assignment";
    const confirmed = window.confirm(
      `Delete "${label}" from Sahahly?\n\nThis removes delegations, marking results, and related data from our database. Google Classroom coursework is not affected, but it will be hidden from this list.`
    );
    if (!confirmed) return;

    setDeletingId(dbAssignment._id);
    try {
      await api.delete(`/assignments/${dbAssignment._id}`);
      setDbAssignments((prev) => prev.filter((a) => String(a._id) !== String(dbAssignment._id)));
      if (googleCourseWorkId) {
        setExcludedGoogleIds((prev) =>
          prev.includes(googleCourseWorkId) ? prev : [...prev, googleCourseWorkId]
        );
      }
      toast.success("Assignment deleted from Sahahly");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete assignment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h2>Coursework</h2>
          <div className="pm-header-actions">
            {state?.courseName && <div className="pm-powered-by">{state.courseName}</div>}
            <button className="pm-back" onClick={() => navigate(-1)}>← Back</button>
          </div>
        </header>

        {loading ? (
          <div className="pm-loading-panel"><p>Loading...</p></div>
        ) : visibleCoursework.length === 0 ? (
          <div className="pm-loading-panel"><p>No coursework found.</p></div>
        ) : (
          <>
            <div className="pm-questions">
              {visibleCoursework.map((cw) => {
                const dbAssignment = dbAssignmentByGoogleId[cw.id];
                const isDeleting = deletingId === dbAssignment?._id;

                return (
                  <div key={cw.id} className="pm-question-card">
                    <div className="pm-q-header">
                      <span className="pm-q-number">{cw.title}</span>
                    </div>
                    {cw.description && <p style={{ opacity: 0.6 }}>{cw.description}</p>}
                    <p style={{ opacity: 0.5, fontSize: 13 }}>
                      {cw.maxPoints ? `Max Points: ${cw.maxPoints}` : "Ungraded"}
                      {cw.dueDate ? ` · Due: ${cw.dueDate.month}/${cw.dueDate.day}/${cw.dueDate.year}` : ""}
                    </p>
                    {canDelete && (
                      dbLoading ? (
                        <p style={{ opacity: 0.5, fontSize: 13, marginTop: 12 }}>Checking Sahahly record…</p>
                      ) : dbAssignment ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteAssignment(dbAssignment, cw.id, cw.title)}
                          disabled={isDeleting || deletingId !== null}
                          style={{
                            marginTop: 12,
                            padding: "8px 16px",
                            borderRadius: 8,
                            border: "1px solid #ef4444",
                            background: "transparent",
                            color: "#ef4444",
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: isDeleting || deletingId !== null ? "not-allowed" : "pointer",
                            opacity: isDeleting || deletingId !== null ? 0.6 : 1,
                          }}
                        >
                          {isDeleting ? "Deleting…" : "Delete Assignment"}
                        </button>
                      ) : null
                    )}
                  </div>
                );
              })}
            </div>

            <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
          </>
        )}

      </div>
    </div>
  );
}
