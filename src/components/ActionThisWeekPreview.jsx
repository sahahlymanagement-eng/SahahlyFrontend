import { FiCheckSquare } from "react-icons/fi";

export default function ActionThisWeekPreview({ actions = [] }) {
  if (!actions.length) return null;

  return (
    <div className="mpr-action-week">
      <div className="mpr-action-week-head">
        <FiCheckSquare size={15} />
        <span>What to do this week</span>
      </div>
      <ol className="mpr-action-week-list">
        {actions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  );
}
