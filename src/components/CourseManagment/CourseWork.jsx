
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";
import "../../pages/teacher/teacher.css";
import { TeacherPageHeader, TeacherLoading } from "../../pages/teacher/TeacherUI";
import { isPdfFile } from "../../utils/isPdfFile";

function extractDriveFileId(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw) && !raw.includes("/") && !raw.includes(" ")) {
    return raw;
  }
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function formatDriveModified(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
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
  const [pdfSource, setPdfSource] = useState("computer"); // computer | drive
  const [driveFile, setDriveFile] = useState(null); // { id, name, webViewLink }
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveNextPage, setDriveNextPage] = useState(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [drivePaste, setDrivePaste] = useState("");
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

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("Failed to read PDF"));
      reader.readAsDataURL(file);
    });

  const buildCourseworkFormData = async (payload, file, driveSelected = null) => {
    const formData = new FormData();
    formData.append("courseId", courseId);
    formData.append("courseworkData", JSON.stringify(payload));
    if (driveSelected?.id) {
      formData.append("assignmentDriveFileId", driveSelected.id);
    } else if (file) {
      formData.append("assignmentFile", file, file.name || "worksheet.pdf");
      // Base64 backup — some proxies drop the multipart file part but keep text fields.
      try {
        const b64 = await fileToBase64(file);
        formData.append("assignmentFileBase64", b64);
        formData.append("assignmentFileName", file.name || "worksheet.pdf");
      } catch (e) {
        console.warn("Could not attach base64 PDF backup:", e);
      }
    }
    return formData;
  };

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
    setDriveFile(null);
    setPdfSource("computer");
  };

  const openFilePicker = () => {
    setPdfSource("computer");
    fileInputRef.current?.click();
  };

  const clearWorksheet = () => {
    setAssignmentFile(null);
    setDriveFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadDrivePdfs = useCallback(
    async ({ append = false, pageToken = null, search = driveSearch } = {}) => {
      if (!courseId) return;
      setDriveLoading(true);
      try {
        const res = await api.get("/google-classroom/drive-pdfs", {
          params: {
            courseId,
            q: search || undefined,
            pageToken: pageToken || undefined,
            pageSize: 25,
          },
        });
        const files = res.data?.files || [];
        setDriveFiles((prev) => (append ? [...prev, ...files] : files));
        setDriveNextPage(res.data?.nextPageToken || null);
      } catch (err) {
        toast.error(err.response?.data?.error || "Failed to load Drive PDFs");
        if (!append) setDriveFiles([]);
        setDriveNextPage(null);
      } finally {
        setDriveLoading(false);
      }
    },
    [courseId, driveSearch]
  );

  const openDrivePicker = async () => {
    setPdfSource("drive");
    setDrivePickerOpen(true);
    setDrivePaste("");
    setDriveSearch("");
    await loadDrivePdfs({ append: false, search: "" });
  };

  const selectDriveFile = (file) => {
    setDriveFile({
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
    });
    setAssignmentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPdfSource("drive");
    setDrivePickerOpen(false);
  };

  const applyDrivePaste = () => {
    const id = extractDriveFileId(drivePaste);
    if (!id) {
      toast.warn("Paste a Google Drive PDF link or file ID");
      return;
    }
    const matched = driveFiles.find((f) => f.id === id);
    setDriveFile({
      id,
      name: matched?.name || "Drive PDF",
      webViewLink: matched?.webViewLink || `https://drive.google.com/file/d/${id}/view`,
    });
    setAssignmentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPdfSource("drive");
    setDrivePickerOpen(false);
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
        const formData = await buildCourseworkFormData(
          courseworkData,
          assignmentFile,
          driveFile
        );

        const res = await api.patch(
          `/google-classroom/coursework/${courseWorkId}`,
          formData
        );
        if (res.data?.warning) toast.warn(res.data.warning);
        if (res.data?.materialWarning) toast.warn(res.data.materialWarning);
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
        const formData = await buildCourseworkFormData(
          courseworkData,
          assignmentFile,
          driveFile
        );

        const res = await api.post("/google-classroom/coursework", formData);

        if (assignmentFile || driveFile) {
          if (!res.data?.assignmentFileId && !res.data?.assignmentWebLink) {
            toast.error(
              "Assignment created, but the PDF never reached Google. Check VPS logs for [coursework create] and try again."
            );
          } else if (res.data?.materialWarning) {
            toast.warn(res.data.materialWarning);
          } else if (res.data?.materialsAttached === false) {
            toast.warn(
              "Assignment created. If the PDF card is missing in Classroom, open the description — the worksheet link is there."
            );
          } else if (res.data?.materialsAttached === true) {
            toast.success("Coursework created — PDF attached in Google Classroom");
          } else {
            toast.success("Coursework created with worksheet attached");
          }
        } else {
          toast.success("Coursework created successfully");
        }
        setTitle("");
        setDescription("");
        setMaxPoints("");
        setDueDate("");
        setDueTime("");
        setTopicId("");
        setNewTopicName("");
        setIsUngraded(false);
        setAssignmentFile(null);
        setDriveFile(null);
        setPdfSource("computer");
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

        <div className="cw-file-source-row">
          <button
            type="button"
            className={`${
              isTeacherShell ? "tch-btn tch-btn--ghost" : "pm-mark-btn"
            } cw-file-upload-btn${pdfSource === "computer" && assignmentFile ? " is-active" : ""}`}
            onClick={openFilePicker}
          >
            From computer
          </button>
          <button
            type="button"
            className={`${
              isTeacherShell ? "tch-btn tch-btn--ghost" : "pm-mark-btn"
            } cw-file-upload-btn${pdfSource === "drive" && driveFile ? " is-active" : ""}`}
            onClick={openDrivePicker}
          >
            From Google Drive
          </button>
        </div>

        <div className="cw-file-upload-row">
          <span className="cw-file-upload-hint">
            {driveFile
              ? `Drive: ${driveFile.name}`
              : assignmentFile
                ? `Selected: ${assignmentFile.name}`
                : "Choose a PDF from your computer or Google Drive (up to 20 MB)"}
          </span>
          {(assignmentFile || driveFile) && (
            <button
              type="button"
              className="cw-file-clear-btn"
              onClick={clearWorksheet}
            >
              Clear
            </button>
          )}
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

      {drivePickerOpen && (
        <div
          className="cw-drive-modal-backdrop"
          onClick={() => setDrivePickerOpen(false)}
          role="presentation"
        >
          <div
            className="cw-drive-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose PDF from Google Drive"
          >
            <div className="cw-drive-modal-header">
              <h3>Google Drive PDFs</h3>
              <button
                type="button"
                className="cw-drive-modal-close"
                onClick={() => setDrivePickerOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="cw-drive-paste-row">
              <input
                className={isTeacherShell ? "tch-input" : "pm-input"}
                value={drivePaste}
                onChange={(e) => setDrivePaste(e.target.value)}
                placeholder="Or paste Drive link / file ID"
              />
              <button
                type="button"
                className={isTeacherShell ? "tch-btn tch-btn--primary" : "pm-mark-btn"}
                onClick={applyDrivePaste}
              >
                Use link
              </button>
            </div>

            <div className="cw-drive-search-row">
              <input
                className={isTeacherShell ? "tch-input" : "pm-input"}
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                placeholder="Search PDFs…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    loadDrivePdfs({ search: driveSearch });
                  }
                }}
              />
              <button
                type="button"
                className={isTeacherShell ? "tch-btn tch-btn--ghost" : "pm-mark-btn"}
                onClick={() => loadDrivePdfs({ search: driveSearch })}
                disabled={driveLoading}
              >
                Search
              </button>
            </div>

            <div className="cw-drive-list">
              {driveLoading && driveFiles.length === 0 ? (
                <p className="cw-drive-empty">Loading PDFs…</p>
              ) : driveFiles.length === 0 ? (
                <p className="cw-drive-empty">No PDFs found in Drive</p>
              ) : (
                driveFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`cw-drive-item${driveFile?.id === f.id ? " is-selected" : ""}`}
                    onClick={() => selectDriveFile(f)}
                  >
                    <span className="cw-drive-item-name">{f.name}</span>
                    <span className="cw-drive-item-meta">
                      {formatDriveModified(f.modifiedTime)}
                    </span>
                  </button>
                ))
              )}
            </div>

            {driveNextPage && (
              <button
                type="button"
                className={`${
                  isTeacherShell ? "tch-btn tch-btn--ghost" : "pm-mark-btn"
                } cw-drive-load-more`}
                onClick={() =>
                  loadDrivePdfs({
                    append: true,
                    pageToken: driveNextPage,
                    search: driveSearch,
                  })
                }
                disabled={driveLoading}
              >
                {driveLoading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}

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
