import { useRef, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";

// ── The three ways the review modal can end ──────────────────────────────────
// Every confirm* function below resolves to a decision of this shape, never a
// bare boolean, because "grade without these" needs to say WHICH submissions to
// drop as well as whether to continue:
//
//   { proceed: false }                       → Cancel grading
//   { proceed: true, excludedIds: [] }       → Grade all anyway
//   { proceed: true, excludedIds: [1, 2] }   → Grade without the flagged ones
//
// A check that finds nothing (or fails outright) resolves to PROCEED_ALL, so a
// caller never has to special-case "the modal never opened".
const PROCEED_ALL = { proceed: true, excludedIds: [] };
const CANCELLED = { proceed: false, excludedIds: [] };

export function buildOrientationFlagMap(report) {
  const flags = {};
  for (const c of report?.checked || []) {
    flags[c.submissionId] = {
      flagged: !!c.flagged,
      unreadable: !!c.unreadable,
      portraitCount: c.portraitCount || 0,
      landscapeCount: c.landscapeCount || 0,
      primaryOrientation: c.primaryOrientation || null,
      mismatchedPages: c.mismatchedPages || [],
    };
  }
  return flags;
}

export function orientationWarningText(flag) {
  if (!flag) return null;
  if (flag.unreadable) return "Submitted PDF could not be read to verify page orientation";
  if (!flag.flagged) return null;
  const pages = flag.mismatchedPages?.length
    ? ` on page${flag.mismatchedPages.length === 1 ? "" : "s"} ${flag.mismatchedPages.join(", ")}`
    : "";
  return `Mixed page orientation detected${pages}`;
}

/**
 * Apply a decision to the list about to be graded.
 *
 * @returns {Array|null} the submissions to grade, or null when the user
 *   cancelled OR excluding the flagged ones would leave nothing to do — both
 *   mean "stop", and every call site already treats a falsy result that way.
 */
export function applyOrientationDecision(students, decision) {
  if (!decision?.proceed) return null;
  if (!decision.excludedIds?.length) return students;

  // Ids cross the wire as numbers for the grading partners and as opaque
  // strings for Google Classroom, so compare them as strings.
  const dropped = new Set(decision.excludedIds.map((id) => String(id)));
  const kept = students.filter((s) => !dropped.has(String(s.submissionId)));
  return kept.length ? kept : null;
}

// Path of the orientation-check endpoint for a grading partner. Mirrors
// gradingPageCountPath in usePageCountCheck.js: `provider` null/undefined =
// LoginCSS, which keeps its own /external-grading routes; any slug (e.g.
// "mariamgabalawy") goes through the shared registry.
export function gradingOrientationPath(provider) {
  return provider ? `/grading/${provider}/orientation-check` : "/external-grading/orientation-check";
}

/** The name a caller already shows for a submission, whatever key it uses. */
function callerName(entry) {
  return entry?.studentName || entry?.name || null;
}

/**
 * Fill in any row the server could not name from the caller's own list. The
 * server reads names out of the stored partner payload, which for older
 * submissions predates the partner's `student` block — the list on screen has a
 * name for those rows, so the modal should not fall back to a bare id.
 */
function withCallerNames(report, nameById) {
  if (!report || !nameById || !Object.keys(nameById).length) return report;

  const fill = (rows) =>
    (rows || []).map((row) => ({
      ...row,
      studentName: row.studentName || nameById[row.submissionId] || null,
    }));

  return {
    ...report,
    checked: fill(report.checked),
    skipped: fill(report.skipped),
    errored: fill(report.errored),
  };
}

export function useOrientationCheck() {
  const [orientationCheckModal, setOrientationCheckModal] = useState(null);
  const resolveRef = useRef(null);

  const runCheck = async (endpoint, payload, onReport, nameById) => {
    setOrientationCheckModal({ loading: true, report: null });
    let report;
    try {
      const { data } = await api.post(endpoint, payload);
      report = withCallerNames(data, nameById);
    } catch {
      setOrientationCheckModal(null);
      toast.warn("Orientation check unavailable — proceeding without it");
      return PROCEED_ALL;
    }

    if (report) onReport?.(report);

    if (!report || !(report.flaggedCount > 0)) {
      setOrientationCheckModal(null);
      return PROCEED_ALL;
    }

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOrientationCheckModal({ loading: false, report });
    });
  };

  const confirmOrientations = async ({ assignmentId, classroomId, students, onReport }) => {
    if (!assignmentId || !students?.length) return PROCEED_ALL;

    const nameById = {};
    for (const s of students) {
      if (s?.submissionId != null && callerName(s)) nameById[s.submissionId] = callerName(s);
    }

    return runCheck(
      "/marking/orientation-check",
      {
        assignmentId,
        students: students.map((s) => ({
          submissionId: s.submissionId,
          studentId: s.studentId,
          name: s.name,
          state: s.state,
        })),
        ...(classroomId ? { classroomId } : {}),
      },
      onReport,
      nameById
    );
  };

  // Grading partners (LoginCSS / mariamgabalawy / drpeter). Their submissions
  // are numeric ids with no student roster, so the payload is the ids plus the
  // name the list already shows — omit the list entirely to let the server
  // check every not-yet-published submission.
  const confirmGradingOrientations = async ({
    provider,
    assignmentId,
    submissions,
    submissionIds,
    onReport,
  }) => {
    if (assignmentId == null) return PROCEED_ALL;

    const rows = Array.isArray(submissions)
      ? submissions.map((s) => ({ submissionId: s.submissionId, studentName: callerName(s) }))
      : (submissionIds || []).map((submissionId) => ({ submissionId }));

    const nameById = {};
    for (const row of rows) {
      if (row.submissionId != null && row.studentName) nameById[row.submissionId] = row.studentName;
    }

    return runCheck(
      gradingOrientationPath(provider),
      {
        assignmentId,
        ...(rows.length ? { submissions: rows } : {}),
      },
      onReport,
      nameById
    );
  };

  /**
   * Close the modal with the user's choice. Accepts the decision object the
   * modal builds; a bare boolean still works for the two-outcome callers.
   */
  const resolveOrientationCheck = (decision) => {
    setOrientationCheckModal(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (!resolve) return;

    if (typeof decision === "boolean") {
      resolve(decision ? PROCEED_ALL : CANCELLED);
      return;
    }
    resolve(decision?.proceed ? { proceed: true, excludedIds: decision.excludedIds || [] } : CANCELLED);
  };

  return {
    orientationCheckModal,
    confirmOrientations,
    confirmGradingOrientations,
    resolveOrientationCheck,
  };
}
