/**
 * Warns when the AI's page numbering did not span the student's PDF.
 *
 * `pageNumber` is used as a direct index into the student's pages, so when the
 * model skips a leading cover sheet every annotation prints one page early —
 * the cover carries page 2's answers and the last page is left bare. The
 * backend verifies and repairs that automatically when it can confirm the
 * leading pages hold no answers; this covers the cases it could not confirm,
 * where a human has to check the placement before the paper goes back.
 *
 * Backed by `result.pageCoverage` (see markingPageCoverage.js on the backend).
 */
export default function MarkingPageShiftNotice({ result }) {
  const coverage = result?.pageCoverage;
  if (!coverage) return null;

  // Already repaired, or nothing suspicious in the first place.
  if (coverage.appliedShift > 0) return null;
  if (!coverage.likelyPageShift) return null;

  const { likelyPageShift, maxReferencedPage, studentPageCount, shiftVerified } = coverage;
  const pageWord = likelyPageShift === 1 ? "page" : "pages";

  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        background: "rgba(251,191,36,0.1)",
        border: "1px solid rgba(251,191,36,0.25)",
        color: "#fcd34d",
      }}
    >
      Feedback may be on the wrong pages. The AI only used pages 1-{maxReferencedPage} of this{" "}
      {studentPageCount}-page script, which is what happens when it skips a cover sheet — every
      annotation would then sit {likelyPageShift} {pageWord} too early.{" "}
      {shiftVerified === false
        ? "An automatic check found answers on the first page, so nothing was moved."
        : "The automatic check could not confirm it, so nothing was moved."}{" "}
      Please open the annotated PDF and confirm each comment is beside the right answer before
      returning it.
    </div>
  );
}
