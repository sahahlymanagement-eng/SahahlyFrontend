import { useState, useRef } from "react";
import api from "../api/api";
import { toast } from "react-toastify";

// Builds a per-submission page-count flag map from a page-count-check report,
// keyed by submissionId. Rows/cards read this to show a warning as soon as the
// check runs (before any grading).
export function buildPageCountFlagMap(report) {
  const flags = {};
  for (const c of report?.checked || []) {
    flags[c.submissionId] = {
      flagged: !!c.flagged,
      unreadable: !!c.unreadable,
      actualPages: c.actualPages,
      expectedPages: c.expectedPages,
      difference: c.difference,
      scanQuality: c.scanQuality || { flagged: false },
    };
  }
  return flags;
}

// Human-readable warning for a single page-count flag, or null if it's fine.
export function pageCountWarningText(flag) {
  if (!flag) return null;
  if (flag.unreadable) return "Submitted PDF could not be read — possibly the wrong or corrupt file";
  if (flag.flagged) {
    const diff = flag.difference > 0 ? `+${flag.difference}` : `${flag.difference}`;
    return `Page count ${flag.actualPages} differs from expected ${flag.expectedPages} (${diff})`;
  }
  return null;
}

// Path of the page-count-check endpoint for a grading partner.
// `provider` null/undefined = LoginCSS, which keeps its own /external-grading
// routes; any slug (e.g. "mariamgabalawy") goes through the shared registry.
export function gradingPageCountPath(provider) {
  return provider ? `/grading/${provider}/page-count-check` : "/external-grading/page-count-check";
}

// ── The three ways the review modal can end ──────────────────────────────────
// Same shape as useOrientationCheck so callers can chain both checks the same way:
//
//   { proceed: false }                       → Cancel grading
//   { proceed: true, excludedIds: [] }       → Grade all anyway
//   { proceed: true, excludedIds: [1, 2] }   → Grade remaining without the flagged ones
const PROCEED_ALL = { proceed: true, excludedIds: [] };
const CANCELLED = { proceed: false, excludedIds: [] };

/**
 * Apply a page-count decision to the list about to be graded.
 * @returns {Array|null} submissions to grade, or null when cancelled / nothing left
 */
export function applyPageCountDecision(students, decision) {
  if (!decision?.proceed) return null;
  if (!decision.excludedIds?.length) return students;

  const dropped = new Set(decision.excludedIds.map((id) => String(id)));
  const kept = (students || []).filter((s) => !dropped.has(String(s.submissionId)));
  return kept.length ? kept : null;
}

// Advisory pre-grading page-count check.
//
// Fetches each submission's PDF page count server-side and compares it to the
// assignment's expectedPages BEFORE any AI grading runs. Purely advisory: if the
// endpoint fails or nothing is flagged, grading proceeds silently. When
// mismatches are found, a modal lists them and the confirm call resolves to a
// decision object (see above).
//
// Usage — Google Classroom:
//   const decision = await confirmPageCounts({ assignmentId, classroomId, students });
//   const toGrade = applyPageCountDecision(students, decision);
// Usage — LoginCSS / mariamgabalawy:
//   const decision = await confirmGradingPageCounts({ provider, assignmentId, submissionIds });
//
//   if (!toGrade) return;
//   ...render <PageCountCheckModal state={pageCheckModal} onResolve={resolvePageCheck} />
export function usePageCountCheck() {
  const [pageCheckModal, setPageCheckModal] = useState(null); // { loading, report } | null
  const resolveRef = useRef(null);

  // Shared machinery: POST, surface the flags, then either pass silently or
  // hand control to the user.
  const runCheck = async (endpoint, payload, onReport) => {
    setPageCheckModal({ loading: true, report: null });
    let report;
    try {
      const { data } = await api.post(endpoint, payload);
      report = data;
    } catch {
      // Advisory only — never block grading if the check itself fails.
      setPageCheckModal(null);
      toast.warn("Page-count check unavailable — proceeding without it");
      return PROCEED_ALL;
    }

    // Surface per-submission flags in the UI right away — the caller updates its
    // row/card warnings now, without waiting for grading to run.
    if (report) onReport?.(report);

    if (!report || !(report.flaggedCount > 0)) {
      setPageCheckModal(null);
      return PROCEED_ALL;
    }

    // Mismatches found — hand control to the user via the modal.
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPageCheckModal({ loading: false, report });
    });
  };

  const confirmPageCounts = async ({ assignmentId, classroomId, students, onReport }) => {
    if (!assignmentId || !students?.length) return PROCEED_ALL;

    return runCheck(
      "/marking/page-count-check",
      {
        assignmentId,
        students: students.map((s) => ({
          submissionId: s.submissionId,
          studentId:    s.studentId,
          name:         s.name,
          state:        s.state,
        })),
        ...(classroomId ? { classroomId } : {}),
      },
      onReport
    );
  };

  // Grading partners (LoginCSS / mariamgabalawy). Their submissions are numeric
  // ids with no student roster, so the payload is just the ids — omit them to
  // let the server check every not-yet-published submission in the group.
  const confirmGradingPageCounts = async ({ provider, assignmentId, submissionIds, onReport }) => {
    if (assignmentId == null) return PROCEED_ALL;

    return runCheck(
      gradingPageCountPath(provider),
      {
        assignmentId,
        ...(submissionIds?.length
          ? { submissions: submissionIds.map((submissionId) => ({ submissionId })) }
          : {}),
      },
      onReport
    );
  };

  const resolvePageCheck = (decision) => {
    setPageCheckModal(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    // Legacy callers may still pass a bare boolean — normalize.
    if (typeof decision === "boolean") {
      if (resolve) resolve(decision ? PROCEED_ALL : CANCELLED);
      return;
    }
    if (resolve) {
      resolve(
        decision?.proceed
          ? { proceed: true, excludedIds: decision.excludedIds || [] }
          : CANCELLED
      );
    }
  };

  return { pageCheckModal, confirmPageCounts, confirmGradingPageCounts, resolvePageCheck };
}
