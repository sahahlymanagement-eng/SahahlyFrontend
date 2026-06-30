export default function ReportAttendanceSelect({ present, onChange }) {
  return (
    <select
      className="ma-attendance-select"
      value={present ? "present" : "absent"}
      onChange={(e) => onChange(e.target.value === "present")}
      onClick={(e) => e.stopPropagation()}
    >
      <option value="present">Present</option>
      <option value="absent">Absent</option>
    </select>
  );
}
