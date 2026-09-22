import { useState } from "react";
import usePhoneLayout from "../hooks/usePhoneLayout";
import { MIN_EXAMINER_COL_WIDTH_PCT, MAX_EXAMINER_COL_WIDTH_PCT, MIN_NOTE_BOX_HEIGHT_PCT, MAX_NOTE_BOX_HEIGHT_PCT, clampExaminerColumnWidthPercent, clampNoteBoxHeightPercent } from "../utils/examinerColumnLayout";

/** A tap/keyboard alternative to dragging small handles on the paper. */
export default function MobilePlacementControls({ questions, pageCount, columnWidth, onPlacement, onRename, onRemove }) {
  const phone = usePhoneLayout();
  const [selected, setSelected] = useState("");
  if (!phone || !questions.length) return null;
  const q = questions.find(row => String(row._placementIndex) === selected) || questions[0];
  const update = patch => onPlacement({ placementIndex: q._placementIndex, questionNumber: q.questionNumber, pageNumber: q.pageNumber, yPercent: q.yPercent, ...patch });
  return <details className="msv-mobile-placement">
    <summary>Adjust annotations</summary>
    <div className="msv-mobile-placement-fields">
      <label className="msv-mobile-placement-wide">Question<select value={q._placementIndex} onChange={e => setSelected(e.target.value)}>{questions.map(row => <option key={row._placementIndex} value={row._placementIndex}>Q{row.questionNumber} · page {row.pageNumber}</option>)}</select></label>
      {onRename && <label className="msv-mobile-placement-wide">Question label<input key={`${q._placementIndex}:${q.questionNumber}`} defaultValue={q.questionNumber} onBlur={e => { const label = e.target.value.trim(); if (label && label !== String(q.questionNumber)) onRename({ placementIndex: q._placementIndex, questionNumber: label }); }} /></label>}
      <label>Page<input type="number" inputMode="numeric" min="1" max={pageCount} value={q.pageNumber} onChange={e => { if (e.target.value) update({ pageNumber: Math.min(pageCount, Math.max(1, Number(e.target.value))) }); }} /></label>
      <label>Position (%)<input type="number" inputMode="decimal" min="5" max="92" value={q.yPercent} onChange={e => { if (e.target.value) update({ yPercent: Math.min(92, Math.max(5, Number(e.target.value))) }); }} /></label>
      <label>Note height (%)<input type="number" inputMode="decimal" min={MIN_NOTE_BOX_HEIGHT_PCT} max={MAX_NOTE_BOX_HEIGHT_PCT} value={q.noteBoxHeightPercent || 12} onChange={e => { if (e.target.value) update({ noteBoxHeightPercent: clampNoteBoxHeightPercent(e.target.value) }); }} /></label>
      <label>Column width (%)<input type="number" inputMode="decimal" min={MIN_EXAMINER_COL_WIDTH_PCT} max={MAX_EXAMINER_COL_WIDTH_PCT} value={columnWidth} onChange={e => { if (e.target.value) onPlacement({ examinerColumnWidthPercent: clampExaminerColumnWidthPercent(e.target.value) }); }} /></label>
      {onRemove && <button type="button" className="msv-mobile-placement-wide" onClick={() => onRemove(q._placementIndex)}>Remove Q{q.questionNumber}</button>}
      <p className="msv-mobile-placement-wide">Save changes to update the final PDF.</p>
    </div>
  </details>;
}
