import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import { formatGoogleOAuthError } from "../../utils/markingFormData";
import "./CourseManagement.css";
import "../../pages/teacher/teacher.css";
import { TeacherPageHeader, TeacherLoading } from "../../pages/teacher/TeacherUI";
import { isPdfFile } from "../../utils/isPdfFile";
import {
  requestGoogleDriveAccessToken,
  openGoogleDrivePdfPicker,
  listPersonalDrivePdfs,
  downloadDrivePdfAsFile,
} from "../../utils/googleDrivePicker";
import { isDirectorLikeRole, roleShellPath } from "../../utils/directorLikeAccess";

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

function googleScheduledToFormFields(scheduledTime) {
  if (!scheduledTime) {
    return { scheduleDate: "", scheduleTime: "", scheduleEnabled: false };
  }

  const utc = new Date(scheduledTime);
  if (Number.isNaN(utc.getTime())) {
    return { scheduleDate: "", scheduleTime: "", scheduleEnabled: false };
  }

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
    scheduleEnabled: true,
    scheduleDate: `${parts.year}-${parts.month}-${parts.day}`,
    scheduleTime: `${parts.hour}:${parts.minute}`,
  };
}

// Google rejects a scheduledTime that is not strictly in the future, and the
// backend converts the picked date/time as Cairo local time.
function cairoNowFields() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function buildCourseworkPayload({
  title,
  description,
  isUngraded,
  maxPoints,
  dueDate,
  dueTime,
  scheduleEnabled,
  scheduleDate,
  scheduleTime,
  blockSubmissionsAfterDueDate,
  unschedule,
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
    scheduleEnabled,
    scheduleDate:
      scheduleEnabled && scheduleDate
        ? {
            year: Number(scheduleDate.split("-")[0]),
            month: Number(scheduleDate.split("-")[1]),
            day: Number(scheduleDate.split("-")[2]),
          }
        : undefined,
    scheduleTime:
      scheduleEnabled && scheduleTime
        ? {
            hours: Number(scheduleTime.split(":")[0]),
            minutes: Number(scheduleTime.split(":")[1]),
          }
        : undefined,
    blockSubmissionsAfterDueDate: Boolean(blockSubmissionsAfterDueDate),
    unschedule: Boolean(unschedule),
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
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [blockSubmissionsAfterDueDate, setBlockSubmissionsAfterDueDate] =
    useState(false);
  const [initialHadSchedule, setInitialHadSchedule] = useState(false);
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [assignmentFile, setAssignmentFile] = useState(null);
  const [pdfSource, setPdfSource] = useState("computer"); // computer | drive
  const [driveFile, setDriveFile] = useState(null); // { id, name, webViewLink }
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveNextPage, setDriveNextPage] = useState(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [drivePickerOpening, setDrivePickerOpening] = useState(false);
  const [driveAccessToken, setDriveAccessToken] = useState(null);
  const [driveAccountLabel, setDriveAccountLabel] = useState("");
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

        // A publish time that already passed cannot be rescheduled — Google
        // only accepts future times — so don't prefill it as an active schedule.
        const scheduledMs = cw.scheduledTime
          ? new Date(cw.scheduledTime).getTime()
          : null;
        const scheduleStillAhead =
          Number.isFinite(scheduledMs) && scheduledMs > Date.now();

        const scheduleFields = scheduleStillAhead
          ? googleScheduledToFormFields(cw.scheduledTime)
          : { scheduleEnabled: false, scheduleDate: "", scheduleTime: "" };

        setInitialHadSchedule(scheduleFields.scheduleEnabled);
        setScheduleEnabled(scheduleFields.scheduleEnabled);
        setScheduleDate(scheduleFields.scheduleDate);
        setScheduleTime(scheduleFields.scheduleTime);
        setBlockSubmissionsAfterDueDate(Boolean(cw.blockSubmissionsAfterDueDate));
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

  const buildCourseworkFormData = async (payload, file, driveSelected = null) => {
    const formData = new FormData();
    formData.append("courseId", courseId);
    formData.append("courseworkData", JSON.stringify(payload));
    // Prefer local/downloaded PDF bytes (personal Drive after Google sign-in).
    // Only use Drive file id when no file bytes are available.
    if (file) {
      formData.append("assignmentFile", file, file.name || "worksheet.pdf");
    } else if (driveSelected?.id) {
      formData.append("assignmentDriveFileId", driveSelected.id);
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
    async ({
      append = false,
      pageToken = null,
      search = driveSearch,
      accessToken = driveAccessToken,
    } = {}) => {
      if (!accessToken) {
        toast.error("Sign in to Google Drive first");
        return;
      }
      setDriveLoading(true);
      try {
        const { files, nextPageToken } = await listPersonalDrivePdfs(
          accessToken,
          {
            q: search || "",
            pageToken: pageToken || null,
          }
        );
        setDriveFiles((prev) => (append ? [...prev, ...files] : files));
        setDriveNextPage(nextPageToken || null);
      } catch (err) {
        toast.error(err.message || "Failed to load Drive PDFs");
        if (!append) setDriveFiles([]);
        setDriveNextPage(null);
      } finally {
        setDriveLoading(false);
      }
    },
    [driveAccessToken, driveSearch]
  );

  const applyPickedDrivePdf = async (accessToken, picked) => {
    if (!picked?.id) return;
    const file = await downloadDrivePdfAsFile(accessToken, picked);
    setAssignmentFile(file);
    setDriveFile({
      id: picked.id,
      name: picked.name || file.name,
      webViewLink: picked.url || picked.webViewLink || null,
      fromPersonalDrive: true,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPdfSource("drive");
    toast.success(`Selected: ${picked.name || file.name}`);
  };

  const openPersonalDriveBrowser = async (accessToken, accountLabel = "") => {
    setDriveAccessToken(accessToken);
    setDriveAccountLabel(accountLabel || "");
    setPdfSource("drive");
    setDrivePickerOpen(true);
    setDriveSearch("");
    setDriveFiles([]);
    setDriveNextPage(null);
    await loadDrivePdfs({
      append: false,
      search: "",
      accessToken,
    });
  };

  const openDrivePicker = async () => {
    if (!courseId) {
      toast.warn("Course is required");
      return;
    }
    setPdfSource("drive");
    setDrivePickerOpening(true);
    try {
      const { data } = await api.get("/google-classroom/drive-picker-config", {
        params: { courseId },
      });

      // Google account picker via backend OAuth popup (works without JS origins).
      const signedIn = await requestGoogleDriveAccessToken({
        hintEmail: data.accountEmail || undefined,
      });
      const accessToken = signedIn.accessToken;

      setDriveAccessToken(accessToken);
      setDriveAccountLabel(
        signedIn.email || data.accountEmail || "Google Drive"
      );

      if (data.hasPickerApiKey && data.developerKey) {
        try {
          const picked = await openGoogleDrivePdfPicker({
            accessToken,
            developerKey: data.developerKey,
            appId: data.appId || undefined,
            title: "Choose a PDF from your Google Drive",
          });
          if (!picked?.id) return;
          await applyPickedDrivePdf(accessToken, picked);
          return;
        } catch (pickerErr) {
          console.warn(
            "Google Picker unavailable, using Drive file list:",
            pickerErr
          );
        }
      }

      await openPersonalDriveBrowser(
        accessToken,
        signedIn.email || data.accountEmail || "your Google account"
      );
    } catch (err) {
      console.error(err);
      toast.error(
        formatGoogleOAuthError(
          err.response?.data?.error || err.message
        ) || "Could not open Google Drive"
      );
    } finally {
      setDrivePickerOpening(false);
    }
  };

  const selectDriveFile = async (file) => {
    if (!driveAccessToken) {
      toast.error("Sign in to Google Drive again");
      return;
    }
    try {
      setDriveLoading(true);
      await applyPickedDrivePdf(driveAccessToken, file);
      setDrivePickerOpen(false);
    } catch (err) {
      toast.error(err.message || "Could not use that Drive file");
    } finally {
      setDriveLoading(false);
    }
  };

  const failSubmit = (message) => {
    setSubmitError(message);
    toast.warn(message);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      return failSubmit("Title is required");
    }

    if (!isUngraded && (maxPoints === "" || Number(maxPoints) <= 0)) {
      return failSubmit("Valid max points required or select ungraded");
    }

    if (!isUngraded && Number(maxPoints) > 100000) {
      return failSubmit("Max points must be 100000 or less — Google Classroom rejects larger values.");
    }

    // Date inputs accept years far beyond Google's 1–9999 range.
    const dueYear = dueDate ? Number(dueDate.split("-")[0]) : null;
    if (dueYear !== null && (dueYear < 1 || dueYear > 9999)) {
      return failSubmit(
        `Due date year must be between 1 and 9999 — Google Classroom rejects "${dueYear}".`
      );
    }

    if (scheduleEnabled) {
      if (!scheduleDate) {
        return failSubmit("Publish date is required when scheduling");
      }
      if (!scheduleTime) {
        return failSubmit(
          "Publish time is required when scheduling — leaving it empty means midnight, which Google rejects as a past time."
        );
      }
      const now = cairoNowFields();
      if (`${scheduleDate}T${scheduleTime}` <= `${now.date}T${now.time}`) {
        return failSubmit(
          `Publish time must be in the future. It is currently ${now.time} on ${now.date} (Cairo time), so pick a later time.`
        );
      }
    }

    if (blockSubmissionsAfterDueDate && !dueDate) {
      return failSubmit(
        "Due date is required when blocking submissions after the due date"
      );
    }

    setSubmitError("");
    setLoading(true);

    const courseworkData = buildCourseworkPayload({
      title,
      description,
      isUngraded,
      maxPoints,
      dueDate,
      dueTime,
      scheduleEnabled,
      scheduleDate,
      scheduleTime,
      blockSubmissionsAfterDueDate,
      unschedule: isEditMode && initialHadSchedule && !scheduleEnabled,
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
          formData,
          { timeout: 180_000 }
        );
        if (res.data?.warning) toast.warn(res.data.warning);
        if (res.data?.materialWarning) toast.warn(res.data.materialWarning);
        if (res.data?.syncedToDb) {
          toast.info("Assignment was missing from Sahahly — it has been synced to your system.");
        }
        if (scheduleEnabled) {
          toast.success("Scheduled publish time updated in Google Classroom and Sahahly");
        } else if (initialHadSchedule && !scheduleEnabled) {
          toast.success("Schedule removed — assignment published now");
        } else {
          toast.success("Coursework updated successfully");
        }
        const viewPath =
          role === "manager"
            ? `/manager/view-coursework/${courseId}`
            : isDirectorLikeRole(role)
              ? `${roleShellPath(role)}/view-coursework/${courseId}`
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

        const res = await api.post("/google-classroom/coursework", formData, {
          timeout: 180_000,
        });

        if (res.data?.dbSyncWarning) {
          toast.warn(res.data.dbSyncWarning);
        } else if (assignmentFile || driveFile) {
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
            toast.success(
              scheduleEnabled
                ? "Scheduled with PDF — will publish in Google Classroom at the chosen time"
                : "Coursework created — PDF attached in Google Classroom"
            );
          } else {
            toast.success(
              scheduleEnabled
                ? "Assignment scheduled — it will publish at the chosen time"
                : "Coursework created with worksheet attached"
            );
          }
        } else if (scheduleEnabled) {
          toast.success(
            "Assignment scheduled — it will publish in Google Classroom at the chosen time. You can change the publish time later via Edit schedule."
          );
        } else {
          toast.success("Coursework created successfully");
        }
        setTitle("");
        setDescription("");
        setMaxPoints("");
        setDueDate("");
        setDueTime("");
        setScheduleEnabled(false);
        setScheduleDate("");
        setScheduleTime("");
        setBlockSubmissionsAfterDueDate(false);
        setTopicId("");
        setNewTopicName("");
        setIsUngraded(false);
        setAssignmentFile(null);
        setDriveFile(null);
        setPdfSource("computer");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      const message =
        (err.code === "ECONNABORTED"
          ? "Google Classroom took too long to respond. Check View coursework before trying again—the assignment may already have been created."
          : err.response?.data?.error) ||
        `Failed to ${isEditMode ? "update" : "create"} coursework`;
      setSubmitError(message);
      toast.error(message);
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
            disabled={drivePickerOpening}
          >
            {drivePickerOpening ? "Opening Drive…" : "From Google Drive"}
          </button>
        </div>

        <div className="cw-file-upload-row">
          <span className="cw-file-upload-hint">
            {driveFile
              ? `Drive: ${driveFile.name}`
              : assignmentFile
                ? `Selected: ${assignmentFile.name}`
                : "Choose a PDF from your computer, or sign in to Google Drive to pick one"}
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
              <h3>Your Google Drive</h3>
              <button
                type="button"
                className="cw-drive-modal-close"
                onClick={() => setDrivePickerOpen(false)}
              >
                ×
              </button>
            </div>

            <p className="cw-drive-modal-hint">
              Signed in to Google
              {driveAccountLabel ? ` (${driveAccountLabel})` : ""}. Pick a PDF
              from your personal Drive.
            </p>

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
            min={1}
            max={100000}
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
          min="1970-01-01"
          max="9999-12-31"
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

      <label className={`cw-check-row${isTeacherShell ? " cw-check-row--tch" : ""}`}>
        <input
          type="checkbox"
          checked={blockSubmissionsAfterDueDate}
          onChange={(e) => setBlockSubmissionsAfterDueDate(e.target.checked)}
        />
        <span>Do not accept submissions after the due date</span>
      </label>

      {isTeacherShell ? (
        <div className="tch-form-section-title">Publish schedule</div>
      ) : null}

      <label className={`cw-check-row${isTeacherShell ? " cw-check-row--tch" : ""}`}>
        <input
          type="checkbox"
          checked={scheduleEnabled}
          onChange={(e) => setScheduleEnabled(e.target.checked)}
        />
        <span>Schedule for later (publish at a specific date and time)</span>
      </label>

      {scheduleEnabled && (
        <>
          {isEditMode && (
            <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 8px" }}>
              Change the publish date or time below and save — Google Classroom will update when this assignment goes live.
            </p>
          )}
          <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
            <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>
              Publish date
            </label>
            <input
              type="date"
              className={isTeacherShell ? "tch-input" : "pm-input"}
              min={cairoNowFields().date}
              max="9999-12-31"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>

          <div className={isTeacherShell ? "tch-field" : "pm-input-group"}>
            <label className={isTeacherShell ? "tch-label" : "pm-input-label"}>
              Publish time
            </label>
            <input
              type="time"
              className={isTeacherShell ? "tch-input" : "pm-input"}
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
            <p style={{ fontSize: 12, opacity: 0.75, margin: "6px 0 0" }}>
              Cairo time — must be later than {cairoNowFields().time} today.
              Google Classroom refuses a publish time that has already passed.
            </p>
          </div>
        </>
      )}

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

      {submitError ? (
        <div
          role="alert"
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #f5b1b1",
            background: "rgba(220, 53, 69, 0.08)",
            color: "#b02a37",
            fontSize: 14,
          }}
        >
          {submitError}
        </div>
      ) : null}

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
          <h1>{isEditMode ? "Edit Coursework" : "Create Coursework"}</h1>

          <div className="pm-header-actions">
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
