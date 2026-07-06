import { FiAlertTriangle, FiTrendingDown, FiTrendingUp } from "react-icons/fi";

function WatchlistGroup({ title, icon: Icon, tone, students, emptyText, valueKey, valueLabel }) {
  return (
    <div className={`mpr-watchlist-group mpr-watchlist-group--${tone}`}>
      <div className="mpr-watchlist-head">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      {students.length === 0 ? (
        <p className="mpr-watchlist-empty">{emptyText}</p>
      ) : (
        <ul className="mpr-watchlist-list">
          {students.map((s) => (
            <li key={`${title}-${s.name}`} className="mpr-watchlist-item">
              <div className="mpr-watchlist-item-top">
                <strong>{s.name}</strong>
                {s[valueKey] != null && (
                  <span className={`mpr-watchlist-value mpr-watchlist-value--${tone}`}>
                    {valueLabel ? valueLabel(s) : s[valueKey]}
                  </span>
                )}
              </div>
              {s.summary && <p className="mpr-watchlist-summary">{s.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StudentWatchlistsPreview({ watchlists }) {
  if (!watchlists) return null;

  const hasAny =
    watchlists.topImproving?.length ||
    watchlists.declining?.length ||
    watchlists.atRisk?.length;

  if (!hasAny) return null;

  return (
    <div className="mpr-watchlists">
      <div className="mpr-watchlists-title-row">
        <span className="mpr-watchlists-title">Student watchlists</span>
        {watchlists.assignmentWindow > 0 && (
          <span className="mpr-watchlists-meta">
            Last {watchlists.assignmentWindow} assignments
          </span>
        )}
      </div>

      <div className="mpr-watchlists-grid">
        <WatchlistGroup
          title="Top improving"
          icon={FiTrendingUp}
          tone="green"
          students={watchlists.topImproving || []}
          emptyText="No significant improvement detected yet."
          valueKey="changeDisplay"
        />
        <WatchlistGroup
          title="Declining"
          icon={FiTrendingDown}
          tone="orange"
          students={watchlists.declining || []}
          emptyText="No significant decline detected."
          valueKey="changeDisplay"
        />
        <WatchlistGroup
          title="At-risk"
          icon={FiAlertTriangle}
          tone="red"
          students={watchlists.atRisk || []}
          emptyText="No at-risk students flagged."
          valueKey="overallAverage"
          valueLabel={(s) =>
            s.overallAverage != null ? `${s.overallAverage}% avg` : "—"
          }
        />
      </div>
    </div>
  );
}
