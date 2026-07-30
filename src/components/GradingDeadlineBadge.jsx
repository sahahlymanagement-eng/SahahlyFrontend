import { FiClock } from "react-icons/fi";
import { useNow } from "../hooks/useNow";
import "./GradingDeadlineBadge.css";

/**
 * The deadline a director attached when delegating an external grading
 * assignment (LoginCSS / Mariam Gabalawy / Dr Peter) to this account.
 *
 * Renders nothing when there is no delegation, which is the normal case for the
 * org-wide grading account — so it can be dropped into an assignment card
 * unconditionally.
 *
 * @param {object}  props
 * @param {object}  props.delegation  { role, deadline, status } from the
 *   assignment index's `myDelegation`, or null.
 * @param {boolean} [props.showRole]  also label which hat the delegate wears.
 */
export default function GradingDeadlineBadge({ delegation, showRole = false }) {
  const now = useNow();

  if (!delegation?.deadline) return null;

  const due = new Date(delegation.deadline);
  if (Number.isNaN(due.getTime())) return null;

  // "Done" outranks the clock: a finished assignment past its deadline is not
  // something to keep flagging in red.
  const done = delegation.status === "DONE";
  const overdue = !done && due.getTime() < now;

  const tone = done ? "done" : overdue ? "overdue" : "due";

  return (
    <span
      className={`gdl-deadline gdl-deadline--${tone}`}
      title={`Your deadline for this assignment: ${due.toLocaleString()}`}
    >
      <FiClock size={10} aria-hidden />
      {done ? "Done · " : overdue ? "Overdue · " : "Due "}
      {due.toLocaleString()}
      {showRole && delegation.role ? ` · as ${delegation.role}` : ""}
    </span>
  );
}
