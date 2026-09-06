import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  FiArrowLeft,
  FiBarChart2,
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiClock,
  FiDownload,
  FiEye,
  FiInfo,
  FiRefreshCw,
  FiSend,
  FiUploadCloud,
  FiUsers,
  FiX,
} from "react-icons/fi";
import {
  downloadPartnerCollectivePdf,
  downloadPartnerExecutivePdf,
  downloadPartnerMonthlyPdf,
  getPartnerSubmissionStatusRows,
  listPartnerAssignments,
  listPartnerClasses,
  listPartnerMonths,
  listPartnerSentHistory,
  listPartnerStudents,
  partnerReportErr,
  previewPartnerAssignmentReports,
  previewPartnerExecutiveReport,
  publishPartnerAssignmentReportsToIgspaces,
  publishPartnerMonthlyReportsToIgspaces,
  sendPartnerAssignmentReports,
  sendPartnerCollectiveReport,
  sendPartnerExecutiveReport,
  sendPartnerMonthlyReports,
  sendPartnerSubmissionStatusReport,
} from "../api/partnerReports";
import { canManageReportLogos, canReportOnPartner } from "../utils/gradingAccess";
import { useGradingDelegations } from "../context/GradingNotificationContext";
import { downloadBlob } from "../utils/downloadBlob";
import { confirmToast } from "../utils/confirmToast";
import usePersistedState from "../hooks/usePersistedState";
import PartnerContactsPanel from "./PartnerContactsPanel";
import PartnerLogoPanel from "./PartnerLogoPanel";
import PartnerReportAutoSendModal from "./PartnerReportAutoSendModal";
import Pagination from "./Pagination";
import DashboardPeriodFilter from "./DashboardPeriodFilter";
import { useDashboardPeriod } from "../hooks/useDashboardPeriod";
import "../pages/manager/ManagerAssignments.css";
import "./PartnerReports.css";

/**
 * Every report kind in the Reports tab, for the grading partners (LoginCSS,
 * Mariam Gabalawy, Dr Peter) instead of Google Classrooms.
 *
 * A partner plays the role a classroom plays elsewhere: it is the scope a report
 * covers. That is the one real difference from ReportsWorkspace, and it follows
 * from what a partner actually gives us — submissions keyed by a numeric
 * assignment id, each with a student name and a marking result, and no classroom,
 * roster, subject, teacher or attendance behind them. Sections that would need
 * that missing data are left out of partner reports rather than shown empty.
 *
 * Parent-facing reports depend entirely on the contact directory (the Contacts
 * view), since a partner never sends a phone number. Every view therefore leads
 * with how many of the students it is about are actually reachable.
 */

// `igspacesConnected` mirrors src/config/gradingProviders.js on the backend —
// mariamgabalawy and drpeter publish assignment/monthly reports THROUGH
// IGSpaces (R2 upload + payload with a URL) instead of WhatsApp, and only
// they have a live roster for the Submission Status view. LoginCSS has no
// IGSpaces platform behind it, so it keeps using WhatsApp for every report
// kind exactly as before.
const PARTNERS = [
  { slug: "logincss", label: "LoginCSS", igspacesConnected: false },
  { slug: "mariamgabalawy", label: "Mariam Gabalawy", igspacesConnected: true },
  { slug: "drpeter", label: "Dr Peter", igspacesConnected: true },
];

const BASE_VIEWS = [
  { key: "assignment", label: "Assignment Reports", icon: FiClipboard },
  { key: "collective", label: "Collective Reports", icon: FiUsers },
  { key: "monthly", label: "Monthly Parent Reports", icon: FiCalendar },
  { key: "executive", label: "Executive Analysis", icon: FiBarChart2 },
  { key: "submission_status", label: "Submission Status", icon: FiCheckSquare, igspacesOnly: true },
  { key: "contacts", label: "Contacts & Logo", icon: FiUsers },
  { key: "sent", label: "Reports Sent", icon: FiSend },
];

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB");
  } catch {
    return String(value);
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/** A stable id per send attempt, so a double-click cannot deliver twice. */
function newSendId(parts) {
  return `ui:${parts.join(":")}:${Date.now()}`;
}

export default function PartnerReportsWorkspace({ variant = "manager", onBack, onNavigate }) {
  // The delegation grant is passed explicitly rather than left to the module
  // cache, so this render is tied to it and a director-delegated partner appears
  // the moment the grant resolves. Directors reach every partner by role instead
  // (canReportOnPartner), which is why the director shell needs no grading
  // delegation provider around it.
  const { delegations } = useGradingDelegations();

  const allowedPartners = useMemo(
    () => PARTNERS.filter((p) => canReportOnPartner(p.slug, delegations)),
    [delegations]
  );

  const [slug, setSlug] = usePersistedState(`partnerReports:${variant}:partner`, null);
  const [view, setView] = usePersistedState(`partnerReports:${variant}:view`, "assignment");
  const [showAutoSend, setShowAutoSend] = useState(false);

  // ── Shared: classes + assignments + students for the selected partner ──
  // Classes are the IGSpaces "which group is this assignment in" half of the
  // class → assignment feed (docs/sahahly.md) — a filter on the assignment
  // picker, not a separate view, since every other view already reuses that
  // picker unchanged.
  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState(null); // group_id, or null = all
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentId, setAssignmentId] = useState(null);
  const [students, setStudents] = useState([]);
  const [unnamed, setUnnamed] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selected, setSelected] = useState({});
  const [sending, setSending] = useState(false);

  // Assignment-report preview state (WhatsApp-only partners).
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [edited, setEdited] = useState({});

  // IGSpaces-publish result state (assignment + monthly, IGSpaces-connected
  // partners only) — no preview/edit step, since the published content is
  // fixed text or a fixed PDF, not a WhatsApp message a human can tweak.
  const [publishResults, setPublishResults] = useState(null);

  // Once the grant resolves, settle on a partner this account may actually open —
  // including when a persisted choice is no longer permitted.
  useEffect(() => {
    if (!allowedPartners.length) return;
    if (!slug || !allowedPartners.some((p) => p.slug === slug)) {
      setSlug(allowedPartners[0].slug);
    }
  }, [allowedPartners, slug, setSlug]);

  const providerLabel = useMemo(
    () => PARTNERS.find((p) => p.slug === slug)?.label || slug || "Partner",
    [slug]
  );
  const isIgspacesConnected = useMemo(
    () => Boolean(PARTNERS.find((p) => p.slug === slug)?.igspacesConnected),
    [slug]
  );
  const VIEWS = useMemo(
    () => BASE_VIEWS.filter((v) => !v.igspacesOnly || isIgspacesConnected),
    [isIgspacesConnected]
  );

  // Guards both fetches below against a fast partner switch: without it, an
  // in-flight request for the PREVIOUS partner can resolve after the next
  // one starts and overwrite its state with stale data — which is exactly
  // what made the class chips (and their counts, computed from `assignments`)
  // appear, disappear or show wrong numbers depending on which of the two
  // independent requests happened to land last.
  const assignmentsRequestRef = useRef(0);

  const loadAssignments = useCallback(async () => {
    if (!slug) return;
    const requestId = ++assignmentsRequestRef.current;
    setLoadingAssignments(true);
    try {
      const data = await listPartnerAssignments(slug);
      if (assignmentsRequestRef.current !== requestId) return; // superseded
      // "Active" only — an assignment with zero submissions has nothing to
      // report on and is just noise here (it still exists for the Grading
      // tab's picker and the automation cron, neither of which read this).
      setAssignments((data.assignments || []).filter((a) => a.submissionCount > 0));
    } catch (err) {
      if (assignmentsRequestRef.current !== requestId) return;
      toast.error(partnerReportErr(err, "Failed to load partner assignments"));
      setAssignments([]);
    } finally {
      if (assignmentsRequestRef.current === requestId) setLoadingAssignments(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!slug || !isIgspacesConnected) {
      setClasses([]);
      return undefined;
    }
    let cancelled = false;
    listPartnerClasses(slug)
      .then((rows) => {
        if (!cancelled) setClasses(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(partnerReportErr(err, "Failed to load classes"));
        setClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, isIgspacesConnected]);

  const filteredAssignments = useMemo(
    () =>
      classFilter == null
        ? assignments
        : assignments.filter((a) => a.classroom?.group_id === classFilter),
    [assignments, classFilter]
  );

  // How many of THIS list's (already active-only) assignments fall in each
  // class — not the class's own assignmentCount, which also counts
  // zero-submission assignments this tab never shows.
  const activeCountByClass = useMemo(() => {
    const counts = new Map();
    for (const a of assignments) {
      const groupId = a.classroom?.group_id;
      if (groupId == null) continue;
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    }
    return counts;
  }, [assignments]);
  const classesWithActiveAssignments = useMemo(
    () => classes.filter((c) => activeCountByClass.get(c.groupId) > 0),
    [classes, activeCountByClass]
  );

  useEffect(() => {
    // A new partner invalidates everything downstream of it — cleared
    // immediately, not left to whichever fetch happens to resolve first, so
    // the class chips can never be computed against one partner's classes
    // and another partner's assignments for the brief window before both
    // requests land.
    setAssignmentId(null);
    setStudents([]);
    setSelected({});
    setPreview(null);
    setPublishResults(null);
    setClassFilter(null);
    setAssignments([]);
    loadAssignments();
  }, [slug, loadAssignments]);

  // Submission Status only exists for IGSpaces-connected partners — bounce
  // back to the assignment view if a persisted choice no longer applies
  // (e.g. switching from Mariam Gabalawy to LoginCSS).
  useEffect(() => {
    if (!VIEWS.some((v) => v.key === view)) setView("assignment");
  }, [VIEWS, view, setView]);

  const loadStudents = useCallback(
    async (forAssignmentId) => {
      if (!slug) return;
      setLoadingStudents(true);
      try {
        const data = await listPartnerStudents(
          slug,
          forAssignmentId ? { assignmentId: forAssignmentId } : undefined
        );
        setStudents(data.students || []);
        setUnnamed(data.unnamed || 0);
        // A WhatsApp send can only reach a student with a saved number; an
        // IGSpaces publish has no such requirement, so every student starts
        // selected there.
        const next = {};
        for (const s of data.students || []) {
          if (isIgspacesConnected || s.hasContact) next[s.studentKey] = true;
        }
        setSelected(next);
      } catch (err) {
        toast.error(partnerReportErr(err, "Failed to load partner students"));
        setStudents([]);
      } finally {
        setLoadingStudents(false);
      }
    },
    [slug, isIgspacesConnected]
  );

  const selectedKeys = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );
  const reachableCount = students.filter((s) => s.hasContact).length;
  // How many students a report can actually go to in the CURRENT view's
  // channel — all of them via IGSpaces, only the WhatsApp-reachable ones
  // otherwise.
  const eligibleCount = isIgspacesConnected ? students.length : reachableCount;

  const toggleStudent = (key) => setSelected((prev) => ({ ...prev, [key]: !prev[key] }));

  const selectAllReachable = () => {
    const next = {};
    for (const s of students) if (isIgspacesConnected || s.hasContact) next[s.studentKey] = true;
    setSelected(next);
  };

  const currentAssignment = useMemo(
    () => assignments.find((a) => a.id === assignmentId) || null,
    [assignments, assignmentId]
  );

  const pickAssignment = (id) => {
    setAssignmentId(id);
    setPreview(null);
    setPublishResults(null);
  };

  /**
   * Keep the student list in step with what the current view is scoped to.
   *
   * This has to be an effect keyed on the view, not a call inside
   * pickAssignment: the monthly view is scoped to a MONTH and so loads every
   * student, while the other views are scoped to one assignment. Loading only on
   * assignment click meant a trip through the monthly view left the whole-partner
   * list on screen under an assignment heading, inviting a send to students who
   * never submitted that assignment.
   */
  useEffect(() => {
    if (!slug) return;
    if (view === "monthly") {
      loadStudents(null);
    } else if (assignmentId) {
      loadStudents(assignmentId);
    } else {
      setStudents([]);
      setSelected({});
    }
  }, [view, slug, assignmentId, loadStudents]);

  // ── 1. Assignment reports ──

  const runPreview = async () => {
    if (!assignmentId) return;
    if (!selectedKeys.length) {
      toast.warn("Select at least one student");
      return;
    }
    setPreviewing(true);
    try {
      const data = await previewPartnerAssignmentReports(slug, {
        assignmentId,
        studentKeys: selectedKeys,
      });
      setPreview(data);
      setEdited({});
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to build the preview"));
    } finally {
      setPreviewing(false);
    }
  };

  const sendAssignmentReports = async () => {
    const sendable = (preview?.previews || []).filter((p) => p.ok);
    if (!sendable.length) {
      toast.warn("None of these students have a WhatsApp number saved");
      return;
    }
    const ok = await confirmToast(`Send ${sendable.length} report(s) to parents on WhatsApp?`);
    if (!ok) return;

    setSending(true);
    try {
      const summary = await sendPartnerAssignmentReports(slug, {
        assignmentId,
        studentKeys: sendable.map((p) => p.studentKey),
        messageOverrides: Object.keys(edited).length ? edited : null,
        clientSendId: newSendId([slug, "assignment", assignmentId]),
      });
      toast.success(
        `Sent ${summary.sent}${summary.skipped ? `, skipped ${summary.skipped}` : ""}${
          summary.failed ? `, failed ${summary.failed}` : ""
        }`
      );
      for (const row of (summary.results || [])
        .filter((r) => r.status === "failed")
        .slice(0, 5)) {
        toast.error(`${row.studentName}: ${row.reason}`);
      }
      setPreview(null);
    } catch (err) {
      toast.error(partnerReportErr(err, "Send failed"));
    } finally {
      setSending(false);
    }
  };

  const publishAssignmentToIgspaces = async () => {
    if (!assignmentId || !selectedKeys.length) {
      toast.warn("Select at least one student");
      return;
    }
    const ok = await confirmToast(
      `Publish ${selectedKeys.length} report(s) to IGSpaces for ${providerLabel}?`
    );
    if (!ok) return;

    setSending(true);
    setPublishResults(null);
    try {
      const summary = await publishPartnerAssignmentReportsToIgspaces(slug, {
        assignmentId,
        studentKeys: selectedKeys,
      });
      setPublishResults(summary);
      toast.success(
        `Published ${summary.sent}${summary.skipped ? `, skipped ${summary.skipped}` : ""}${
          summary.failed ? `, failed ${summary.failed}` : ""
        }`
      );
    } catch (err) {
      toast.error(partnerReportErr(err, "Publish to IGSpaces failed"));
    } finally {
      setSending(false);
    }
  };

  // ── 2. Collective ──
  const [collectiveVariant, setCollectiveVariant] = useState("teacher");
  const [destinationType, setDestinationType] = useState("group");
  const [destinationValue, setDestinationValue] = useState("");

  const downloadCollective = async () => {
    if (!assignmentId) return;
    try {
      const blob = await downloadPartnerCollectivePdf(slug, assignmentId, collectiveVariant);
      downloadBlob(
        blob,
        `${providerLabel}_${currentAssignment?.name || assignmentId}_${collectiveVariant}.pdf`
      );
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to build the PDF"));
    }
  };

  const sendCollective = async () => {
    if (!assignmentId) return;
    if (!destinationValue.trim()) {
      toast.warn(
        destinationType === "group"
          ? "Enter the WhatsApp group id (ends in @g.us)"
          : "Enter a phone number"
      );
      return;
    }
    const ok = await confirmToast(`Send the collective PDF to ${destinationValue.trim()}?`);
    if (!ok) return;

    setSending(true);
    try {
      const result = await sendPartnerCollectiveReport(slug, {
        assignmentId,
        destinationType,
        destinationValue: destinationValue.trim(),
        variant: collectiveVariant,
        clientSendId: newSendId([slug, "collective", collectiveVariant, assignmentId]),
      });
      if (result.sent) toast.success("Collective report sent");
      else toast.info(`Not sent — ${result.reason || "already sent recently"}`);
    } catch (err) {
      toast.error(partnerReportErr(err, "Send failed"));
    } finally {
      setSending(false);
    }
  };

  // ── 3. Monthly parent ──
  const [months, setMonths] = useState([]);
  const [period, setPeriod] = useState(null);

  useEffect(() => {
    if (view !== "monthly" || !slug) return undefined;
    let cancelled = false;
    listPartnerMonths(slug)
      .then((rows) => {
        if (cancelled) return;
        setMonths(rows);
        setPeriod((current) => current || rows[0] || null);
      })
      .catch((err) => {
        if (!cancelled) toast.error(partnerReportErr(err, "Failed to load months"));
      });
    return () => {
      cancelled = true;
    };
  }, [view, slug]);

  const downloadMonthly = async (student) => {
    if (!period) return;
    try {
      const blob = await downloadPartnerMonthlyPdf(slug, {
        studentKey: student.studentKey,
        year: period.year,
        month: period.month,
      });
      downloadBlob(blob, `${student.studentName}_${period.label}.pdf`.replace(/\s+/g, "_"));
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to build the report"));
    }
  };

  const sendMonthly = async () => {
    if (!period) {
      toast.warn("Pick a month first");
      return;
    }
    if (!selectedKeys.length) {
      toast.warn("Select at least one student");
      return;
    }
    const ok = await confirmToast(
      `Send the ${period.label} monthly report to ${selectedKeys.length} parent(s)?`
    );
    if (!ok) return;

    setSending(true);
    try {
      const summary = await sendPartnerMonthlyReports(slug, {
        studentKeys: selectedKeys,
        year: period.year,
        month: period.month,
        clientSendId: newSendId([slug, "monthly", period.year, period.month]),
      });
      toast.success(
        `Sent ${summary.sent}${summary.skipped ? `, skipped ${summary.skipped}` : ""}${
          summary.failed ? `, failed ${summary.failed}` : ""
        }`
      );
      for (const row of (summary.results || [])
        .filter((r) => r.status === "failed")
        .slice(0, 5)) {
        toast.error(`${row.studentName || row.studentKey}: ${row.reason}`);
      }
    } catch (err) {
      toast.error(partnerReportErr(err, "Send failed"));
    } finally {
      setSending(false);
    }
  };

  const publishMonthlyToIgspaces = async () => {
    if (!period) {
      toast.warn("Pick a month first");
      return;
    }
    if (!selectedKeys.length) {
      toast.warn("Select at least one student");
      return;
    }
    const ok = await confirmToast(
      `Publish the ${period.label} monthly report to IGSpaces for ${selectedKeys.length} student(s)?`
    );
    if (!ok) return;

    setSending(true);
    setPublishResults(null);
    try {
      const summary = await publishPartnerMonthlyReportsToIgspaces(slug, {
        studentKeys: selectedKeys,
        year: period.year,
        month: period.month,
      });
      setPublishResults(summary);
      toast.success(
        `Published ${summary.sent}${summary.skipped ? `, skipped ${summary.skipped}` : ""}${
          summary.failed ? `, failed ${summary.failed}` : ""
        }`
      );
    } catch (err) {
      toast.error(partnerReportErr(err, "Publish to IGSpaces failed"));
    } finally {
      setSending(false);
    }
  };

  // ── 4. Executive ──
  const [execReport, setExecReport] = useState(null);
  const [loadingExec, setLoadingExec] = useState(false);

  const loadExec = async (id) => {
    setLoadingExec(true);
    setExecReport(null);
    try {
      setExecReport(await previewPartnerExecutiveReport(slug, id));
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to build the analysis"));
    } finally {
      setLoadingExec(false);
    }
  };

  const downloadExec = async () => {
    if (!assignmentId) return;
    try {
      const blob = await downloadPartnerExecutivePdf(slug, assignmentId);
      downloadBlob(
        blob,
        `${providerLabel}_${currentAssignment?.name || assignmentId}_executive.pdf`
      );
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to build the PDF"));
    }
  };

  const sendExec = async () => {
    if (!assignmentId) return;
    if (!destinationValue.trim()) {
      toast.warn("Enter a WhatsApp group id or phone number");
      return;
    }
    const ok = await confirmToast(`Send the executive analysis to ${destinationValue.trim()}?`);
    if (!ok) return;

    setSending(true);
    try {
      const result = await sendPartnerExecutiveReport(slug, {
        assignmentId,
        destinationType,
        destinationValue: destinationValue.trim(),
        clientSendId: newSendId([slug, "executive", assignmentId]),
      });
      if (result.sent) toast.success("Executive analysis sent");
      else toast.info(`Not sent — ${result.reason || "already sent recently"}`);
    } catch (err) {
      toast.error(partnerReportErr(err, "Send failed"));
    } finally {
      setSending(false);
    }
  };

  // ── Submission status (IGSpaces-connected partners only) ──
  const [statusData, setStatusData] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const loadSubmissionStatus = async (id) => {
    setLoadingStatus(true);
    setStatusData(null);
    try {
      setStatusData(await getPartnerSubmissionStatusRows(slug, id));
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to load submission status"));
    } finally {
      setLoadingStatus(false);
    }
  };

  const sendSubmissionStatus = async () => {
    if (!assignmentId) return;
    if (!destinationValue.trim()) {
      toast.warn(
        destinationType === "group"
          ? "Enter the WhatsApp group id (ends in @g.us)"
          : "Enter a phone number"
      );
      return;
    }
    const ok = await confirmToast(`Send the submission status report to ${destinationValue.trim()}?`);
    if (!ok) return;

    setSending(true);
    try {
      const result = await sendPartnerSubmissionStatusReport(slug, {
        assignmentId,
        destinationType,
        destinationValue: destinationValue.trim(),
        clientSendId: newSendId([slug, "submission-status", assignmentId]),
      });
      if (result.sent) toast.success("Submission status report sent");
      else toast.info(`Not sent — ${result.reason || "already sent recently"}`);
    } catch (err) {
      toast.error(partnerReportErr(err, "Send failed"));
    } finally {
      setSending(false);
    }
  };

  // ── 5. Sent history ──
  const sentPeriod = useDashboardPeriod();
  const [history, setHistory] = useState({
    items: [],
    page: 1,
    totalPages: 0,
    total: 0,
    coverage: null,
  });
  const [historyReportType, setHistoryReportType] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(
    async (page = 1) => {
      if (!slug) return;
      setLoadingHistory(true);
      try {
        setHistory(
          await listPartnerSentHistory(slug, {
            page,
            limit: 20,
            ...sentPeriod.params,
            ...(historyReportType ? { reportType: historyReportType } : {}),
          })
        );
      } catch (err) {
        toast.error(partnerReportErr(err, "Failed to load sent reports"));
      } finally {
        setLoadingHistory(false);
      }
    },
    [slug, sentPeriod.params.from, sentPeriod.params.to, historyReportType]
  );

  useEffect(() => {
    if (view === "sent") loadHistory(1);
  }, [view, loadHistory]);

  // ── Render ──

  if (!allowedPartners.length) {
    return (
      <main className="ma-main">
        <header className="ma-topbar">
          <div className="ma-topbar-left">
            {onBack && (
              <button type="button" className="ma-back-link" onClick={onBack}>
                <FiArrowLeft size={14} /> Back
              </button>
            )}
            <h1 className="ma-topbar-title">Partner Reports</h1>
          </div>
        </header>
        <div className="ma-content">
          <p className="prw-empty">This account does not have access to any grading partner.</p>
        </div>
      </main>
    );
  }

  const assignmentPicker = (onPick) => (
    <section className="prw-panel">
      <div className="prw-panel-head">
        <div>
          <h2 className="prw-panel-title">Choose an assignment</h2>
          <p className="prw-panel-sub">{providerLabel} assignments, newest due date first.</p>
        </div>
        <button
          type="button"
          className="prw-btn prw-btn--ghost"
          onClick={loadAssignments}
          disabled={loadingAssignments}
        >
          <FiRefreshCw size={13} /> {loadingAssignments ? "Loading…" : "Refresh"}
        </button>
      </div>

      {isIgspacesConnected && classesWithActiveAssignments.length > 0 && (
        <div className="prw-chip-row">
          <button
            type="button"
            className={`prw-chip ${classFilter == null ? "prw-chip--active" : ""}`}
            onClick={() => setClassFilter(null)}
          >
            All classes
          </button>
          {classesWithActiveAssignments.map((c) => (
            <button
              key={c.groupId}
              type="button"
              className={`prw-chip ${classFilter === c.groupId ? "prw-chip--active" : ""}`}
              onClick={() => setClassFilter(c.groupId)}
              title={c.schoolName || undefined}
            >
              {c.groupName} ({activeCountByClass.get(c.groupId)})
            </button>
          ))}
        </div>
      )}

      {loadingAssignments && !assignments.length ? (
        <p className="prw-empty">Loading assignments…</p>
      ) : !filteredAssignments.length ? (
        <p className="prw-empty">
          {assignments.length
            ? "No assignments in this class."
            : `No assignments found for ${providerLabel}.`}
        </p>
      ) : (
        <div className="prw-card-grid">
          {filteredAssignments.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`prw-card ${assignmentId === a.id ? "prw-card--active" : ""}`}
              onClick={() => onPick(a.id)}
            >
              <span className="prw-card-title">{a.name}</span>
              {a.classroom?.group_name && (
                <span className="prw-card-meta">{a.classroom.group_name}</span>
              )}
              <span className="prw-card-meta">
                Due {formatDate(a.dueDate)} · {a.submissionCount} submitted · {a.gradedCount}{" "}
                marked
              </span>
              {a.maxGrade != null && <span className="prw-card-meta">Out of {a.maxGrade}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const studentTable = ({ showWork = false, actions = null } = {}) => (
    <section className="prw-panel">
      <div className="prw-panel-head">
        <div>
          <h2 className="prw-panel-title">
            Students{" "}
            <span className="prw-pill prw-pill--muted">
              {selectedKeys.length} of {students.length} selected
            </span>
          </h2>
          <p className="prw-panel-sub">
            {isIgspacesConnected
              ? `${eligibleCount} of ${students.length} students are on this assignment.`
              : `${reachableCount} of ${students.length} have a saved WhatsApp number.`}
            {!isIgspacesConnected &&
              reachableCount < students.length &&
              " The rest cannot be sent to — add their numbers under Contacts."}
          </p>
        </div>
        <div className="prw-panel-actions">
          <button type="button" className="prw-btn prw-btn--ghost" onClick={selectAllReachable}>
            <FiCheckSquare size={13} /> {isIgspacesConnected ? "Select all" : "Select all reachable"}
          </button>
          <button type="button" className="prw-btn prw-btn--ghost" onClick={() => setSelected({})}>
            <FiX size={13} /> Clear
          </button>
          {actions}
        </div>
      </div>

      {unnamed > 0 && (
        <p className="prw-note prw-note--warn">
          <FiInfo size={13} /> {unnamed} submission(s) carry no student name or student
          code in {providerLabel}&apos;s data, so they cannot be attributed to a person
          and are not listed here. Running Sync on the {providerLabel} grading tab
          refreshes the stored payloads and usually resolves it.
        </p>
      )}

      {loadingStudents && !students.length ? (
        <p className="prw-empty">Loading students…</p>
      ) : !students.length ? (
        <p className="prw-empty">No students found.</p>
      ) : (
        <div className="prw-table-wrap">
          <table className="prw-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Student</th>
                <th>Parent</th>
                <th>WhatsApp</th>
                {showWork && <th>Work</th>}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.studentKey}
                  className={!isIgspacesConnected && !s.hasContact ? "prw-row--missing" : undefined}
                >
                  <td data-label="Select">
                    <input
                      type="checkbox"
                      checked={!!selected[s.studentKey]}
                      disabled={!isIgspacesConnected && !s.hasContact}
                      onChange={() => toggleStudent(s.studentKey)}
                    />
                  </td>
                  <td data-label="Student">
                    <span className="prw-student-name">{s.studentName}</span>
                    {/* The partner's own student code. Shown because two students
                        genuinely do share a name, and the code is what tells the
                        person maintaining the numbers which row is which. */}
                    {s.studentCode && (
                      <span className="prw-student-code" title="Partner student code">
                        {s.studentCode.toUpperCase()}
                      </span>
                    )}
                    {!isIgspacesConnected && !s.hasContact && (
                      <span className="prw-pill prw-pill--warn">No number</span>
                    )}
                  </td>
                  <td data-label="Parent">{s.parentName || "—"}</td>
                  <td data-label="WhatsApp">{s.parentPhone || s.phone || "—"}</td>
                  {showWork && (
                    <td data-label="Work">
                      {s.submissionCount} submitted · {s.gradedCount} marked
                    </td>
                  )}
                  <td data-label="Actions" className="prw-actions-cell">
                    {view === "monthly" && period && (
                      <button
                        type="button"
                        className="prw-icon-btn"
                        title={`Download the ${period.label} PDF`}
                        onClick={() => downloadMonthly(s)}
                      >
                        <FiDownload size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const destinationFields = (
    <div className="prw-destination">
      <label className="prw-field">
        <span>Send to</span>
        <select
          className="prw-input"
          value={destinationType}
          onChange={(e) => setDestinationType(e.target.value)}
        >
          <option value="group">WhatsApp group</option>
          <option value="phone">Phone number</option>
        </select>
      </label>
      <label className="prw-field prw-field--grow">
        <span>{destinationType === "group" ? "Group id (ends in @g.us)" : "Phone number"}</span>
        <input
          className="prw-input"
          placeholder={destinationType === "group" ? "1234567890@g.us" : "01234567890"}
          value={destinationValue}
          onChange={(e) => setDestinationValue(e.target.value)}
        />
      </label>
    </div>
  );

  const publishResultsPanel = publishResults && (
    <section className="prw-panel">
      <div className="prw-panel-head">
        <div>
          <h2 className="prw-panel-title">Published to IGSpaces</h2>
          <p className="prw-panel-sub">
            {publishResults.sent} sent
            {publishResults.skipped ? `, ${publishResults.skipped} skipped` : ""}
            {publishResults.failed ? `, ${publishResults.failed} failed` : ""}.
          </p>
        </div>
        <button
          type="button"
          className="prw-icon-btn"
          onClick={() => setPublishResults(null)}
          aria-label="Close"
        >
          <FiX size={14} />
        </button>
      </div>
      {(publishResults.results || []).some((r) => r.status !== "sent") && (
        <ul className="prw-preview-list">
          {(publishResults.results || [])
            .filter((r) => r.status !== "sent")
            .map((r) => (
              <li key={r.studentKey} className="prw-preview">
                <div className="prw-preview-head">
                  <strong>{r.studentName || r.studentKey}</strong>
                  <span
                    className={`prw-pill ${r.status === "skipped" ? "prw-pill--muted" : "prw-pill--warn"}`}
                  >
                    {r.status}
                  </span>
                </div>
                {r.reason && <p className="prw-rule-help">{r.reason}</p>}
              </li>
            ))}
        </ul>
      )}
    </section>
  );

  return (
    <main className="ma-main">
      <header className="ma-topbar ma-topbar--reports">
        <div className="ma-topbar-left">
          {onBack && (
            <button type="button" className="ma-back-link" onClick={onBack}>
              <FiArrowLeft size={14} /> Back
            </button>
          )}
          <h1 className="ma-topbar-title">Partner Reports</h1>
          <span className="ma-topbar-sub">
            The same reports as classrooms, for {providerLabel}.
          </span>

          {onNavigate && (
            <div className="ma-report-tabs">
              <button
                type="button"
                className="ma-report-tab"
                onClick={() => onNavigate("assignment")}
              >
                Assignment Reports
              </button>
              <button type="button" className="ma-report-tab" onClick={() => onNavigate("monthly")}>
                <FiCalendar size={12} /> Monthly Parent Reports
              </button>
              <button
                type="button"
                className="ma-report-tab"
                onClick={() => onNavigate("executive")}
              >
                <FiBarChart2 size={12} /> Teacher Executive Analysis
              </button>
              <button type="button" className="ma-report-tab" onClick={() => onNavigate("sent")}>
                <FiSend size={12} /> Reports Sent
              </button>
              <button type="button" className="ma-report-tab ma-report-tab--active">
                <FiUsers size={12} /> Partner Reports
              </button>
            </div>
          )}
        </div>

        <div className="prw-topbar-actions">
          <button
            type="button"
            className="prw-btn prw-btn--primary"
            onClick={() => setShowAutoSend(true)}
          >
            <FiClock size={15} /> Auto-send settings
          </button>
        </div>
      </header>

      <div className="ma-content">
        <div className="prw-partner-bar">
          {allowedPartners.map((p) => (
            <button
              key={p.slug}
              type="button"
              className={`prw-partner-tab ${slug === p.slug ? "prw-partner-tab--active" : ""}`}
              onClick={() => setSlug(p.slug)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="prw-view-bar">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                type="button"
                className={`prw-view-tab ${view === v.key ? "prw-view-tab--active" : ""}`}
                onClick={() => setView(v.key)}
              >
                <Icon size={12} /> {v.label}
              </button>
            );
          })}
        </div>

        {view === "contacts" && (
          <>
            <PartnerLogoPanel
              slug={slug}
              providerLabel={providerLabel}
              readOnly={!canManageReportLogos()}
            />
            <PartnerContactsPanel
              slug={slug}
              providerLabel={providerLabel}
              onContactsChanged={() => loadStudents(assignmentId)}
            />
          </>
        )}

        {view === "assignment" && (
          <>
            {assignmentPicker(pickAssignment)}
            {assignmentId && (
              <>
                {isIgspacesConnected ? (
                  <>
                    {studentTable({
                      showWork: true,
                      actions: (
                        <button
                          type="button"
                          className="prw-btn prw-btn--primary"
                          onClick={publishAssignmentToIgspaces}
                          disabled={sending || !selectedKeys.length}
                        >
                          <FiUploadCloud size={13} /> {sending ? "Publishing…" : "Publish to IGSpaces"}
                        </button>
                      ),
                    })}
                    {publishResultsPanel}
                  </>
                ) : (
                  studentTable({
                    showWork: true,
                    actions: (
                      <button
                        type="button"
                        className="prw-btn prw-btn--primary"
                        onClick={runPreview}
                        disabled={previewing || !selectedKeys.length}
                      >
                        <FiEye size={13} /> {previewing ? "Building…" : "Preview messages"}
                      </button>
                    ),
                  })
                )}

                {!isIgspacesConnected && preview && (
                  <section className="prw-panel">
                    <div className="prw-panel-head">
                      <div>
                        <h2 className="prw-panel-title">Preview — {preview.assignment?.name}</h2>
                        <p className="prw-panel-sub">
                          Edit any message before sending. An emptied box falls back to the
                          generated text.
                        </p>
                      </div>
                      <div className="prw-panel-actions">
                        <button
                          type="button"
                          className="prw-btn prw-btn--primary"
                          onClick={sendAssignmentReports}
                          disabled={sending}
                        >
                          <FiSend size={13} /> {sending ? "Sending…" : "Send to parents"}
                        </button>
                        <button
                          type="button"
                          className="prw-btn prw-btn--ghost"
                          onClick={() => setPreview(null)}
                        >
                          <FiX size={13} /> Close
                        </button>
                      </div>
                    </div>

                    <ul className="prw-preview-list">
                      {preview.previews.map((p) => (
                        <li key={p.studentKey} className="prw-preview">
                          <div className="prw-preview-head">
                            <strong>{p.studentName}</strong>
                            {p.gradeDisplay && (
                              <span className="prw-pill prw-pill--muted">{p.gradeDisplay}</span>
                            )}
                            {p.ok ? (
                              <span className="prw-pill prw-pill--ok">
                                {p.parentPhone || p.phone}
                              </span>
                            ) : (
                              <span className="prw-pill prw-pill--warn">{p.error}</span>
                            )}
                          </div>
                          {p.ok && (
                            <textarea
                              className="prw-textarea"
                              rows={10}
                              value={edited[p.studentKey] ?? p.message}
                              onChange={(e) =>
                                setEdited({ ...edited, [p.studentKey]: e.target.value })
                              }
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {view === "collective" && (
          <>
            {assignmentPicker(pickAssignment)}
            {assignmentId && (
              <section className="prw-panel">
                <div className="prw-panel-head">
                  <div>
                    <h2 className="prw-panel-title">
                      Collective report — {currentAssignment?.name}
                    </h2>
                    <p className="prw-panel-sub">
                      One PDF covering the whole assignment, sent to a group or a number rather
                      than to parents.
                    </p>
                  </div>
                </div>

                <div className="prw-segmented">
                  <button
                    type="button"
                    className={collectiveVariant === "teacher" ? "prw-seg--active" : ""}
                    onClick={() => setCollectiveVariant("teacher")}
                  >
                    With marks
                  </button>
                  <button
                    type="button"
                    className={collectiveVariant === "custom" ? "prw-seg--active" : ""}
                    onClick={() => setCollectiveVariant("custom")}
                  >
                    Submission status only
                  </button>
                </div>

                {destinationFields}

                <div className="prw-panel-actions prw-panel-actions--end">
                  <button
                    type="button"
                    className="prw-btn prw-btn--ghost"
                    onClick={downloadCollective}
                  >
                    <FiDownload size={13} /> Download PDF
                  </button>
                  <button
                    type="button"
                    className="prw-btn prw-btn--primary"
                    onClick={sendCollective}
                    disabled={sending}
                  >
                    <FiSend size={13} /> {sending ? "Sending…" : "Send on WhatsApp"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {view === "monthly" && (
          <>
            <section className="prw-panel">
              <div className="prw-panel-head">
                <div>
                  <h2 className="prw-panel-title">Choose a month</h2>
                  <p className="prw-panel-sub">
                    Only months with {providerLabel} assignments due in them are listed. The
                    report covers every assignment due that month.
                  </p>
                </div>
              </div>
              {!months.length ? (
                <p className="prw-empty">
                  No {providerLabel} assignments have a due date yet, so there is nothing to
                  report on monthly.
                </p>
              ) : (
                <div className="prw-chip-row">
                  {months.map((m) => (
                    <button
                      key={`${m.year}-${m.month}`}
                      type="button"
                      className={`prw-chip ${
                        period?.year === m.year && period?.month === m.month
                          ? "prw-chip--active"
                          : ""
                      }`}
                      onClick={() => {
                        setPeriod(m);
                        setPublishResults(null);
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="prw-note">
                <FiInfo size={13} /> A partner sends no attendance data, subject or teacher, so
                those sections are left out of the partner monthly report rather than shown
                empty. Marks, topic mastery, the marks-lost breakdown and the comparison against
                the other students on the same assignments are all included.
              </p>
            </section>

            {period &&
              studentTable({
                showWork: true,
                actions: isIgspacesConnected ? (
                  <button
                    type="button"
                    className="prw-btn prw-btn--primary"
                    onClick={publishMonthlyToIgspaces}
                    disabled={sending || !selectedKeys.length}
                  >
                    <FiUploadCloud size={13} /> {sending ? "Publishing…" : `Publish ${period.label} to IGSpaces`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="prw-btn prw-btn--primary"
                    onClick={sendMonthly}
                    disabled={sending || !selectedKeys.length}
                  >
                    <FiSend size={13} /> {sending ? "Sending…" : `Send ${period.label} to parents`}
                  </button>
                ),
              })}
            {isIgspacesConnected && publishResultsPanel}
          </>
        )}

        {view === "executive" && (
          <>
            {assignmentPicker((id) => {
              pickAssignment(id);
              loadExec(id);
            })}

            {assignmentId && (
              <section className="prw-panel">
                <div className="prw-panel-head">
                  <div>
                    <h2 className="prw-panel-title">
                      Executive analysis — {currentAssignment?.name}
                    </h2>
                    <p className="prw-panel-sub">
                      Class-level analysis of the marking: averages, grade spread, weakest
                      questions and topics.
                    </p>
                  </div>
                </div>

                {loadingExec ? (
                  <p className="prw-empty">Building the analysis…</p>
                ) : execReport ? (
                  <>
                    <div className="prw-stat-row">
                      <div className="prw-stat">
                        <span className="prw-stat-value">
                          {execReport.kpis.classAverage != null
                            ? `${execReport.kpis.classAverage}%`
                            : "—"}
                        </span>
                        <span className="prw-stat-label">Class average</span>
                      </div>
                      <div className="prw-stat">
                        <span className="prw-stat-value">
                          {execReport.kpis.passRate != null ? `${execReport.kpis.passRate}%` : "—"}
                        </span>
                        <span className="prw-stat-label">Pass rate</span>
                      </div>
                      <div className="prw-stat">
                        <span className="prw-stat-value">{execReport.kpis.papersMarked}</span>
                        <span className="prw-stat-label">Papers marked</span>
                      </div>
                      <div className="prw-stat">
                        <span className="prw-stat-value">
                          {execReport.kpis.markingUnchangedRate != null
                            ? `${execReport.kpis.markingUnchangedRate}%`
                            : "—"}
                        </span>
                        <span className="prw-stat-label">Marking unchanged</span>
                      </div>
                    </div>

                    {execReport.recommendations?.length > 0 && (
                      <ol className="prw-reco-list">
                        {execReport.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ol>
                    )}
                  </>
                ) : (
                  <p className="prw-empty">No analysis available for this assignment.</p>
                )}

                {destinationFields}

                <div className="prw-panel-actions prw-panel-actions--end">
                  <button type="button" className="prw-btn prw-btn--ghost" onClick={downloadExec}>
                    <FiDownload size={13} /> Download PDF
                  </button>
                  <button
                    type="button"
                    className="prw-btn prw-btn--primary"
                    onClick={sendExec}
                    disabled={sending}
                  >
                    <FiSend size={13} /> {sending ? "Sending…" : "Send on WhatsApp"}
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {view === "submission_status" && (
          <>
            {assignmentPicker((id) => {
              pickAssignment(id);
              loadSubmissionStatus(id);
            })}

            {assignmentId && (
              <section className="prw-panel">
                <div className="prw-panel-head">
                  <div>
                    <h2 className="prw-panel-title">
                      Submission status — {currentAssignment?.name}
                    </h2>
                    <p className="prw-panel-sub">
                      Who has and hasn&apos;t submitted, read live from {providerLabel}&apos;s
                      roster.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="prw-btn prw-btn--ghost"
                    onClick={() => loadSubmissionStatus(assignmentId)}
                    disabled={loadingStatus}
                  >
                    <FiRefreshCw size={13} /> {loadingStatus ? "Loading…" : "Refresh"}
                  </button>
                </div>

                {loadingStatus ? (
                  <p className="prw-empty">Loading the live roster…</p>
                ) : statusData ? (
                  <>
                    <div className="prw-table-wrap">
                      <table className="prw-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Submitted at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusData.rows.map((row, i) => (
                            <tr key={`${row.name}-${i}`}>
                              <td data-label="Name">{row.name}</td>
                              <td data-label="Status">
                                <span
                                  className={`prw-pill ${
                                    row.status === "Didn't Submit"
                                      ? "prw-pill--warn"
                                      : "prw-pill--ok"
                                  }`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td data-label="Submitted at">{row.submittedAt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {destinationFields}

                    <div className="prw-panel-actions prw-panel-actions--end">
                      <button
                        type="button"
                        className="prw-btn prw-btn--primary"
                        onClick={sendSubmissionStatus}
                        disabled={sending}
                      >
                        <FiSend size={13} /> {sending ? "Sending…" : "Send on WhatsApp"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="prw-empty">No roster data available for this assignment.</p>
                )}
              </section>
            )}
          </>
        )}

        {view === "sent" && (
          <section className="prw-panel">
            <div className="prw-panel-head">
              <div>
                <h2 className="prw-panel-title">{providerLabel} reports sent</h2>
                <p className="prw-panel-sub">
                  {history.total} record{history.total === 1 ? "" : "s"}. Check this before
                  resending so parents are not messaged twice.
                </p>
              </div>
              <button
                type="button"
                className="prw-btn prw-btn--ghost"
                onClick={() => loadHistory(history.page)}
                disabled={loadingHistory}
              >
                <FiRefreshCw size={13} /> {loadingHistory ? "Loading…" : "Refresh"}
              </button>
            </div>

            <DashboardPeriodFilter
              from={sentPeriod.from}
              to={sentPeriod.to}
              setFrom={sentPeriod.setFrom}
              setTo={sentPeriod.setTo}
              resetToThisMonth={sentPeriod.resetToThisMonth}
              monthLabel={sentPeriod.monthLabel}
            />

            <div className="ma-sent-filters">
              <label className="ma-sent-filter">
                <span>Report type</span>
                <select
                  value={historyReportType}
                  onChange={(e) => setHistoryReportType(e.target.value)}
                >
                  <option value="">All types</option>
                  {(history.filters?.reportTypes?.length
                    ? history.filters.reportTypes
                    : [
                        { value: "assignment_parent", label: "Assignment reports to parents" },
                        { value: "teacher_collective", label: "Teacher collective PDF" },
                        { value: "custom_collective", label: "Custom collective PDF" },
                        { value: "monthly_parent", label: "Monthly parent report" },
                        { value: "executive_teacher", label: "Executive analysis to teacher" },
                        { value: "submission_status", label: "Submission status (partner)" },
                      ]
                  ).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {history.coverage?.studentsTotal > 0 && (
              <div className="ma-sent-coverage-card">
                <FiUsers size={16} />
                <div>
                  <strong>
                    {history.coverage.studentsSent} of {history.coverage.studentsTotal} students
                  </strong>
                  <span>
                    covered by sends in this period
                    {history.coverage.percent != null
                      ? ` (${history.coverage.percent}%)`
                      : ""}
                  </span>
                </div>
              </div>
            )}

            {loadingHistory && !history.items.length ? (
              <p className="prw-empty">Loading sent reports…</p>
            ) : !history.items.length ? (
              <p className="prw-empty">No {providerLabel} reports match this filter.</p>
            ) : (
              <>
                <div className="prw-table-wrap">
                  <table className="prw-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Type</th>
                        <th>To</th>
                        <th>Assignments / period</th>
                        <th>Students</th>
                        <th>Sent by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.items.map((row) => (
                        <tr key={row.id}>
                          <td data-label="When">{formatDateTime(row.sentAt)}</td>
                          <td data-label="Type">{row.reportTypeLabel}</td>
                          <td data-label="To">{row.recipientLabel}</td>
                          <td data-label="Content">
                            {row.periodLabel ||
                              (row.assignmentTitles?.length
                                ? row.assignmentTitles.join(", ")
                                : "—")}
                          </td>
                          <td data-label="Students">
                            <strong>
                              {row.coverageLabel ||
                                (row.studentCount > 0
                                  ? `${row.sentCount} of ${row.studentCount} students`
                                  : row.sentCount > 0
                                    ? `${row.sentCount} sent`
                                    : "—")}
                            </strong>
                            {row.skippedCount > 0 &&
                              ` · ${row.skippedCount} skipped`}
                          </td>
                          <td data-label="Sent by">{row.sentByPersonName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={history.page}
                  totalPages={history.totalPages}
                  onPageChange={loadHistory}
                />
              </>
            )}
          </section>
        )}
      </div>

      {showAutoSend && (
        <PartnerReportAutoSendModal
          slug={slug}
          providerLabel={providerLabel}
          igspacesConnected={isIgspacesConnected}
          onClose={() => setShowAutoSend(false)}
        />
      )}
    </main>
  );
}
