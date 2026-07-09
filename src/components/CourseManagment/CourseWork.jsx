
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";
import "../../pages/teacher/teacher.css";
import { TeacherPageHeader, TeacherLoading } from "../../pages/teacher/TeacherUI";
import { isPdfFile } from "../../utils/isPdfFile";

const COURSEWORK_UPLOAD_HEADERS = { "Content-Type": "multipart/form-data" };

function googleDueToFormFields(dueDate, dueTime) {
  if (!dueDate?.year) {
    return { dueDate: "", dueTime: "" };
  }

  const utc = new Date(
    Date.UTC(
      dueDate.year,
      dueDate.month - 1,
      dueDate.day,
      dueTime?.hours ?? 23,
      dueTime?.minutes ?? 59
    )
  );

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(utc)
      .map((p) => [p.type, p.value])
  );

  return {
    dueDate: `${parts.year}-${parts.month}-${parts.day}`,
    dueTime: `${parts.hour}:${parts.minute}`,
  };
}

function buildCourseworkPayload({
  title,
  description,
  isUngraded,
  maxPoints,
  dueDate,
  dueTime,
  topicId,
  newTopicName,
}) {
  return {
    title,
    description,
    isUngraded,
    maxPoints: isUngraded ? null : Number(maxPoints),
    dueDate: dueDate
      ? {
          year: Number(dueDate.split("-")[0]),
          month: Number(dueDate.split("-")[1]),
          day: Number(dueDate.split("-")[2]),
        }
      : undefined,
    dueTime: dueTime
      ? {
          hours: Number(dueTime.split(":")[0]),
          minutes: Number(dueTime.split(":")[1]),
        }
      : undefined,
    topicId: topicId || undefined,
    topicName: newTopicName || undefined,
  };
}

export default function Coursework() {
  const { courseId, courseWorkId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const isEditMode = Boolean(courseWorkId);

  const storedUser = localStorage.getItem("user");
  const role = storedUser
    ? JSON.parse(storedUser)?.roleId?.name?.toLowerCase()
    : "teacher";
  const isTeacherShell = role === "teacher";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxPoints, setMaxPoints] = useState("");
  const [isUngraded, setIsUngraded] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [assignmentFile, setAssignmentFile] = useState(null);
  const [existingWebLink, setExistingWebLink] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await api.get(`/google-classroom/topics?courseId=${courseId}`);
        setTopics(res.data || []);
      } catch {
        // silent for now
      }
    };

    fetchTopics();
  }, [courseId]);

  useEffect(() => {
    if (!isEditMode) return;

    const loadCoursework = async () => {
      setInitialLoading(true);
      try {
        const res = await api.get(`/google-classroom/coursework/${courseWorkId}`, {
          params: { courseId },
        });
        const cw = res.data;

        setTitle(cw.title || "");
        setDescription(cw.description || "");
        setIsUngraded(!cw.maxPoints);
        setMaxPoints(cw.maxPoints ? String(cw.maxPoints) : "");
        setTopicId(cw.topicId || "");
        setExistingWebLink(cw.assignmentWebLink || "");

        const dueFields = googleDueToFormFields(cw.dueDate, cw.dueTime);
        setDueDate(dueFields.dueDate);
        setDueTime(dueFields.dueTime);
      } catch (err) {
        toast.error(err.response?.data?.error || "Failed to load coursework");
        navigate(-1);
      } finally {
        setInitialLoading(false);
      }
    };

    loadCoursework();
  }, [isEditMode, courseId, courseWorkId, navigate]);

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB, matches backend multer cap

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAssignmentFile(null);
      return;
    }
    if (!isPdfFile(file)) {
      toast.warn("Only PDF files are allowed");
      e.target.value = "";
      setAssignmentFile(null);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.warn("File must be 20 MB or smaller");
      e.target.value = "";
      setAssignmentFile(null);
      return;
    }
    setAssignmentFile(file);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      return toast.warn("Title is required");
    }

    if (!isUngraded && (maxPoints === "" || Number(maxPoints) <= 0)) {
      return toast.warn("Valid max points required or select ungraded");
    }

    setLoading(true);

    const courseworkData = buildCourseworkPayload({
      title,
      description,
      isUngraded,
      maxPoints,
      dueDate,
      dueTime,
      topicId,
      newTopicName,
    });

    try {
      if (isEditMode) {
        const formData = new FormData();
        formData.append("courseId", courseId);
        formData.append("courseworkData", JSON.stringify(courseworkData));
        if (assignmentFile) formData.append("assignmentFile", assignmentFile);

        // No manual Content-Type: axios sets multipart/form-data + boundary for FormData.
        const res = await api.patch(
          `/google-classroom/coursework/${courseWorkId}`,
          formData,
          { headers: COURSEWORK_UPLOAD_HEADERS }
        );
        if (res.data?.warning) toast.warn(res.data.warning);
        toast.success("Coursework updated successfully");
        const viewPath =
          role === "manager"
            ? `/manager/view-coursework/${courseId}`
            : role === "admin"
              ? `/director/view-coursework/${courseId}`
              : `/teacher/view-coursework/${courseId}`;
        navigate(viewPath, {
          state: { courseName: state?.courseName },
        });
      } else {
        const formData = new FormData();
        formData.append("courseId", courseId);
        formData.append("courseworkData", JSON.stringify(courseworkData));
        if (assignmentFile) formData.append("assignmentFile", assignmentFile);

        // No manual Content-Type: axios sets multipart/form-data + boundary for FormData.
        await api.post("/google-classroom/coursework", formData, {
          headers: COURSEWORK_UPLOAD_HEADERS,
        });
        toast.success("Coursework created successfully");
        setTitle("");
        setDescription("");
        setMaxPoints("");
        setDueDate("");
        setDueTime("");
        setTopicId("");
        setNewTopicName("");
        setIsUngraded(false);
        setAssignmentFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          `Failed to ${isEditMode ? "update" : "create"} coursework`
      );
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    if (isTeacherShell) {
      return (
        <div className="tch-page">
          <TeacherLoading message="Loading assignment…" />
        </div>
      );
    }
    return (
      <div className="pm-page">
        <div className="pm-shell">
          <div className="pm-loading-panel">
            <p>Loading coursework…</p>
          </div>
        </div>
      </div>
    );
  }

  const formFields = (
    <>
      {isTeacherShell ? <div className="tch-form-section-title">Details</div> : null}

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Title</label>
        <input
          className={isTeacherShell ? "tch-input" : "pm-input"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Assignment title"
        />
      </div>

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Description</label>
        <textarea
          className={isTeacherShell ? "tch-textarea" : "pm-input pm-textarea"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Instructions for students…"
        />
      </div>

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>
          {isEditMode && existingWebLink
            ? "Replace worksheet (PDF, optional)"
            : "Worksheet (PDF, optional)"}
        </label>

        {isEditMode && existingWebLink && (
          <a
            href={existingWebLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginBottom: 8, fontSize: 13 }}
          >
            📄 View current worksheet
          </a>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="cw-file-input-hidden"
          onChange={handleFileChange}
        />

        <div className="cw-file-upload-row">
          <button
            type="button"
            className={isTeacherShell ? "tch-btn tch-btn--ghost cw-file-upload-btn" : "pm-mark-btn cw-file-upload-btn"}
            onClick={openFilePicker}
          >
            Choose PDF
          </button>
          <span className="cw-file-upload-hint">
            {assignmentFile
              ? `Selected: ${assignmentFile.name}`
              : "PDF up to 20 MB"}
          </span>
        </div>

        {isEditMode && !existingWebLink && (
          <span
            style={{ fontSize: 12, opacity: 0.7, marginTop: 4, display: "block" }}
          >
            Note: Google Classroom can’t attach a worksheet to an assignment that
            was created without one. To ensure students see the PDF, attach it when
            creating the assignment.
          </span>
        )}
      </div>

      {isTeacherShell ? <div className="tch-form-section-title">Grading & schedule</div> : null}

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Grading</label>
        <select
          className={isTeacherShell ? "tch-select" : "pm-input"}
          value={isUngraded ? "ungraded" : "graded"}
          onChange={(e) => setIsUngraded(e.target.value === "ungraded")}
        >
          <option value="graded">Graded</option>
          <option value="ungraded">Ungraded</option>
        </select>
      </div>

      {!isUngraded && (
        <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
          <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Max Points</label>
          <input
            type="number"
            className={isTeacherShell ? "tch-input" : "pm-input"}
            value={maxPoints}
            onChange={(e) => setMaxPoints(e.target.value)}
            placeholder="e.g. 100"
          />
        </div>
      )}

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Due Date</label>
        <input
          type="date"
          className={isTeacherShell ? "tch-input" : "pm-input"}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Due Time</label>
        <input
          type="time"
          className={isTeacherShell ? "tch-input" : "pm-input"}
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
        />
      </div>

      {isTeacherShell ? <div className="tch-form-section-title">Organization</div> : null}

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Select Topic</label>
        <select
          className={isTeacherShell ? "tch-select" : "pm-input"}
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          <option value="">None</option>
          {topics.map((t) => (
            <option key={t.topicId} value={t.topicId}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
        <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>Or Create New Topic</label>
        <input
          className={isTeacherShell ? "tch-input" : "pm-input"}
          value={newTopicName}
          onChange={(e) => setNewTopicName(e.target.value)}
          placeholder="New topic name"
        />
      </div>

      <div className={isTeacherShell ? "tch-form-actions" : undefined}>
        <button
          className={isTeacherShell ? "tch-btn tch-btn--primary" : "pm-mark-btn"}
          onClick={handleSubmit}
          disabled={loading}
          style={isTeacherShell ? undefined : { marginTop: 20 }}
        >
          {loading
            ? isEditMode
              ? "Saving..."
              : "Creating..."
            : isEditMode
              ? "Save changes"
              : "Create coursework"}
        </button>
        {isTeacherShell ? (
          <button
            type="button"
            className="tch-btn tch-btn--ghost"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </>
  );

  if (isTeacherShell) {
    return (
      <div className="tch-page">
        <TeacherPageHeader
          eyebrow={state?.courseName || "Course"}
          title={isEditMode ? "Edit assignment" : "Create assignment"}
          subtitle={
            isEditMode
              ? "Update title, instructions, points, and due date in Google Classroom"
              : "Publish a new assignment to Google Classroom and Sahahly"
          }
          breadcrumbs={[
            { label: "Dashboard", to: "/teacher/dashboard" },
            { label: "My courses", to: "/teacher/courses" },
            {
              label: state?.courseName || "Course",
              to: `/teacher/view-coursework/${courseId}`,
            },
            { label: isEditMode ? "Edit" : "Create" },
          ]}
        />
        <div className="tch-form-panel">{formFields}</div>
      </div>
    );
  }

  return (
    <div className="pm-page">
      <div className="pm-shell">
        <header className="pm-header">
          <h2>{isEditMode ? "Edit Coursework" : "Create Coursework"}</h2>

          <div className="pm-header-right">
            {state?.courseName && (
              <div className="pm-powered-by">{state.courseName}</div>
            )}

            <button className="pm-back" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>
        </header>

        <div className="pm-panel">
          {formFields}
        </div>
      </div>
    </div>
  );
}
