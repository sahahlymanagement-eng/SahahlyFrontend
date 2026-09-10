// Ali Nassef: Shared labelled search control for Partner Reports lists.
import { useId } from "react";
import { FiSearch, FiX } from "react-icons/fi";

export default function PartnerReportSearch({ label, placeholder, value, onChange, count }) {
  const id = useId();
  return (
    <div className="prw-search">
      <label htmlFor={id}><FiSearch aria-hidden="true" /> {label}</label>
      <div className="prw-search-controls">
        <input id={id} type="search" className="prw-input" placeholder={placeholder}
          value={value} onChange={(event) => onChange(event.target.value)} />
        {value && <button type="button" className="prw-btn prw-btn--ghost"
          aria-label={"Clear " + label.toLowerCase()} onClick={() => onChange("")}>
          <FiX aria-hidden="true" /> Clear
        </button>}
      </div>
      {value.trim() && count != null && <span className="prw-panel-sub" role="status">
        {count} matching result{count === 1 ? "" : "s"}
      </span>}
    </div>
  );
}
