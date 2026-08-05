import { Link } from "react-router-dom";
import { FiSun, FiMoon, FiArrowLeft, FiShield, FiLock } from "react-icons/fi";
import logo from "../assets/images/Logo-trimmed-hd.png";
import { useTheme } from "../context/ThemeContext";
import "./PrivacySecurityPolicy.css";

const LAST_UPDATED = "4 August 2026";

export default function PrivacySecurityPolicy() {
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
              <FiShield size={22} />
            </span>
            <div>
              <h1>Privacy &amp; Security Policy</h1>
              <p className="psp-updated">Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
          <p className="psp-lead">
            Sahahly is an academic workflow platform used by schools and education
            teams to manage classrooms, submissions, marking, and parent
            communication. This policy explains what information we handle, how we
            protect it, and how we use it.
          </p>
        </header>

        <nav className="psp-toc" aria-label="On this page">
          <a href="#privacy">Privacy</a>
          <a href="#security">Security</a>
          <a href="#your-choices">Your choices</a>
          <a href="#contact">Contact</a>
        </nav>

        <article className="psp-content">
          <section id="privacy" className="psp-section">
            <div className="psp-section-head">
              <FiLock size={18} />
              <h2>Privacy</h2>
            </div>

            <h3>1. Who this policy covers</h3>
            <p>
              This policy applies to the Sahahly Operations platform and related
              services at Sahahly, including teacher, manager, assistant, director,
              and quality-team accounts.
            </p>

            <h3>2. Information we process</h3>
            <p>Depending on how your organization uses Sahahly, we may process:</p>
            <ul>
              <li>
                <strong>Account details</strong> — name, email, phone number, role,
                and login credentials for staff users.
              </li>
              <li>
                <strong>Classroom &amp; academic data</strong> — classroom names,
                subjects, assignments, due dates, workflow status, and related
                operational records.
              </li>
              <li>
                <strong>Student &amp; parent contact data</strong> — student names,
                emails, submission identifiers, and parent contact details used to
                send reports where authorized by your organization.
              </li>
              <li>
                <strong>Submission files</strong> — student work (typically PDFs),
                mark schemes, annotated/returned papers, grades, and marking
                feedback.
              </li>
              <li>
                <strong>Connected Google services</strong> — Google Classroom and
                Google Drive data required to sync courses, coursework, and
                submission files when your organization connects Google accounts.
              </li>
              <li>
                <strong>Usage &amp; operations data</strong> — login activity,
                workflow actions, AI marking usage metrics, and system logs needed
                to operate and improve the service.
              </li>
            </ul>

            <h3>3. How we use information</h3>
            <p>We use this information to:</p>
            <ul>
              <li>Provide marking, review, reporting, and classroom workflow tools</li>
              <li>Sync authorized Google Classroom / Drive content</li>
              <li>Send parent or group communications when configured by your team</li>
              <li>Maintain account access, role permissions, and auditability</li>
              <li>Protect the platform against abuse, fraud, and security incidents</li>
              <li>Improve reliability, support, and product quality</li>
            </ul>
            <p>
              We do not sell personal data. Student academic materials and contact
              details are processed for education operations on behalf of the
              organization using Sahahly.
            </p>

            <h3>4. Sharing of information</h3>
            <p>Information may be shared only as needed with:</p>
            <ul>
              <li>
                Authorized users inside your organization, based on assigned roles
              </li>
              <li>
                Service providers that help us operate the platform (for example
                hosting, email/WhatsApp delivery, or AI processing providers), under
                appropriate safeguards
              </li>
              <li>
                Google, when your organization connects Classroom/Drive accounts
                and requests sync or file access
              </li>
              <li>
                Authorities, if required by law or to protect the rights and safety
                of users and the platform
              </li>
            </ul>

            <h3>5. Data retention</h3>
            <p>
              We retain account, classroom, submission, and operational records for
              as long as needed to provide the service to your organization, meet
              legal or contractual requirements, and support legitimate business
              operations such as security and dispute resolution. Organizations may
              request removal or archival of classroom and related data through
              their Sahahly administrators.
            </p>

            <h3>6. Children and student data</h3>
            <p>
              Sahahly is designed for education organizations and staff users. Any
              student or parent information is handled for school operations under
              the direction of the school/organization that owns the account
              relationship. Schools and administrators are responsible for ensuring
              they have the right to collect and process that information.
            </p>
          </section>

          <section id="security" className="psp-section">
            <div className="psp-section-head">
              <FiShield size={18} />
              <h2>Security</h2>
            </div>

            <h3>7. How we protect information</h3>
            <p>We apply technical and organizational measures including:</p>
            <ul>
              <li>Authenticated access with role-based permissions</li>
              <li>Encrypted transport (HTTPS) for web traffic</li>
              <li>Access controls that limit users to their assigned classrooms and roles</li>
              <li>Secure handling of connected Google credentials and tokens</li>
              <li>Logging and monitoring for operational and security support</li>
              <li>
                Careful handling of submission files and marking outputs during
                storage, preview, and return workflows
              </li>
            </ul>

            <h3>8. Account security</h3>
            <p>
              Users are responsible for keeping login credentials confidential,
              using strong passwords, and signing out on shared devices.
              Organizations should promptly revoke access when a staff member leaves
              or changes role.
            </p>

            <h3>9. Third-party services</h3>
            <p>
              Sahahly may rely on trusted third-party infrastructure and AI
              providers to process submissions for marking support. Those providers
              process data only as needed to deliver the requested features.
              Connected Google Classroom / Drive permissions are controlled by your
              organization&apos;s Google account settings and consent choices.
            </p>

            <h3>10. Incident response</h3>
            <p>
              If we become aware of a security incident that affects personal data,
              we will investigate promptly and notify affected organizations as
              appropriate, in line with applicable obligations.
            </p>
          </section>

          <section id="your-choices" className="psp-section">
            <h2>Your choices</h2>
            <p>Depending on your role and applicable law, you may request to:</p>
            <ul>
              <li>Access or correct staff account information</li>
              <li>Update classroom, student, or parent contact records you manage</li>
              <li>Disconnect Google accounts where your organization allows it</li>
              <li>Ask your organization administrator about deletion or retention of records</li>
            </ul>
            <p>
              Because Sahahly is typically operated for a school/organization, many
              student-related requests should go through that organization&apos;s
              administrator first.
            </p>
          </section>

          <section id="contact" className="psp-section">
            <h2>Contact</h2>
            <p>
              For privacy or security questions about Sahahly, visit our{" "}
              <Link to="/support">Support page</Link>.
            </p>
            <p>
              Website:{" "}
              <a href="https://sahahly.com" target="_blank" rel="noopener noreferrer">
                sahahly.com
              </a>
            </p>
          </section>

          <section className="psp-section psp-section--note">
            <p>
              This policy may be updated from time to time. The &quot;Last
              updated&quot; date at the top of this page will change when we publish
              revisions. Continued use of Sahahly after an update means the revised
              policy applies to that use.
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
