import { FiCheckSquare, FiSquare } from "react-icons/fi";

export default function MarkingSelectionBar({
  selectedCount,
  pageSelectableCount = 0,
  pageAllSelected = false,
  onTogglePage,
  onSelectAll,
  onClear,
  selectingAll = false,
}) {
  return (
    <div className="msv-mark-select-bar">
      <button
        type="button"
        className="msv-mark-select-btn"
        onClick={onTogglePage}
        disabled={!pageSelectableCount}
        title="Select or deselect all students on this page"
      >
        {pageAllSelected ? <FiCheckSquare size={14} /> : <FiSquare size={14} />}
        {pageAllSelected ? "Deselect page" : "Select page"}
      </button>
      <button
        type="button"
        className="msv-mark-select-btn"
        onClick={onSelectAll}
        disabled={selectingAll}
      >
        {selectingAll ? "Selecting…" : "Select all"}
      </button>
      <button
        type="button"
        className="msv-mark-select-btn msv-mark-select-btn--ghost"
        onClick={onClear}
        disabled={!selectedCount}
      >
        Clear
      </button>
      {selectedCount > 0 && (
        <span className="msv-mark-select-count">
          {selectedCount} selected for marking
        </span>
      )}
    </div>
  );
}
