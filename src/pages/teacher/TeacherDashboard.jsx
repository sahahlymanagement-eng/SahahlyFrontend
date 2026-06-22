import TeacherSidebar from "./TeacherSidebar";
import "./TeacherDashboard.css";

export default function TeacherDashboard() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="teacher-layout">
      <TeacherSidebar />
<main className="teacher-content">
  <div className="welcome-card">
    <h1>
  Welcome back, <span className="teacher-name">{user.name}</span>
    </h1>
      <p>Your teaching workspace.</p>

  <div className="quick-tip">
    Open Course Management to create and manage assignments.
  </div>
  </div>
</main>
    </div>
  );
}