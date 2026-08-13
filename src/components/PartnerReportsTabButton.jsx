import { useMemo } from "react";
import { FiUsers } from "react-icons/fi";
import { canReportOnPartner } from "../utils/gradingAccess";
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
 * canReportOnPartner rather than canGradeProvider, so this tab also appears in
 * the director's Reports page: reporting on a partner is oversight, and the
 * director is who owns the partner's logo and its parent-facing sends.
 *
 * The delegation grant is passed explicitly rather than left to the module
 * cache, so the tab appears the moment a director-delegated grant resolves
 * instead of only after the next reload.
 */
export default function PartnerReportsTabButton({ active = false, onNavigate }) {
  const { delegations } = useGradingDelegations();

  const hasAnyPartner = useMemo(
    () => PARTNER_SLUGS.some((slug) => canReportOnPartner(slug, delegations)),
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
