import { Outlet } from "react-router-dom";
import TeacherSidebar from "./TeacherSidebar";
import "./teacher.css";

export default function TeacherLayout() {
  return (
    <div className="tch-root">
      <TeacherSidebar />
      <main className="tch-main">
        <Outlet />
      </main>
    </div>
  );
}
