import Select from "react-select";
import { selectStyles } from "../utils/selectTheme";

export default function ReportTeacherFilterSelect({
  value,
  onChange,
  teachers,
  show = true,
  className = "ma-search-input msv-teacher-filter",
}) {
  if (!show) return null;

  const options = [
    { value: "all", label: "All teachers" },
    ...(teachers || []).map((t) => ({ value: t.id, label: t.name })),
  ];

  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <Select
      className={className}
      classNamePrefix="rtf"
      options={options}
      value={selected}
      onChange={(opt) => onChange(opt?.value || "all")}
      isSearchable
      maxMenuHeight={280}
      menuPlacement="auto"
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
      styles={selectStyles}
      placeholder="All teachers"
      noOptionsMessage={() => "No teachers found"}
    />
  );
}
