/**
 * Guards against publishing / returning papers the AI clearly under-marked.
 * Flags are set by backend markSchemeBackfill (markingFailed / markingIncomplete).
 */

export function getMarkingIntegrityState(result) {
  const info = result?.markingCompleteness || {};
  const failed = Boolean(result?.markingFailed || info.markingFailed);
  const incomplete = Boolean(result?.markingIncomplete || info.markingIncomplete);
  const coverage =
    typeof info.marksCoverage === "number" ? info.marksCoverage : null;
  const backfilled = Number(info.backfilledCount) || 0;
  return { failed, incomplete, coverage, backfilled, info };
}

/**
 * @returns {{ level: 'block'|'warn', title: string, message: string } | null}
 */
export function getMarkingIntegrityPublishGate(result) {
  const { failed, incomplete, coverage, backfilled } = getMarkingIntegrityState(result);
  if (failed) {
    return {
      level: "block",
      title: "Marking failed",
      message:
        "Automated marking matched no questions on this script. Re-mark before publishing — zeros are not a student score.",
    };
  }
  if (incomplete) {
    const covPct =
      coverage != null ? ` Mark-scheme coverage was about ${Math.round(coverage * 100)}%.` : "";
    return {
      level: "warn",
      title: "Marking incomplete",
      message:
        `Many mark-scheme questions were not graded in this run.${covPct}` +
        (backfilled
          ? ` ${backfilled} blank row(s) were added for review.`
          : "") +
        " Re-mark or finish the list before publishing. Publish anyway only if you have verified the paper by hand.",
    };
  }
  return null;
}
