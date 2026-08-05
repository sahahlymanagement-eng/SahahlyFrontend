import { FiSend } from "react-icons/fi";
import "./GradingTeamAlert.css";

/**
 * The assistant(s) delegated on this assignment, visible only to the manager
 * also delegated to it as 'manager' (see `teamDelegations` on the assignment
 * index — src/services/gradingDelegationScope.js on the backend), with a
 * button to manually nudge them via WhatsApp.
 *
 * Renders nothing when there's no team delegation to show, so it can be
 * dropped into an assignment card unconditionally.
 *
 * @param {object}   props
 * @param {object[]} props.teamDelegations  [{ _id, name, deadline, status }]
 * @param {(delegationId: string) => void} props.onSendAlert
 * @param {string|null} props.sendingId  the delegation id currently in flight
 */
export default function GradingTeamAlert({ teamDelegations, onSendAlert, sendingId }) {
  if (!teamDelegations?.length) return null;

  return (
    <div className="gta-team">
      {teamDelegations.map((t) => (
        <div key={t._id} className="gta-row">
          <span className="gta-name">{t.name || "Assistant"}</span>
          {t.deadline && (
            <span className="gta-deadline">{new Date(t.deadline).toLocaleString()}</span>
          )}
          <button
            type="button"
            className="gta-sendBtn"
            disabled={sendingId === t._id}
            onClick={(e) => {
              e.stopPropagation();
              onSendAlert(t._id);
            }}
          >
            <FiSend size={10} aria-hidden />
            {sendingId === t._id ? "Alerting…" : "Alert Assistant"}
          </button>
        </div>
      ))}
    </div>
  );
}
