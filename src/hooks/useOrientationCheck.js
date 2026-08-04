import { useRef, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";

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

export function useOrientationCheck() {
  const [orientationCheckModal, setOrientationCheckModal] = useState(null);
  const resolveRef = useRef(null);

  const confirmOrientations = async ({ assignmentId, classroomId, students, onReport }) => {
    if (!assignmentId || !students?.length) return true;

    setOrientationCheckModal({ loading: true, report: null });
    let report;
    try {
      const { data } = await api.post("/marking/orientation-check", {
        assignmentId,
        students: students.map((s) => ({
          submissionId: s.submissionId,
          studentId: s.studentId,
          name: s.name,
          state: s.state,
        })),
        ...(classroomId ? { classroomId } : {}),
      });
      report = data;
    } catch {
      setOrientationCheckModal(null);
      toast.warn("Orientation check unavailable — proceeding without it");
      return true;
    }

    if (report) onReport?.(report);

    if (!report || !(report.flaggedCount > 0)) {
      setOrientationCheckModal(null);
      return true;
    }

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOrientationCheckModal({ loading: false, report });
    });
  };

  const resolveOrientationCheck = (proceed) => {
    setOrientationCheckModal(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (resolve) resolve(proceed);
  };

  return { orientationCheckModal, confirmOrientations, resolveOrientationCheck };
}
