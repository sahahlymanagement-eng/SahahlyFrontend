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
 */
export default function PartnerLogoPanel({ slug, providerLabel }) {
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
        label={`${providerLabel} logo`}
        hint="Saved immediately. PNG with a transparent background works best — it sits on a dark navy header."
      />
    </section>
  );
}
