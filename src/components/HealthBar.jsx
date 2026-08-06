import "./HealthBar.css";

/**
 * A single 0-100 health score as a labeled bar — same score/band contract the
 * backend computes in src/utils/healthScore.js (good >=70, warning >=40,
 * critical <40, null when there's no data to score yet).
 */
export default function HealthBar({ score, band }) {
  if (score == null) {
    return <span className="health-bar-none">—</span>;
  }

  return (
    <div className="health-bar-wrap">
      <strong className={`health-bar-score health-bar-score--${band}`}>{score}</strong>
      <div className="health-bar-track">
        <div
          className={`health-bar-fill health-bar-fill--${band}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}
