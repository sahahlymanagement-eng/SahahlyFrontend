import { Outlet } from "react-router-dom";
import AssistantSidebar from "./AssistantSidebar";
import "./assistant.css";

export default function AssistantLayout() {
  return (
    <div className="ast-root">
      <AssistantSidebar />
      <main className="ast-main">
        <Outlet />
      </main>
    </div>
  );
}
