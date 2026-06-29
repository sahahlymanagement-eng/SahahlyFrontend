import ManagerSidebar from "../../components/ManagerSidebar";
import ReportsWorkspace from "../../components/ReportsWorkspace";
import "./ManagerAssignments.css";

export default function ManagerAssignments() {
  return (
    <div className="ma-root">
      <ManagerSidebar />
      <ReportsWorkspace variant="manager" />
    </div>
  );
}
