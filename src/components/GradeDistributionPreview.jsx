export default function GradeDistributionPreview({ distribution = [] }) {
  if (!distribution.length) return null;

  const max = Math.max(...distribution.map((d) => d.value || 0), 1);

  return (
    <div className="mpr-grade-dist">
      <p className="mpr-grade-dist-title">Grade distribution</p>
      <ul className="mpr-grade-dist-list">
        {distribution.map((band) => {
          const pct = Math.round(((band.value || 0) / max) * 100);
          const color = band.color
            ? `rgb(${band.color.join(",")})`
            : "#2563eb";
          return (
            <li key={band.label} className="mpr-grade-dist-row">
              <span className="mpr-grade-dist-label">{band.label}</span>
              <div className="mpr-grade-dist-track">
                <div
                  className="mpr-grade-dist-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span className="mpr-grade-dist-count">{band.display ?? band.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
