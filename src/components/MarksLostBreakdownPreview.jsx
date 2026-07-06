import { FiPieChart } from "react-icons/fi";

const DEFAULT_COLORS = {
  "Method marks": "#2563eb",
  "Calculation mistakes": "#dc2626",
  "Missing keywords": "#14b8a6",
  "Missing units": "#7c3aed",
  "Formula mistakes": "#0f2854",
  "Careless errors": "#ea580c",
};

function barColor(row) {
  if (row.color?.length === 3) {
    return `rgb(${row.color.join(",")})`;
  }
  return DEFAULT_COLORS[row.category] || "#64748b";
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
