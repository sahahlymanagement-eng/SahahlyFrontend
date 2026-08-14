import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { FiCalendar } from "react-icons/fi";
import "./DashboardPeriodFilter.css";

export default function DashboardPeriodFilter({
  from,
  to,
  setFrom,
  setTo,
  resetToThisMonth,
  monthLabel,
}) {
  return (
    <div className="dpf-bar">
      <span className="dpf-label">
        <FiCalendar size={14} />
        {monthLabel}
      </span>
      <label className="dpf-field">
        <span>From</span>
        <DatePicker
          selected={from}
          onChange={(d) => d && setFrom(d)}
          dateFormat="dd MMM yyyy"
          className="dpf-input"
          maxDate={to}
        />
      </label>
      <label className="dpf-field">
        <span>To</span>
        <DatePicker
          selected={to}
          onChange={(d) => d && setTo(d)}
          dateFormat="dd MMM yyyy"
          className="dpf-input"
          minDate={from}
        />
      </label>
      <button type="button" className="dpf-reset" onClick={resetToThisMonth}>
        This month
      </button>
      <span className="dpf-hint">Counts reset on the 1st of each month</span>
    </div>
  );
}
