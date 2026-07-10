import Select from "react-select";

const teacherSelectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "#020818",
    borderColor: state.isFocused ? "rgba(14,165,233,0.55)" : "rgba(14,165,233,0.3)",
    color: "#e2e8f0",
    minHeight: "38px",
    boxShadow: state.isFocused ? "0 0 0 2px rgba(14,165,233,0.15)" : "none",
    borderRadius: "8px",
    fontSize: "13px",
    cursor: "pointer",
  }),
  singleValue: (base) => ({ ...base, color: "#e2e8f0" }),
  input: (base) => ({ ...base, color: "#e2e8f0" }),
  placeholder: (base) => ({ ...base, color: "#64748b" }),
  menu: (base) => ({
    ...base,
    backgroundColor: "#0f172a",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    overflow: "hidden",
    zIndex: 9999,
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: "280px",
    padding: "4px 0",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "rgba(14,165,233,0.35)"
      : state.isFocused
        ? "rgba(14,165,233,0.2)"
        : "transparent",
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: "13px",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base) => ({ ...base, color: "#94a3b8", padding: "0 8px" }),
};

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
      styles={teacherSelectStyles}
      placeholder="All teachers"
      noOptionsMessage={() => "No teachers found"}
    />
  );
}
