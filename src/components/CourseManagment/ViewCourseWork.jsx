import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { confirmToast } from "../../utils/confirmToast";
import "./CourseManagement.css";
import "../../pages/teacher/teacher.css";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";
import { TeacherPageHeader, TeacherLoading, TeacherEmpty } from "../../pages/teacher/TeacherUI";
import { FiCalendar, FiAward, FiEdit3, FiTrash2, FiPlus } from "react-icons/fi";

export default function ViewCoursework() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.roleId?.name?.toLowerCase();
  const canDelete = role === "manager" || role === "admin" || role === "teacher";
  const canEdit = canDelete;
  const showSubmissionStats = role === "teacher";
  const isTeacherShell = role === "teacher";

  const [dbAssignments, setDbAssignments] = useState([]);
  const [excludedGoogleIds, setExcludedGoogleIds] = useState([]);
  const [dbLoading, setDbLoading] = useState(canDelete || showSubmissionStats);
  const [deletingId, setDeletingId] = useState(null);
  const [submissionCounts, setSubmissionCounts] = useState({});

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
    if ((!canDelete && !showSubmissionStats) || !courseId) {
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
  }, [courseId, canDelete, showSubmissionStats]);

  useEffect(() => {
    if (!showSubmissionStats || dbLoading) return;

    const assignmentIds = visibleCoursework
      .map((cw) => dbAssignmentByGoogleId[cw.id]?._id)
      .filter(Boolean);

    const missing = assignmentIds.filter((id) => submissionCounts[id] === undefined);
    if (!missing.length) return;

    let cancelled = false;

    const loadCounts = async () => {
      setSubmissionCounts((prev) => {
        const next = { ...prev };
        missing.forEach((id) => {
          next[id] = "loading";
        });
        return next;
      });

      try {
        const res = await api.post("/assignment-submissions/batch-counts", {
          assignmentIds: missing,
        });

        if (cancelled) return;

        setSubmissionCounts((prev) => {
          const next = { ...prev };
          missing.forEach((id) => {
            next[id] = res.data?.[id] ?? null;
          });
          return next;
        });
      } catch {
        if (cancelled) return;
        setSubmissionCounts((prev) => {
          const next = { ...prev };
          missing.forEach((id) => {
            next[id] = null;
          });
          return next;
        });
      }
    };

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [showSubmissionStats, dbLoading, visibleCoursework, dbAssignmentByGoogleId, page]);

  const handleEditAssignment = (googleCourseWorkId) => {
    const editPath =
      role === "manager"
        ? `/manager/coursework/${courseId}/edit/${googleCourseWorkId}`
        : role === "admin"
          ? `/director/coursework/${courseId}/edit/${googleCourseWorkId}`
          : `/teacher/coursework/${courseId}/edit/${googleCourseWorkId}`;

    navigate(editPath, { state: { courseName: state?.courseName } });
  };

  const handleDeleteAssignment = async (dbAssignment, googleCourseWorkId, title) => {
    const label = title || dbAssignment.title || "this assignment";
    const confirmed = await confirmToast(
      `Delete "${label}" from Sahahly?\n\nThis removes delegations, marking results, and related data from our database. Google Classroom coursework is not affected, but it will be hidden from this list.`,
      { title: "Delete assignment", confirmLabel: "Delete", danger: true }
    );    if (!confirmed) return;

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

  if (isTeacherShell) {
    return (
      <div className="tch-page tch-page--wide">
        <TeacherPageHeader
          eyebrow={state?.courseName || "Course"}
          title="Assignments"
          subtitle="View submission stats, edit details, or remove assignments from Sahahly"
          breadcrumbs={[
            { label: "Dashboard", to: "/teacher/dashboard" },
            { label: "My courses", to: "/teacher/courses" },
            { label: state?.courseName || "Coursework" },
          ]}
          actions={
            <button
              type="button"
              className="tch-btn tch-btn--primary"
              onClick={() =>
                navigate(`/teacher/coursework/${courseId}`, {
                  state: { courseName: state?.courseName },
                })
              }
            >
              <FiPlus size={15} />
              New assignment
            </button>
          }
        />

        {loading ? (
          <TeacherLoading message="Loading assignments…" />
        ) : visibleCoursework.length === 0 ? (
          <TeacherEmpty
            icon={<FiAward />}
            title="No assignments yet"
            description="Create your first assignment for this course."
            action={
              <button
                type="button"
                className="tch-btn tch-btn--primary"
                onClick={() =>
                  navigate(`/teacher/coursework/${courseId}`, {
                    state: { courseName: state?.courseName },
                  })
                }
              >
                <FiPlus size={15} />
                Create assignment
              </button>
            }
          />
        ) : (
          <>
            <div className="tch-assignment-list">
              {visibleCoursework.map((cw, i) => {
                const dbAssignment = dbAssignmentByGoogleId[cw.id];
                const isDeleting = deletingId === dbAssignment?._id;

                return (
                  <article
                    key={cw.id}
                    className="tch-assignment-card"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <div className="tch-assignment-header">
                      <h3 className="tch-assignment-title">{cw.title}</h3>
                      <span className="tch-meta-pill">
                        {cw.maxPoints ? `${cw.maxPoints} pts` : "Ungraded"}
                      </span>
                    </div>

                    <div className="tch-assignment-meta">
                      {cw.dueDate && (
                        <span>
                          <FiCalendar size={13} />
                          Due {cw.dueDate.month}/{cw.dueDate.day}/{cw.dueDate.year}
                        </span>
                      )}
                      <span>
                        <FiAward size={13} />
                        {cw.maxPoints ? "Graded" : "Ungraded"}
                      </span>
                    </div>

                    {cw.description ? (
                      <p className="tch-assignment-desc">{cw.description}</p>
                    ) : null}

                    {dbAssignment?.assignmentWebLink && (
                      <a
                        href={dbAssignment.assignmentWebLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          marginBottom: 8,
                          fontSize: 13,
                        }}
                      >
                        📄 View worksheet
                      </a>
                    )}

                    {dbLoading ? (
                      <p className="tch-stats-hint">Loading submission stats…</p>
                    ) : dbAssignment ? (
                      <TeacherSubmissionStats counts={submissionCounts[dbAssignment._id]} />
                    ) : (
                      <p className="tch-stats-hint">
                        Stats appear once this assignment is tracked in Sahahly.
                      </p>
                    )}

                    <div className="tch-assignment-footer">
                      <button
                        type="button"
                        className="tch-btn tch-btn--secondary"
                        onClick={() => handleEditAssignment(cw.id)}
                      >
                        <FiEdit3 size={14} />
                        Edit
                      </button>
                      {dbAssignment ? (
                        <button
                          type="button"
                          className="tch-btn tch-btn--danger"
                          onClick={() => handleDeleteAssignment(dbAssignment, cw.id, cw.title)}
                          disabled={isDeleting || deletingId !== null}
                        >
                          <FiTrash2 size={14} />
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
            <div style={{ marginTop: 24 }}>
              <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <h1>Coursework</h1>
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

                    {dbAssignment?.assignmentWebLink && (
                      <p style={{ margin: "4px 0" }}>
                        <a
                          href={dbAssignment.assignmentWebLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13 }}
                        >
                          📄 View worksheet
                        </a>
                      </p>
                    )}

                    {showSubmissionStats && (
                      dbLoading ? (
                        <p className="vcw-stats-hint">Loading submission stats…</p>
                      ) : dbAssignment ? (
                        <SubmissionStats counts={submissionCounts[dbAssignment._id]} />
                      ) : (
                        <p className="vcw-stats-hint">
                          Submission stats appear after this assignment is created in Sahahly.
                        </p>
                      )
                    )}

                    {canEdit && (
                      <div className="vcw-actions">
                        <button
                          type="button"
                          className="vcw-edit-btn"
                          onClick={() => handleEditAssignment(cw.id)}
                        >
                          Edit Assignment
                        </button>

                        {canDelete && (
                          dbLoading ? (
                            <p className="vcw-stats-hint">Checking Sahahly record…</p>
                          ) : dbAssignment ? (
                            <button
                              type="button"
                              className="vcw-delete-btn"
                              onClick={() => handleDeleteAssignment(dbAssignment, cw.id, cw.title)}
                              disabled={isDeleting || deletingId !== null}
                            >
                              {isDeleting ? "Deleting…" : "Delete Assignment"}
                            </button>
                          ) : null
                        )}
                      </div>
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

function TeacherSubmissionStats({ counts }) {
  if (counts === "loading") {
    return <p className="tch-stats-hint">Loading submission stats…</p>;
  }
  if (counts === null) {
    return <p className="tch-stats-hint">Could not load submission stats.</p>;
  }
  if (!counts) return null;

  const items = [
    { label: "Submitted", value: counts.submitted, tone: "blue" },
    { label: "Not in", value: counts.notTurnedIn, tone: "red" },
    { label: "On time", value: counts.onTime, tone: "green" },
    { label: "Late", value: counts.late, tone: "orange" },
    { label: "Returned", value: counts.returned, tone: "orange" },
  ];

  return (
    <div className="tch-stats-grid">
      {items.map((item) => (
        <div className="tch-stats-item" key={item.label}>
          <span className="tch-stats-label">{item.label}</span>
          <span className={`tch-stats-pill tch-stats-pill--${item.tone}`}>
            {item.value ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

function SubmissionStats({ counts }) {
  if (counts === "loading") {
    return <p className="vcw-stats-hint">Loading submission stats…</p>;
  }

  if (counts === null) {
    return <p className="vcw-stats-hint vcw-stats-hint--error">Could not load submission stats.</p>;
  }

  if (!counts) return null;

  const items = [
    { label: "Submissions", value: counts.submitted, tone: "blue" },
    { label: "Not Turned In", value: counts.notTurnedIn, tone: "red" },
    { label: "On Time", value: counts.onTime, tone: "green" },
    { label: "Late", value: counts.late, tone: "orange" },
    { label: "Returned", value: counts.returned, tone: "orange" },
  ];

  return (
    <div className="vcw-stats">
      <span className="vcw-stats-title">Submissions</span>
      <div className="vcw-stats-grid">
        {items.map((item) => (
          <div className="vcw-stats-item" key={item.label}>
            <span className="vcw-stats-label">{item.label}</span>
            <span className={`vcw-stats-pill vcw-stats-pill--${item.tone}`}>
              {item.value ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
