import { FiPieChart } from "react-icons/fi";

// Categorical data-viz palette (NOT semantic status colors — do not swap for
// --success/--warning/--danger, that would make slices indistinguishable).
// Chosen per the `dataviz` skill's categorical-palette method and validated
// with scripts/validate_palette.js against BOTH themes' real chart surfaces:
// light --surface #FFFFFF and dark --surface #3C5262. In this fixed order
// (adjacent pairs, matching how the donut/list actually render) the palette
// clears every hard gate in both modes: CVD separation >= 8.4 (target >= 8),
// normal-vision floor >= 19.3 (target >= 15), chroma >= 0.1, lightness inside
// each mode's band. Dark-mode contrast lands in the WARN band (surface
// #3C5262 is a mid-lightness color, not near-black) — legal only because
// every slice already ships secondary encoding (visible category label +
// percentage text beside each swatch), which is the required relief.
// Hues lean into the brand: slot 1 is a chambray-family blue, slot 6 a
// terracotta-family burnt orange; the remaining four (green/magenta/amber/
// teal) fill out the identity space these six fixed categories need.
// This is the one place in the parent-report surface allowed to keep literal
// hex per the theming migration brief — everywhere else uses theme.css tokens.
const DEFAULT_COLORS = {
  "Method marks": "#3d82be",
  "Calculation mistakes": "#1f7a1f",
  "Missing keywords": "#d55181",
  "Missing units": "#c98500",
  "Formula mistakes": "#159e78",
  "Careless errors": "#b85c34",
};

function barColor(row) {
  if (row.color?.length === 3) {
    return `rgb(${row.color.join(",")})`;
  }
  // Fallback for an unrecognized category — a plain theme-aware neutral,
  // not part of the validated 6-hue categorical set above.
  return DEFAULT_COLORS[row.category] || "var(--muted)";
}

export default function MarksLostBreakdownPreview({ breakdown = [] }) {
  if (!breakdown.length) return null;

  const total = breakdown.reduce((sum, row) => sum + (row.count || 0), 0) || 1;

  return (
    <div className="mpr-marks-lost">
      <div className="mpr-marks-lost-head">
        <FiPieChart size={15} />
        <span>Marks lost breakdown</span>
      </div>
      <p className="mpr-marks-lost-hint">
        Where marks were lost across marked work — pie share and percentage by category.
      </p>

      <div className="mpr-marks-lost-chart" aria-hidden>
        <div
          className="mpr-marks-lost-donut"
          style={{
            background: `conic-gradient(${breakdown
              .map((row, i) => {
                const start = breakdown
                  .slice(0, i)
                  .reduce((s, r) => s + (r.percent ?? 0), 0);
                const end = start + (row.percent ?? 0);
                return `${barColor(row)} ${start}% ${end}%`;
              })
              .join(", ")})`,
          }}
        />
      </div>

      <ul className="mpr-marks-lost-list">
        {breakdown.map((row) => {
          const pct = row.percent ?? Math.round(((row.count || 0) / total) * 100);
          return (
            <li key={row.category} className="mpr-marks-lost-row">
              <div className="mpr-marks-lost-row-head">
                <span className="mpr-marks-lost-label">{row.category}</span>
                <span className="mpr-marks-lost-pct">{pct}%</span>
              </div>
              <div className="mpr-marks-lost-bar-track">
                <div
                  className="mpr-marks-lost-bar-fill"
                  style={{ width: `${pct}%`, background: barColor(row) }}
                />
              </div>
              {row.count > 0 && (
                <span className="mpr-marks-lost-count">{row.count} marks lost</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
