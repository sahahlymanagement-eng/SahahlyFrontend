import { useState, useEffect } from "react";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./CourseManagement.css";
import { useNavigate } from "react-router-dom";

export default function CreateCourse() {
  const [name, setName] = useState("");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [googleAccounts, setGoogleAccounts] = useState([]);
  const [selectedGoogleAccountId, setSelectedGoogleAccountId] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const role = user?.roleId?.name?.toLowerCase();

  // Fetch teachers list only if manager
  useEffect(() => {
    const loadFormData = async () => {
      try {
        const accountsRes = await api.get("/google-classroom/accounts");
        const accounts = accountsRes.data || [];
        setGoogleAccounts(accounts);
        if (accounts.length === 1) {
          setSelectedGoogleAccountId(accounts[0]._id);
        }
      } catch (err) {
        toast.error("Failed to load Google accounts");
      }

      if (role === "manager" || role === "admin") {
        try {
          const res = await api.get("/people/teachers");
          setTeachers(res.data);
        } catch (err) {
          toast.error("Failed to load teachers");
        }
      }
    };

    loadFormData();
  }, [role]);

  const handleCreate = async () => {
    if (!name) return toast.warn("Course name is required");
    if (!selectedGoogleAccountId) {
      return toast.warn("Please select which Sahahly Gmail account owns this classroom");
    }
    if ((role === "manager" || role === "admin") && !selectedTeacherId) {
      return toast.warn("Please select a teacher");
    }

    setLoading(true);

    try {
      const url = (role === "manager" || role === "admin")
        ? "/google-classroom/courses/manager-director"
        : "/google-classroom/courses/teacher";

      const payload = (role === "manager" || role === "admin")
        ? {
            courseData: { name, section, description },
            teacherId: selectedTeacherId,
            googleAccountId: selectedGoogleAccountId,
          }
        : {
            courseData: { name, section, description },
            userId: user.id,
            googleAccountId: selectedGoogleAccountId,
          };

      await api.post(url, payload);
      toast.success("Course created successfully");

      setName("");
      setSection("");
      setDescription("");
      setSelectedTeacherId("");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create course");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pm-page">
      <div className="pm-shell">

        <header className="pm-header">
          <button className="pm-back-btn" style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              color: "#6b7280",
            }} 
          onClick={() => navigate(-1)}>
                    ← Back
                  </button>

          <h2>Create Google Classroom Course</h2>

          <button
            className="pm-view-btn"
              style={{
                border: "1px solid #e5e7eb",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            onClick={() =>
              navigate(
                role === "manager"
                  ? "/manager/courses"
                  : role === "admin"
                  ? "/director/courses"
                  : "/teacher/courses"
              )
            }
          >
            View Courses
          </button>
          </header>

        <div className="pm-panel">

          <div className="pm-input-group">
            <label className="pm-input-label">Course Name</label>
            <input
              className="pm-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Fundamentals"
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Section</label>
            <input
              className="pm-input"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. Section A"
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Description</label>
            <textarea
              className="pm-input pm-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Course description..."
            />
          </div>

          <div className="pm-input-group">
            <label className="pm-input-label">Gmail account (course owner)</label>
            <select
              className="pm-input"
              value={selectedGoogleAccountId}
              onChange={(e) => setSelectedGoogleAccountId(e.target.value)}
            >
              <option value="">Select Gmail account…</option>
              {googleAccounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.email}
                </option>
              ))}
            </select>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
              Sahahly Gmail from Director → Google Accounts. Only this account exists in Google Classroom.
            </p>
          </div>

          {/* Only show teacher dropdown for manager */}
          {(role === "manager" || role === "admin")&& (
            <div className="pm-input-group">
              <label className="pm-input-label">Assign teacher (in Sahahly)</label>
              <select
                className="pm-input"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
              >
                <option value="">Select a teacher...</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}{t.email ? ` (${t.email})` : ""}
                  </option>
                ))}
              </select>
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
                Sahahly only — links this classroom to the teacher for reports, submissions, and workload. Not sent to Google.
              </p>
            </div>
          )}

          <button
            className="pm-mark-btn"
            onClick={handleCreate}
            disabled={loading}
            style={{ marginTop: 20 }}
          >
            {loading ? "Creating..." : "Create Course"}
          </button>

        </div>
        
      </div>
    </div>
  );
}