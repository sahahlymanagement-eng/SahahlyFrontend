import "../pages/assistant/assistant.css";
import "../styles/ui-polish.css";

export default function RoleShell({ sidebar, children }) {
  return (
    <div className="ast-root">
      {sidebar}
      <main className="ast-main">{children}</main>
    </div>
  );
}
