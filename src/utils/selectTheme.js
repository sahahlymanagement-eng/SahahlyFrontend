/**
 * Shared react-select styling, built on Sahahly's design tokens (src/styles/theme.css).
 *
 * react-select accepts CSS `var(--x)` strings as inline style values and they
 * resolve per-theme at paint time — including menus rendered through
 * `menuPortalTarget={document.body}` — because the tokens are defined on
 * `:root`. So every value below is a `var(...)` (or a `color-mix()` built
 * from one), never a hardcoded color.
 *
 * Based on ManagerDashboard's original `customSelectStyles` (control,
 * singleValue, input, placeholder, menu, option) with the additions
 * ReportTeacherFilterSelect needs layered on top (menuList, menuPortal,
 * indicatorSeparator, dropdownIndicator, and an isSelected option state).
 *
 * Usage:
 *   import { selectStyles } from "../utils/selectTheme"; // adjust relative path
 *   <Select styles={selectStyles} ... />
 *
 * Per-call overrides (e.g. a fixed minWidth, or a bumped portal z-index)
 * should spread over the base object rather than editing it here:
 *   <Select styles={{ ...selectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }} />
 */
export const selectStyles = {
  control: (base) => ({
    ...base,
    backgroundColor: "var(--surface-2)",
    borderColor: "var(--border)",
    color: "var(--text-primary)",
    boxShadow: "none",
    borderRadius: "10px",
    fontSize: "13px",
  }),
  singleValue: (base) => ({ ...base, color: "var(--text-primary)" }),
  input: (base) => ({ ...base, color: "var(--text-primary)" }),
  placeholder: (base) => ({ ...base, color: "var(--muted)" }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--surface)",
    zIndex: 50,
    border: "1px solid var(--border)",
    borderRadius: "10px",
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: "280px",
    padding: "4px 0",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "color-mix(in srgb, var(--primary) 40%, var(--surface))"
      : state.isFocused
        ? "color-mix(in srgb, var(--primary) 22%, var(--surface))"
        : "var(--surface)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: "13px",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base) => ({ ...base, color: "var(--muted)" }),
};
