// import { useState } from "react";
// import api from "../../api/api";
// import { toast } from "react-toastify";
// import "./CourseManagement.css";
// import { useNavigate } from "react-router-dom";

// export default function CreateCourse() {
//   const [name, setName] = useState("");
//   const [section, setSection] = useState("");
//   const [description, setDescription] = useState("");
//   const navigate = useNavigate();
//   const [loading, setLoading] = useState(false);

//   const handleCreate = async () => {
//     if (!name) {
//       return toast.warn("Course name is required");
//     }

//     setLoading(true);

//     try {
//       await api.post("/google-classroom/courses", {
//         courseData: {
//           name,
//           section,
//           description,
//         }
//       });

//       toast.success("Course created successfully");

//       setName("");
//       setSection("");
//       setDescription("");

//     } catch (err) {
//       toast.error(err.response?.data?.error || "Failed to create course");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="pm-page">
//       <div className="pm-shell">

//         <header className="pm-header">
//           <h2>Create Google Classroom Course</h2>
//         </header>

//           <div className="pm-header-right">
//             <button className="pm-back" onClick={() => navigate("/manager/courses")}>
//               View Courses
//             </button>
//           </div>

//         <div className="pm-panel">

//           <div className="pm-input-group">
//             <label className="pm-input-label">Course Name</label>
//             <input
//               className="pm-input"
//               value={name}
//               onChange={(e) => setName(e.target.value)}
//               placeholder="e.g. AI Fundamentals"
//             />
//           </div>

//           <div className="pm-input-group">
//             <label className="pm-input-label">Section</label>
//             <input
//               className="pm-input"
//               value={section}
//               onChange={(e) => setSection(e.target.value)}
//               placeholder="e.g. Section A"
//             />
//           </div>

//           <div className="pm-input-group">
//             <label className="pm-input-label">Description</label>
//             <textarea
//               className="pm-input pm-textarea"
//               value={description}
//               onChange={(e) => setDescription(e.target.value)}
//               placeholder="Course description..."
//             />
//           </div>

//           <button
//             className="pm-mark-btn"
//             onClick={handleCreate}
//             disabled={loading}
//             style={{ marginTop: 20 }}
//           >
//             {loading ? "Creating..." : "Create Course"}
//           </button>

//         </div>


//       </div>
//     </div>
//   );
// }

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const role = user?.roleId?.name?.toLowerCase();

  // Fetch teachers list only if manager
  useEffect(() => {
    if (role === "manager" || role === "admin") {
      const fetchTeachers = async () => {
        try {
          const res = await api.get("/people/teachers"); // adjust to your endpoint
          setTeachers(res.data);
        } catch (err) {
          toast.error("Failed to load teachers");
        }
      };
      fetchTeachers();
    }
  }, [role]);

  const handleCreate = async () => {
    if (!name) return toast.warn("Course name is required");
    if ((role === "manager" || role === "admin") && !selectedTeacherId) return toast.warn("Please select a teacher");

    setLoading(true);

    try {
      const url = (role === "manager" || role === "admin")
        ? "/google-classroom/courses/manager-director"
        : "/google-classroom/courses/teacher";

      const payload = (role === "manager" || role === "admin")
        ? { courseData: { name, section, description }, teacherId: selectedTeacherId }
        : { courseData: { name, section, description }, userId: user.id };

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

          {/* Only show teacher dropdown for manager */}
          {(role === "manager" || role === "admin")&& (
            <div className="pm-input-group">
              <label className="pm-input-label">Assign Teacher</label>
              <select
                className="pm-input"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
              >
                <option value="">Select a teacher...</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
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