import { FiImage } from "react-icons/fi";
import LogoPicker from "./LogoPicker";

/**
 * The logo drawn on this partner's report PDFs.
 *
 * Owned by the partner rather than by a teacher account: a partner assignment has
 * no classroom and no teacher record (their report meta carries `teacherName: "—"`),
 * so the partner slug is the only stable brand identity available.
 *
 * Keyed on `slug` so switching the partner tab remounts the picker and it cannot
 * show the previous partner's logo.
 *
 * `readOnly` for accounts the logo API refuses writes from (anyone but
 * director / admin / backup): a grading manager can see which mark goes on the
 * partner's reports without being offered an upload that would 403.
 */
export default function PartnerLogoPanel({ slug, providerLabel, readOnly = false }) {
  return (
    <section className="prw-panel">
      <div className="prw-panel-head">
        <div>
          <h2 className="prw-panel-title">
            <FiImage size={15} /> {providerLabel} logo
          </h2>
          <p className="prw-panel-sub">
            Drawn beside the Sahahly logo on every {providerLabel} report PDF —
            collective, monthly parent, and executive analysis.
          </p>
        </div>
      </div>

      <LogoPicker
        key={slug}
        ownerType="partner"
        ownerKey={slug}
        readOnly={readOnly}
        label={`${providerLabel} logo`}
        hint={
          readOnly
            ? "Set by a director from the Reports tab."
            : "Saved immediately. PNG with a transparent background works best — it sits on a dark navy header."
        }
      />
    </section>
  );
}
