import { FiRefreshCw } from "react-icons/fi";

export default function ReportGradesRefreshButton({
  onClick,
  loading = false,
  disabled = false,
  compact = false,
}) {
  return (
    <button
      type="button"
      className={`ma-grades-refresh-btn${compact ? " ma-grades-refresh-btn--compact" : ""}`}
      onClick={onClick}
      disabled={disabled || loading}
      title="Pull latest grades from Google Classroom"
    >
      <FiRefreshCw
        size={compact ? 13 : 14}
        className={loading ? "ma-grades-refresh-spin" : ""}
      />
      {!compact && (loading ? "Refreshing grades…" : "Refresh grades")}
    </button>
  );
}
