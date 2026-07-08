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

// Advisory pre-grading page-count check.
//
// Fetches each submission's PDF page count (server-side, via the same Drive
// pipeline the grader uses) and compares it to the assignment's expectedPages
// BEFORE any AI grading runs. Purely advisory: if the endpoint fails or nothing
// is flagged, grading proceeds silently. When mismatches are found, a modal
// lists them and `confirmPageCounts` resolves to the user's choice
// (true = grade anyway, false = cancel grading).
//
// Usage:
//   const { pageCheckModal, confirmPageCounts, resolvePageCheck } = usePageCountCheck();
//   const proceed = await confirmPageCounts({ assignmentId, classroomId, students });
//   if (!proceed) return;
//   ...render <PageCountCheckModal state={pageCheckModal} onResolve={resolvePageCheck} />
export function usePageCountCheck() {
  const [pageCheckModal, setPageCheckModal] = useState(null); // { loading, report } | null
  const resolveRef = useRef(null);

  const confirmPageCounts = async ({ assignmentId, classroomId, students, onReport }) => {
    if (!assignmentId || !students?.length) return true;

    setPageCheckModal({ loading: true, report: null });
    let report;
    try {
      const { data } = await api.post("/marking/page-count-check", {
        assignmentId,
        students: students.map((s) => ({
          submissionId: s.submissionId,
          studentId:    s.studentId,
          name:         s.name,
          state:        s.state,
        })),
        ...(classroomId ? { classroomId } : {}),
      });
      report = data;
    } catch {
      // Advisory only — never block grading if the check itself fails.
      setPageCheckModal(null);
      toast.warn("Page-count check unavailable — proceeding without it");
      return true;
    }

    // Surface per-submission flags in the UI right away — the caller updates its
    // row/card warnings now, without waiting for grading to run.
    if (report) onReport?.(report);

    if (!report || !(report.flaggedCount > 0)) {
      setPageCheckModal(null);
      return true;
    }

    // Mismatches found — hand control to the user via the modal.
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPageCheckModal({ loading: false, report });
    });
  };

  const resolvePageCheck = (proceed) => {
    setPageCheckModal(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (resolve) resolve(proceed);
  };

  return { pageCheckModal, confirmPageCounts, resolvePageCheck };
}
