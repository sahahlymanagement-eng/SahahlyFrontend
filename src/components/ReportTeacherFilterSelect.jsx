export default function ReportTeacherFilterSelect({
  value,
  onChange,
  teachers,
  show = true,
  className = "ma-search-input msv-teacher-filter",
}) {
  if (!show) return null;

  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All teachers</option>
      {(teachers || []).map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
