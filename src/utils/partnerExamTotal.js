/**
 * Exam denominator for partner tabs (Dr Peter / Mariam / LoginCSS).
 * Mirrors backend resolvePartnerExamTotal — keep behaviour in sync.
 *
 * Precedence: local maxGrade → inventory when partner grade is missing/wrong → partner grade.
 */
export function resolvePartnerAssignmentMax({
  maxGrade = null,
  inventoryMaxMarks = null,
  partnerGrade = null,
} = {}) {
  const local = Number(maxGrade);
  if (Number.isFinite(local) && local > 0) return local;

  const inv = Number(inventoryMaxMarks);
  const partner = Number(partnerGrade);
  const hasInv = Number.isFinite(inv) && inv > 0;
  const hasPartner = Number.isFinite(partner) && partner > 0;

  if (hasInv && hasPartner) {
    const gap = Math.abs(partner - inv);
    if (gap > 3 && gap / inv > 0.15) return inv;
    return partner;
  }
  if (hasPartner) return partner;
  if (hasInv) return inv;
  return null;
}
