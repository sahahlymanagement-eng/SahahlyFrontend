import { Link } from "react-router-dom";
import { FiSun, FiMoon, FiArrowLeft, FiVideo, FiSettings, FiTrash2 } from "react-icons/fi";
import logo from "../assets/images/Logo-trimmed-hd.png";
import { useTheme } from "../context/ThemeContext";
import "./PrivacySecurityPolicy.css";

export default function ZoomDocumentation() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="psp-page">
      <button
        type="button"
        className="psp-theme-toggle"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
      </button>

      <div className="psp-bg-orb psp-bg-orb--1" />
      <div className="psp-bg-orb psp-bg-orb--2" />

      <div className="psp-shell">
        <header className="psp-header">
          <Link to="/login" className="psp-back">
            <FiArrowLeft size={16} />
            Back to Login
          </Link>
          <img src={logo} alt="Sahahly" className="psp-logo" />
          <div className="psp-title-row">
            <span className="psp-title-icon" aria-hidden>
              <FiVideo size={22} />
            </span>
            <div>
              <h1>Zoom Documentation</h1>
            </div>
          </div>
          <p className="psp-lead">
            Sahahly integrates with Zoom to run your organization&apos;s online
            classes. Once connected, Sahahly schedules Zoom meetings for your class
            sessions, records attendance automatically after each class, and
            publishes class recordings to your course content library. This guide
            explains how to connect Zoom, what the integration does, and how to
            remove it.
          </p>
          <p className="psp-lead">
            Who can use this integration: the Zoom connection is managed by the
            organization owner (director). One Zoom account is connected per
            organization. Teachers, students, and parents never interact with Zoom
            directly through Sahahly — they only see join links and recordings
            inside the platform.
          </p>
        </header>

        <nav className="psp-toc" aria-label="On this page">
          <a href="#prerequisites">Prerequisites</a>
          <a href="#adding-the-app">Adding the app</a>
          <a href="#using-the-app">Using the app</a>
          <a href="#removing-the-app">Removing the app</a>
          <a href="#data-handling">Data handling</a>
          <a href="#troubleshooting">Troubleshooting &amp; support</a>
        </nav>

        <article className="psp-content">
          <section id="prerequisites" className="psp-section">
            <h2>Prerequisites</h2>
            <ul>
              <li>A Sahahly organization with an active director account.</li>
              <li>
                A Zoom account with permission to create meetings and cloud
                recordings (cloud recording requires a paid Zoom plan).
              </li>
            </ul>
          </section>

          <section id="adding-the-app" className="psp-section">
            <div className="psp-section-head">
              <FiSettings size={18} />
              <h2>Adding the app (connecting Zoom)</h2>
            </div>
            <ol>
              <li>Sign in to Sahahly as the organization owner.</li>
              <li>
                Go to Organization Settings → Integrations → Zoom and click
                Connect Zoom.
              </li>
              <li>
                You will be redirected to Zoom&apos;s authorization page. Review
                the requested permissions and click Allow.
              </li>
              <li>
                You are returned to Sahahly. The Integrations page now shows your
                Zoom connection status as Connected.
              </li>
            </ol>
            <p>
              That&apos;s it — no further setup is needed. Sahahly stores the
              authorization securely on its servers and keeps it refreshed
              automatically.
            </p>
          </section>

          <section id="using-the-app" className="psp-section">
            <h2>Using the app</h2>
            <p>
              Everything below happens automatically once Zoom is connected:
            </p>

            <h3>Scheduling online classes</h3>
            <p>
              When a teacher schedules a class session with delivery type
              &quot;Online,&quot; Sahahly creates a Zoom meeting on the connected
              account with the session&apos;s title, start time, and duration,
              with cloud recording enabled. The join link appears on the session
              page for enrolled students. If the session is rescheduled, the Zoom
              meeting is updated to match.
            </p>

            <h3>Attendance</h3>
            <p>
              When the Zoom meeting ends, Sahahly retrieves the meeting&apos;s
              participant list and marks enrolled students as present by matching
              their email address, including their join time. Participants who
              are not enrolled students of that class are ignored and their data
              is not stored. Teachers can review and adjust attendance afterward.
            </p>

            <h3>Recordings and transcripts</h3>
            <p>
              When the cloud recording is ready, Sahahly automatically downloads
              it and publishes it to the class&apos;s content library, where only
              enrolled students of that class can watch it. If Zoom generated an
              audio transcript, it is attached alongside the recording.
            </p>
          </section>

          <section id="removing-the-app" className="psp-section">
            <div className="psp-section-head">
              <FiTrash2 size={18} />
              <h2>Removing the app (disconnecting Zoom)</h2>
            </div>
            <ol>
              <li>Sign in to Sahahly as the organization owner.</li>
              <li>
                Go to Organization Settings → Integrations → Zoom and click
                Disconnect Zoom.
              </li>
              <li>
                The stored Zoom authorization (access and refresh tokens) is
                deleted immediately.
              </li>
            </ol>
            <p>
              After disconnecting: no new Zoom meetings are created, and
              attendance sync and recording ingestion stop. Already-published
              recordings and past attendance records remain in your
              organization&apos;s library and records, under your
              organization&apos;s control. Join links for previously scheduled
              meetings may stop working if the meetings are deleted on the Zoom
              side.
            </p>
            <p>
              You can also revoke Sahahly&apos;s access from the Zoom side at any
              time: sign in to the Zoom App Marketplace, go to Manage → Added
              Apps, find Sahahly, and click Remove. If you do this, reconnect
              from Sahahly&apos;s Integrations page to resume the integration.
            </p>
          </section>

          <section id="data-handling" className="psp-section">
            <h2>Data handling</h2>
            <p>
              Sahahly stores only what the features above require: the Zoom
              meeting ID/UUID and join link on each class session; attendance
              status, join time, and participant ID for enrolled students; and
              the recording and transcript files in the organization&apos;s
              content library. OAuth tokens are stored encrypted on
              Sahahly&apos;s servers and are never exposed to users. For full
              details, see our{" "}
              <Link to="/privacy-security">Privacy Policy</Link>.
            </p>
          </section>

          <section id="troubleshooting" className="psp-section">
            <h2>Troubleshooting &amp; support</h2>
            <ul>
              <li>
                &quot;Zoom is not connected&quot; when scheduling an online class
                — the organization owner needs to connect Zoom under
                Organization Settings → Integrations.
              </li>
              <li>
                Attendance didn&apos;t record — attendance is matched by email;
                students must join the meeting using the same email address
                registered on their Sahahly account.
              </li>
              <li>
                Recording didn&apos;t appear — cloud recording requires a paid
                Zoom plan, and processing can take some time after the meeting
                ends before the recording is published.
              </li>
            </ul>
            <p>
              For help, visit our <Link to="/support">Support page</Link>.
            </p>
          </section>
        </article>

        <footer className="psp-footer">
          <Link to="/login">Login</Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Sahahly</span>
        </footer>
      </div>
    </div>
  );
}
