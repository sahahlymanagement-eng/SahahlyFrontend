import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import logo from "./assets/sahahly-logo.png";
import { Icon, ToastHost, useTheme } from "./ui.jsx";
import Library from "./views/Library.jsx";
import ExamDetail from "./views/ExamDetail.jsx";
import Grade from "./views/Grade.jsx";
import RunDetail from "./views/RunDetail.jsx";
import PaperDetail from "./views/PaperDetail.jsx";

function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "exams" && parts[1]) return { name: "exam", examId: parts[1] };
  if (parts[0] === "runs" && parts[1]) return { name: "run", runId: parts[1] };
  if (parts[0] === "papers" && parts[1]) return { name: "paper", gradingId: parts[1] };
  if (parts[0] === "grade") return { name: "grade", examId: parts[1] || null };
  return { name: "library" };
}

const NAV = [
  { id: "library", href: "#/", icon: "library", label: "Exam library", match: ["library", "exam"] },
  { id: "grade", href: "#/grade", icon: "mark", label: "Mark scripts", match: ["grade", "run", "paper"] },
];

export default function App() {
  const embedded = new URLSearchParams(window.location.search).get("embedded") === "1";
  const [route, setRoute] = useState(parseHash);
  const [health, setHealth] = useState(null);
  const [counts, setCounts] = useState({ exams: null, runs: null });
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sahahly-sidebar") === "collapsed"
  );
  const [drawer, setDrawer] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setDrawer(false);
    };
    window.addEventListener("hashchange", onHash);
    api.health().then(setHealth).catch(() => setHealth({ ok: false, gemini: false }));
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Sidebar badge counts, refreshed gently in the background.
  useEffect(() => {
    const load = () =>
      Promise.all([api.exams().catch(() => []), api.runs().catch(() => [])]).then(
        ([exams, runs]) => setCounts({ exams: exams.length, runs: runs.length })
      );
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [route.name]);

  useEffect(() => {
    localStorage.setItem("sahahly-sidebar", collapsed ? "collapsed" : "open");
  }, [collapsed]);

  const page = useMemo(() => {
    if (route.name === "exam") return <ExamDetail examId={route.examId} embedded={embedded} />;
    if (route.name === "run") return <RunDetail runId={route.runId} />;
    if (route.name === "paper") return <PaperDetail gradingId={route.gradingId} />;
    if (embedded) return <p>Close this window to select students in the assignment viewer.</p>;
    if (route.name === "grade") return <Grade examId={route.examId} />;
    return <Library />;
  }, [route, embedded]);

  if (embedded) return <ToastHost><div className="page" style={{ padding: 24 }}>{page}</div></ToastHost>;

  const shellClass = ["shell", collapsed ? "collapsed" : "", drawer ? "drawer-open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <ToastHost>
      <div className={shellClass}>
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} />

        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <a href="#/" aria-label="Sahahly">
                <img className="brand-logo" src={logo} alt="Sahahly" />
              </a>
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setCollapsed((c) => !c)}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Icon name={collapsed ? "chevronRight" : "chevronLeft"} />
              </button>
            </div>
            <p className="sidebar-tagline">Dr Peter — Indexing</p>
          </div>

          <nav className="sidebar-nav">
            <span className="nav-label">Workspace</span>
            {NAV.map((item) => {
              const count = item.id === "library" ? counts.exams : counts.runs;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`nav-item ${item.match.includes(route.name) ? "active" : ""}`}
                  title={item.label}
                >
                  <span className="nav-icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span className="nav-text">{item.label}</span>
                  {count != null && count > 0 && <span className="nav-count">{count}</span>}
                </a>
              );
            })}
          </nav>

          <div className="sidebar-bottom">
            <div className={`health-dot ${health && !health.gemini ? "down" : ""}`}>
              <i />
              <span className="nav-text">
                {health ? (health.gemini ? "Gemini connected" : "No Gemini key") : "Checking…"}
              </span>
            </div>
            <button type="button" className="theme-toggle" onClick={toggle}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
              <span className="nav-text">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
          </div>
        </aside>

        <div className="main">
          <div className="mobile-bar">
            <button
              type="button"
              className="icon-button"
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" />
            </button>
            <img src={logo} alt="Sahahly" />
          </div>

          {health && !health.gemini && (
            <div className="banner">
              <Icon name="alert" size={15} />
              <span>
                Gemini key is missing. Add <code>GEMINI_API_KEY</code> to <code>.env</code> and
                restart <code>npm run dev</code>.
              </span>
            </div>
          )}

          <div className="scroll-area">
            <div className="page">{page}</div>
          </div>
        </div>
      </div>
    </ToastHost>
  );
}
