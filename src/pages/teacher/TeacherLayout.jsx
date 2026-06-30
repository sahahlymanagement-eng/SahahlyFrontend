import { Outlet } from "react-router-dom";
import TeacherSidebar from "./TeacherSidebar";
import RoleShell from "../../components/RoleShell";

export default function TeacherLayout() {
  return (
    <RoleShell sidebar={<TeacherSidebar />}>
      <Outlet />
    </RoleShell>
  );
}
