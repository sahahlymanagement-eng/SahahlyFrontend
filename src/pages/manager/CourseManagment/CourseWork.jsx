
import { useState, useEffect } from "react";
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
  const [isUngraded, setIsUngraded] = useState(false);

  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState("");
  const [newTopicName, setNewTopicName] = useState("");

  const [loading, setLoading] = useState(false);

  // OPTIONAL: fetch topics (if you add endpoint later)
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

  const handleCreate = async () => {
    if (!title.trim()) {
      return toast.warn("Title is required");
    }

    if (!isUngraded && (maxPoints === "" || Number(maxPoints) <= 0)) {
      return toast.warn("Valid max points required or select ungraded");

    }

    setLoading(true);

    try {
      await api.post("/google-classroom/coursework", {
        courseId,
        courseworkData: {
          title,
          description, 
          isUngraded,

          // grading
          maxPoints: isUngraded ? null : Number(maxPoints),

          // due date handling
          dueDate: dueDate
            ? {
                year: Number(dueDate.split("-")[0]),
                month: Number(dueDate.split("-")[1]),
                day: Number(dueDate.split("-")[2])
              }
            : undefined,

          dueTime: dueTime
            ? {
                hours: Number(dueTime.split(":")[0]),
                minutes: Number(dueTime.split(":")[1])
              }
            : undefined,

          // topics
          topicId: topicId || undefined,
          topicName: newTopicName || undefined
        }
      });

      toast.success("Coursework created successfully");
      // reset form
      setTitle("");
      setDescription("");
      setMaxPoints("");
      setDueDate("");
      setDueTime("");
      setTopicId("");
      setNewTopicName("");
      setIsUngraded(false);

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
              <div className="pm-powered-by">{state.courseName}</div>
            )}

            <button className="pm-back" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>
        </header>

        {/* FORM */}
        <div className="pm-panel">

          {/* TITLE */}
          <div className="pm-input-group">
            <label className="pm-input-label">Title</label>
            <input
              className="pm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Assignment title"
            />
          </div>

          {/* DESCRIPTION */}
          <div className="pm-input-group">
            <label className="pm-input-label">Description</label>
            <textarea
              className="pm-input pm-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions..."
            />
          </div>

          {/* GRADED / UNGRADED */}
          {/* <div className="pm-input-group">
            <label>
              <input
                type="checkbox"
                checked={isUngraded}
                onChange={() => setIsUngraded(!isUngraded)}
              />
              Ungraded
            </label>
          </div> */}
          <div className="pm-input-group">
  <label className="pm-input-label">Grading</label>

  <select
    className="pm-input"
    value={isUngraded ? "ungraded" : "graded"}
    onChange={(e) => setIsUngraded(e.target.value === "ungraded")}
  >
    <option value="graded">Graded</option>
    <option value="ungraded">Ungraded</option>
  </select>
</div>

          {/* MAX POINTS */}
          {!isUngraded && (
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
          )}

          {/* DUE DATE */}
          <div className="pm-input-group">
            <label className="pm-input-label">Due Date</label>
            <input
              type="date"
              className="pm-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* DUE TIME */}
          <div className="pm-input-group">
            <label className="pm-input-label">Due Time</label>
            <input
              type="time"
              className="pm-input"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </div>

          {/* TOPIC SELECT */}
          <div className="pm-input-group">
            <label className="pm-input-label">Select Topic</label>
            <select
              className="pm-input"
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

          {/* NEW TOPIC */}
          <div className="pm-input-group">
            <label className="pm-input-label">Or Create New Topic</label>
            <input
              className="pm-input"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder="New topic name"
            />
          </div>

          {/* SUBMIT */}
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