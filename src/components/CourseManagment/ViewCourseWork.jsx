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
import { isDirectorLikeRole, roleShellPath } from "../../utils/directorLikeAccess";
import { FiPlus, FiAward, FiEdit3, FiTrash2, FiCalendar } from "react-icons/fi";

function formatScheduledTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function scheduledTimeMs(cw) {
  if (!cw?.scheduledTime) return null;
  const ms = new Date(cw.scheduledTime).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Once the publish moment passes there is nothing left to reschedule — Google
// refuses any publish time that is not in the future.
function isAwaitingPublish(cw, nowMs) {
  const ms = scheduledTimeMs(cw);
  if (ms === null) return false;
  return ms > nowMs;
}

function isOverduePublish(cw, nowMs) {
  const ms = scheduledTimeMs(cw);
  if (ms === null) return false;
  return ms <= nowMs && cw?.state === "DRAFT";
}

export default function ViewCoursework() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.roleId?.name?.toLowerCase();
  const canDelete =
    role === "manager" ||
    isDirectorLikeRole(role) ||
    role === "teacher";
  const canEdit = canDelete;
  const showSubmissionStats = role === "teacher";
  const isTeacherShell = role === "teacher";

  const [dbAssignments, setDbAssignments] = useState([]);
  const [excludedGoogleIds, setExcludedGoogleIds] = useState([]);
  const [dbLoading, setDbLoading] = useState(canDelete || showSubmissionStats);
  const [deletingId, setDeletingId] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [submissionCounts, setSubmissionCounts] = useState({});
  // Re-evaluated on a timer so a card stops offering "Edit publish time" the
  // moment its scheduled time passes, without needing a page refresh.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  const loadDbAssignments = async () => {
    if (!courseId) return;
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

    loadDbAssignments();
  }, [courseId, canDelete, showSubmissionStats]);

  const handleSyncToSahahly = async (googleCourseWorkId) => {
    setSyncingId(googleCourseWorkId);
    try {
      const res = await api.post(
        `/google-classroom/coursework/${googleCourseWorkId}/sync-db`,
        { courseId }
      );
      toast.success(res.data?.message || "Assignment synced to Sahahly");
      await loadDbAssignments();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to sync assignment to Sahahly");
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAllFromGoogle = async () => {
    setSyncingAll(true);
    try {
      const res = await api.post("/google-classroom/coursework/sync-all-from-google", {
        courseId,
      });
      const added = res.data?.newlyAddedCount || 0;
      const restored = res.data?.restoredExclusions || 0;
      toast.success(
        res.data?.message ||
          (added || restored
            ? `Synced from Google — ${added} new, ${restored} restored`
            : "Sahahly is up to date with Google Classroom")
      );
      await loadDbAssignments();
      fetchPage(page);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to sync from Google Classroom");
    } finally {
      setSyncingAll(false);
    }
  };

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
            const payload = res.data?.[id];
            next[id] = payload?.gone ? { gone: true } : payload ?? null;
          });
          return next;
        });
        const goneIds = missing.filter((id) => res.data?.[id]?.gone);
        if (goneIds.length) {
          setDbAssignments((prev) =>
            prev.filter((a) => !goneIds.includes(String(a._id)))
          );
        }
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
        : isDirectorLikeRole(role)
          ? `${roleShellPath(role)}/coursework/${courseId}/edit/${googleCourseWorkId}`
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
      const { data } = await api.delete(`/assignments/${dbAssignment._id}`);
      setDbAssignments((prev) => prev.filter((a) => String(a._id) !== String(dbAssignment._id)));
      if (googleCourseWorkId) {
        setExcludedGoogleIds((prev) =>
          prev.includes(googleCourseWorkId) ? prev : [...prev, googleCourseWorkId]
        );
      }
      toast.success(data?.message || "Assignment deleted from Sahahly");
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
            <>
              {canEdit && (
                <button
                  type="button"
                  className="tch-btn tch-btn--secondary"
                  onClick={handleSyncAllFromGoogle}
                  disabled={syncingAll}
                >
                  {syncingAll ? "Syncing…" : "Sync all to Sahahly"}
                </button>
              )}
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
            </>
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
                const awaitingPublish = isAwaitingPublish(cw, nowMs);
                const overduePublish = isOverduePublish(cw, nowMs);

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
                      {awaitingPublish && (
                        <span style={{ color: "#b45309", fontWeight: 600 }}>
                          Scheduled · publishes {formatScheduledTime(cw.scheduledTime) || "later"}
                        </span>
                      )}
                      {overduePublish && (
                        <span style={{ color: "#b45309", fontWeight: 600 }}>
                          Publish time passed — Google is publishing it now
                        </span>
                      )}
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
                        Not tracked in Sahahly yet — use Sync or Edit to add it to your system.
                      </p>
                    )}

                    <div className="tch-assignment-footer">
                      {!dbAssignment && canEdit && (
                        <button
                          type="button"
                          className="tch-btn tch-btn--secondary"
                          onClick={() => handleSyncToSahahly(cw.id)}
                          disabled={syncingId === cw.id}
                        >
                          {syncingId === cw.id ? "Syncing…" : "Sync to Sahahly"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="tch-btn tch-btn--secondary"
                        onClick={() => handleEditAssignment(cw.id)}
                      >
                        <FiEdit3 size={14} />
                        {awaitingPublish ? "Edit schedule" : "Edit"}
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
            {canEdit && (
              <button
                type="button"
                className="pm-back"
                onClick={handleSyncAllFromGoogle}
                disabled={syncingAll}
                title="Pull all Google Classroom assignments (including scheduled) into Sahahly"
              >
                {syncingAll ? "Syncing…" : "Sync all to Sahahly"}
              </button>
            )}
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
                const awaitingPublish = isAwaitingPublish(cw, nowMs);
                const overduePublish = isOverduePublish(cw, nowMs);

                return (
                  <div key={cw.id} className="pm-question-card">
                    <div className="pm-q-header">
                      <span className="pm-q-number">{cw.title}</span>
                    </div>
                    {cw.description && <p style={{ opacity: 0.6 }}>{cw.description}</p>}
                    <p style={{ opacity: 0.5, fontSize: 13 }}>
                      {cw.maxPoints ? `Max Points: ${cw.maxPoints}` : "Ungraded"}
                      {cw.dueDate ? ` · Due: ${cw.dueDate.month}/${cw.dueDate.day}/${cw.dueDate.year}` : ""}
                      {awaitingPublish
                        ? ` · Scheduled: ${formatScheduledTime(cw.scheduledTime)}`
                        : ""}
                    </p>

                    {overduePublish && (
                      <p style={{ color: "#b45309", fontSize: 13, margin: "6px 0" }}>
                        Publish time passed — Google is publishing it now.
                      </p>
                    )}

                    {!dbAssignment && !dbLoading && canEdit && (
                      <p style={{ color: "#b45309", fontSize: 13, margin: "6px 0" }}>
                        Visible in Google Classroom but not in Sahahly yet.
                      </p>
                    )}

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
                        {!dbAssignment && (
                          <button
                            type="button"
                            className="vcw-edit-btn"
                            onClick={() => handleSyncToSahahly(cw.id)}
                            disabled={syncingId === cw.id || dbLoading}
                          >
                            {syncingId === cw.id ? "Syncing…" : "Sync to Sahahly"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="vcw-edit-btn"
                          onClick={() => handleEditAssignment(cw.id)}
                        >
                          {awaitingPublish ? "Edit publish time" : "Edit Assignment"}
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
  if (counts?.gone) {
    return <p className="tch-stats-hint">Removed — no longer on Google Classroom.</p>;
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

  if (counts?.gone) {
    return <p className="vcw-stats-hint">Removed — no longer on Google Classroom.</p>;
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
