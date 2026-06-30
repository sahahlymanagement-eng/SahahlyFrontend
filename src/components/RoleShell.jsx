import "../pages/assistant/assistant.css";

export default function RoleShell({ sidebar, children }) {
  return (
    <div className="ast-root">
      {sidebar}
      <main className="ast-main">{children}</main>
    </div>
  );
}
