import { useMemo } from "react";
import { FiUsers } from "react-icons/fi";
import { canGradeProvider } from "../utils/gradingAccess";
import { useGradingDelegations } from "../context/GradingNotificationContext";

const PARTNER_SLUGS = ["logincss", "mariamgabalawy", "drpeter"];

/**
 * The "Partner Reports" entry in the Reports tab bar.
 *
 * Its own component purely so the access gate lives in one place: the tab bar is
 * repeated across four report workspaces, and a teacher (or any account not
 * granted a grading partner) must not see this tab in any of them. Renders
 * nothing at all for those accounts.
 *
 * The delegation grant is passed explicitly to canGradeProvider rather than left
 * to its module cache, so the tab appears the moment a director-delegated grant
 * resolves instead of only after the next reload.
 */
export default function PartnerReportsTabButton({ active = false, onNavigate }) {
  const { delegations } = useGradingDelegations();

  const hasAnyPartner = useMemo(
    () => PARTNER_SLUGS.some((slug) => canGradeProvider(slug, delegations)),
    [delegations]
  );

  if (!hasAnyPartner) return null;

  return (
    <button
      type="button"
      className={`ma-report-tab ${active ? "ma-report-tab--active" : ""}`}
      onClick={active ? undefined : () => onNavigate?.("partner")}
    >
      <FiUsers size={12} /> Partner Reports
    </button>
  );
}
