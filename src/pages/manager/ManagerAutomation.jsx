import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FiAlertTriangle, FiPlay, FiZap } from "react-icons/fi";

import api from "../../api/api";
import * as autoApi from "../../api/automation";
import { usePagination } from "../../hooks/usePagination";
import usePersistedState from "../../hooks/usePersistedState";
import { useMarkingStudentSelection } from "../../utils/markingStudentSelection";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
import { confirmToast } from "../../utils/confirmToast";
import AutomationTargetPicker from "../../components/automation/AutomationTargetPicker";
import AutomationSubmissionsTable from "../../components/automation/AutomationSubmissionsTable";
import AutomationRunPanel from "../../components/automation/AutomationRunPanel";
import AutomationRecentRuns from "../../components/automation/AutomationRecentRuns";
import {
  FORCEABLE_REASONS,
  REJECTION_HINTS,
  RESUME_STEP_LABELS,
  isEligibleRow,
  isRunActive,
} from "../../components/automation/automationStatus";
import "../../components/automation/automation.css";

/**
 * Marking Automation tab — mounted for managers and assistants.
 *
 * Like ManagerSubmissionViewer, one component serves several roles through a
 * `scope` prop; only the three list endpoints differ. Assistants reach their
 * assignments through the workflow list (already scoped to them), so they skip
 * the classroom step entirely.
 *
 * The run itself is fire-and-forget: the POST returns as soon as the run is
 * claimed and everything after that is read back by polling /status. That is
 * why selecting an assignment always re-reads the run record — a run started
 * here, or by someone else, is still visible after navigating away and back.
 *
 * State that a fetch owns is only ever written after an await; the "starting a
 * fetch" half (spinners, clearing the previous assignment's rows) belongs to
 * the handler that changed the selection, which keeps effects free of the
 * synchronous cascading setState React 19 warns about.
 */

const POLL_MS = 6000;
const PAGE_SIZE = 10;

const SCOPES = {
  manager: {
    needsClassroom: true,
    classroomsUrl: "/students/my-classrooms",
    assignmentsUrl: (classroomId) =>
      `/manager-assignments/classroom/${classroomId}/assignments`,
    studentsUrl: (assignmentId) => `/manager-assignments/${assignmentId}/full`,
  },
  assistant: {
    needsClassroom: false,
    assignmentsUrl: () => "/assignment-workflow/assistant/assignments",
    studentsUrl: (assignmentId) => `/assignment-submissions/${assignmentId}/students`,
  },
};

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export default function ManagerAutomation({ scope = "manager" }) {
  const cfg = SCOPES[scope] || SCOPES.manager;
  const [user] = useState(readUser);

  const [selectedClassroom, setSelectedClassroom] = usePersistedState(
    `automation:${scope}:classroom`,
    null
  );
  const [selectedAssignment, setSelectedAssignment] = usePersistedState(
    `automation:${scope}:assignment`,
    null
  );

  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);

  const [roster, setRoster] = useState([]);
  const [markedIds, setMarkedIds] = useState(() => new Set());
  // A persisted assignment means the roster and run fetches fire on mount, so
  // these start true rather than flashing an empty table first.
  const [rosterLoading, setRosterLoading] = useState(() => !!selectedAssignment);
  const [rosterError, setRosterError] = useState(null);
  const [markScheme, setMarkScheme] = useState({ known: false, fileId: null });

  const [dryRun, setDryRun] = useState(false);
  const [force, setForce] = useState(false);
  const [remark, setRemark] = useState(false);

  const [run, setRun] = useState(null);
  const [runLoading, setRunLoading] = useState(() => !!selectedAssignment);
  const [launching, setLaunching] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [rejection, setRejection] = useState(null);

  const [recentRuns, setRecentRuns] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const selection = useMarkingStudentSelection();
  const { clear: clearSelection } = selection;

  const assignmentId = selectedAssignment?._id || null;
  const classroomId = selectedClassroom?._id || null;

  // Switching assignments while a request is in flight must not let the slower
  // response land on the newer selection.
  const currentAssignmentRef = useRef(assignmentId);
  useEffect(() => {
    currentAssignmentRef.current = assignmentId;
  }, [assignmentId]);

  /* ── Target lists ────────────────────────────────────────────────────── */

  // `/students/my-classrooms` is scoped by the caller's person id, not by the
  // token alone — without it the endpoint has no manager to filter on and comes
  // back empty (same params the Submission Viewer sends).
  const classroomParams = useMemo(
    () => ({ search: classroomSearch, personId: user?.id }),
    [classroomSearch, user?.id]
  );

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    loading: classroomsLoading,
    fetchPage: fetchClassroomPage,
  } = usePagination(
    cfg.classroomsUrl || "/students/my-classrooms",
    classroomParams,
    20,
    "data",
    cfg.needsClassroom && !!user?.id && !selectedClassroom
  );

  const assignmentParams = useMemo(
    () =>
      cfg.needsClassroom
        ? { search: assignmentSearch }
        : { personId: user?.id, status: "ALL", classroom: "ALL", search: assignmentSearch },
    [cfg.needsClassroom, user?.id, assignmentSearch]
  );

  const assignmentsUrl = cfg.needsClassroom
    ? classroomId
      ? cfg.assignmentsUrl(classroomId)
      : ""
    : cfg.assignmentsUrl();

  const {
    data: assignments,
    page: assignmentPage,
    totalPages: assignmentTotalPages,
    loading: assignmentsLoading,
    fetchPage: fetchAssignmentPage,
  } = usePagination(
    assignmentsUrl,
    assignmentParams,
    10,
    "data",
    !!assignmentsUrl && !selectedAssignment && (cfg.needsClassroom || !!user?.id)
  );

  /* ── Roster ──────────────────────────────────────────────────────────── */

  const loadRoster = useCallback(async () => {
    const id = assignmentId;
    if (!id) return;
    try {
      // Saved marking lives in its own collection; losing it only costs the
      // "already marked" annotation, so it must not sink the whole table.
      const [students, saved] = await Promise.all([
        fetchAllPaginated(api, cfg.studentsUrl(id), {}, "students"),
        api
          .get(`/submission-files/save-results/${id}`)
          .then((r) => r.data?.data || [])
          .catch(() => []),
      ]);
      if (currentAssignmentRef.current !== id) return;
      setRoster(students);
      setMarkedIds(new Set(saved.filter((r) => r.result).map((r) => r.submissionId)));
      setRosterError(null);
    } catch (err) {
      if (currentAssignmentRef.current !== id) return;
      setRoster([]);
      setMarkedIds(new Set());
      setRosterError(
        err.response?.data?.message || err.message || "Could not load submissions"
      );
    } finally {
      if (currentAssignmentRef.current === id) setRosterLoading(false);
    }
  }, [assignmentId, cfg]);

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      await loadRoster();
    })();
  }, [assignmentId, loadRoster]);

  // A mark scheme that can't be read is "unknown", not "missing": the Run
  // button stays enabled and the backend gets the final say.
  useEffect(() => {
    if (!assignmentId) return;
    let alive = true;
    api
      .get(`/manager-assignments/${assignmentId}/markscheme`)
      .then((res) => {
        if (alive) setMarkScheme({ known: true, fileId: res.data?.fileId || null });
      })
      .catch(() => {
        if (alive) setMarkScheme({ known: false, fileId: null });
      });
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  /* ── Run status ──────────────────────────────────────────────────────── */

  const refreshRun = useCallback(
    async ({ silent = true } = {}) => {
      const id = assignmentId;
      if (!id) return null;
      try {
        const record = await autoApi.getRunStatus(id);
        if (currentAssignmentRef.current !== id) return null;
        setRun(record);
        return record;
      } catch (err) {
        if (!silent) toast.error(autoApi.autoErr(err, "Could not load the run status"));
        return null;
      } finally {
        if (currentAssignmentRef.current === id) setRunLoading(false);
      }
    },
    [assignmentId]
  );

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      await refreshRun();
    })();
  }, [assignmentId, refreshRun]);

  const runActive = isRunActive(run);

  useEffect(() => {
    if (!runActive) return;
    const id = setInterval(() => {
      if (!document.hidden) refreshRun();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [runActive, refreshRun]);

  const loadRecentRuns = useCallback(async () => {
    try {
      setRecentRuns(await autoApi.listRuns({ classroomId: classroomId || undefined, limit: 10 }));
    } catch {
      // The list is a convenience; a failure here shouldn't shout over the run.
      setRecentRuns([]);
    } finally {
      setRecentLoading(false);
    }
  }, [classroomId]);

  useEffect(() => {
    (async () => {
      await loadRecentRuns();
    })();
  }, [loadRecentRuns]);

  // Announce the outcome once, on the active → finished edge, and re-read the
  // roster so the Marking column reflects what the run just saved.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (wasActiveRef.current && !runActive && run) {
      if (run.status === "marking_done") {
        toast.success(run.dryRun ? "Dry run finished" : "Automation finished — results saved");
      } else if (run.status === "halted_markscheme") {
        toast.warn("Halted — the mark scheme needs review");
      } else if (run.status === "failed") {
        toast.error(run.error || "The automation run failed");
      }
      loadRoster();
      loadRecentRuns();
    }
    wasActiveRef.current = runActive;
  }, [runActive, run, loadRoster, loadRecentRuns]);

  /* ── Derived roster state ────────────────────────────────────────────── */

  const eligible = useMemo(() => roster.filter(isEligibleRow), [roster]);

  const markedCount = useMemo(
    () => eligible.filter((s) => markedIds.has(s.submissionId)).length,
    [eligible, markedIds]
  );

  const unmarkedIds = useMemo(
    () => eligible.filter((s) => !markedIds.has(s.submissionId)).map((s) => s.submissionId),
    [eligible, markedIds]
  );

  // How many rows Re-mark would actually clear — the marked ones inside the
  // current scope, which is the selection when there is one and everything
  // eligible when there isn't.
  const scopedMarkedCount = selection.selectedCount
    ? [...selection.selectedIds].filter((id) => markedIds.has(id)).length
    : markedCount;

  const filtered = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((s) => `${s.name || ""} ${s.email || ""}`.toLowerCase().includes(q));
  }, [roster, studentSearch]);

  const studentTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped rather than corrected in an effect: a shrinking filter would
  // otherwise render one empty page before the reset landed.
  const safePage = Math.min(studentPage, studentTotalPages);

  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const selectPage = () =>
    selection.mergeIds(pageRows.filter(isEligibleRow).map((s) => s.submissionId));

  const deselectPage = () => {
    const pageIds = new Set(pageRows.filter(isEligibleRow).map((s) => s.submissionId));
    selection.selectIds([...selection.selectedIds].filter((id) => !pageIds.has(id)));
  };

  /* ── Launching ───────────────────────────────────────────────────────── */

  // An empty selection is not "nothing" — the backend reads it as every
  // eligible submission, which is what the scope line has to say out loud.
  const scopedCount = selection.selectedCount || eligible.length;
  const scopeLabel = selection.selectedCount
    ? `${selection.selectedCount} selected submission${selection.selectedCount === 1 ? "" : "s"}`
    : `all eligible submissions (${eligible.length} submitted)`;

  const blockedReason = !assignmentId
    ? "Pick an assignment to run the automation on."
    : runActive
      ? "A run is already in progress for this assignment."
      : markScheme.known && !markScheme.fileId
        ? "This assignment has no mark scheme. Upload one from the Submission Viewer first."
        : rosterLoading
          ? "Loading submissions…"
          : !rosterError && scopedCount === 0
            ? "There is no submitted work to mark."
            : null;

  // Re-mark deletes the saved MarkingResult for each scoped submission before
  // re-running Gemini, so the manual corrections and returned status on those
  // rows go with it. That sentence is worth repeating at every confirmation.
  const remarkWarning = `Re-mark first deletes the existing marks for ${
    scopedMarkedCount || "the scoped"
  } already-marked submission${scopedMarkedCount === 1 ? "" : "s"} — including any manual corrections and their returned status — then marks them again.`;

  const launch = async ({ forceRun = force, dry = dryRun, redo = remark } = {}) => {
    if (!assignmentId || launching || continuing) return;

    // A dry run still verifies and regenerates the prompt — it just stops
    // before the expensive, irreversible half, which is what the confirmation
    // is guarding.
    if (!dry) {
      const ok = await confirmToast(
        `Mark ${scopeLabel} with Gemini. This also sets the assignment's expected page count and WhatsApps the manager when it finishes.${
          forceRun
            ? " Force starts the run even if the due date hasn't passed or one already finished."
            : ""
        }${redo ? ` ${remarkWarning}` : ""}`,
        {
          title: redo ? "Run and re-mark" : forceRun ? "Force run automation" : "Run automation",
          confirmLabel: "Run it",
          cancelLabel: "Cancel",
          danger: forceRun || redo,
        }
      );
      if (!ok) return;
    }

    setLaunching(true);
    setRejection(null);
    try {
      const res = await autoApi.triggerRun(assignmentId, {
        submissionIds: [...selection.selectedIds],
        force: forceRun,
        dryRun: dry,
        remark: redo,
      });
      toast.success(dry ? "Dry run started" : "Automation started");

      // The record is usually written by the time the 202 lands; seed a
      // placeholder when it isn't, so the panel shows progress rather than
      // "nothing has run yet" until the first poll catches up.
      const record = await refreshRun();
      if (!record) {
        setRun({
          _id: res?.runId,
          status: "running",
          stage: "fetching_submissions",
          dryRun: dry,
          selectionMode: res?.selectionMode,
          scopedCount: res?.scopedCount,
        });
      }
      loadRecentRuns();
    } catch (err) {
      const reason = autoApi.runReason(err);
      const hint = REJECTION_HINTS[reason];
      const message = autoApi.autoErr(err, hint || "Could not start the automation");
      setRejection({ reason, message, hint, forceable: FORCEABLE_REASONS.has(reason) });
      toast.error(message);
      // "Already active" means a run is live — show it instead of just refusing.
      if (reason === "already_active") refreshRun();
    } finally {
      setLaunching(false);
    }
  };

  const runWithForce = () => {
    setForce(true);
    launch({ forceRun: true });
  };

  /**
   * Resume from wherever the backend parked the run. After a halt that means
   * overriding the mark-scheme objection — a judgement call, so it is confirmed;
   * after a failure it is just a retry of the step that threw, which isn't.
   */
  const handleContinue = async () => {
    if (!assignmentId || continuing) return;

    const halted = run?.status === "halted_markscheme";
    // A plain retry of a failed step needs no ceremony; overriding the mark
    // scheme or clearing saved marks does.
    if (halted || remark) {
      const parts = [];
      if (halted) {
        parts.push(
          `The mark scheme came back as "${run.markSchemeStatus || "not passing"}". Continuing accepts it as it stands and marks every scoped submission against it.`
        );
      }
      if (remark) parts.push(remarkWarning);

      const ok = await confirmToast(parts.join(" "), {
        title: halted ? "Continue anyway" : "Continue and re-mark",
        confirmLabel: "Continue",
        cancelLabel: halted ? "Keep it halted" : "Cancel",
        danger: true,
      });
      if (!ok) return;
    }

    setContinuing(true);
    setRejection(null);
    try {
      const res = await autoApi.continueRun(assignmentId, { remark });
      const from = RESUME_STEP_LABELS[res?.resumedFrom || run?.resumeStep] || "the next step";
      toast.success(`Resuming from ${from}`);

      const record = await refreshRun();
      if (!record) setRun((prev) => (prev ? { ...prev, status: "running", stage: "resuming" } : prev));
      loadRecentRuns();
    } catch (err) {
      const reason = autoApi.runReason(err);
      const hint = REJECTION_HINTS[reason];
      const message = autoApi.autoErr(err, hint || "Could not continue the run");
      setRejection({ reason, message, hint, forceable: false });
      toast.error(message);
      // The run moved on between render and click — show where it actually is.
      if (reason === "already_active" || reason === "nothing_to_resume") refreshRun();
    } finally {
      setContinuing(false);
    }
  };

  /* ── Target handlers ─────────────────────────────────────────────────── */

  // Everything the previous assignment owned is dropped here rather than in an
  // effect, so the new selection never renders against stale rows.
  const resetForAssignment = (next) => {
    clearSelection();
    setStudentPage(1);
    setStudentSearch("");
    setRejection(null);
    setRoster([]);
    setMarkedIds(new Set());
    setRosterError(null);
    setMarkScheme({ known: false, fileId: null });
    setRun(null);
    setRosterLoading(!!next);
    setRunLoading(!!next);
    // Re-mark is destructive and scope-specific — it must never carry over to
    // whatever assignment is picked next.
    setRemark(false);
  };

  const pickClassroom = (classroom) => {
    resetForAssignment(null);
    setSelectedClassroom(classroom);
    setSelectedAssignment(null);
    setAssignmentSearch("");
  };

  const changeClassroom = () => {
    resetForAssignment(null);
    setSelectedClassroom(null);
    setSelectedAssignment(null);
  };

  const pickAssignment = (assignment) => {
    resetForAssignment(assignment);
    setSelectedAssignment(assignment);
  };

  const changeAssignment = () => {
    resetForAssignment(null);
    setSelectedAssignment(null);
  };

  return (
    <div className="ast-page ast-page--wide atm-page">
      <header>
        <h1 className="atm-page-title">Marking Automation</h1>
        <p className="atm-page-subtitle">
          Run the whole marking pipeline on an assignment — verify the mark scheme, generate the
          prompt, work out the expected page count, then batch-mark. Tick submissions to narrow the
          run, or leave the selection empty to cover everything eligible.
        </p>
      </header>

      <AutomationTargetPicker
        classrooms={
          cfg.needsClassroom
            ? {
                items: classrooms,
                loading: classroomsLoading,
                page: classroomPage,
                totalPages: classroomTotalPages,
                onPageChange: fetchClassroomPage,
                search: classroomSearch,
                onSearch: setClassroomSearch,
              }
            : null
        }
        selectedClassroom={selectedClassroom}
        onPickClassroom={pickClassroom}
        onChangeClassroom={changeClassroom}
        assignments={{
          items: assignments,
          loading: assignmentsLoading,
          page: assignmentPage,
          totalPages: assignmentTotalPages,
          onPageChange: fetchAssignmentPage,
          search: assignmentSearch,
          onSearch: setAssignmentSearch,
        }}
        selectedAssignment={selectedAssignment}
        onPickAssignment={pickAssignment}
        onChangeAssignment={changeAssignment}
      />

      {selectedAssignment && (
        <>
          <AutomationSubmissionsTable
            rows={pageRows}
            loading={rosterLoading}
            error={rosterError}
            search={studentSearch}
            onSearch={(value) => {
              setStudentSearch(value);
              setStudentPage(1);
            }}
            page={safePage}
            totalPages={studentTotalPages}
            onPageChange={setStudentPage}
            selection={selection}
            markedIds={markedIds}
            counts={{
              total: roster.length,
              eligible: eligible.length,
              marked: markedCount,
              unmarked: unmarkedIds.length,
            }}
            busy={launching || continuing}
            onSelectPage={selectPage}
            onDeselectPage={deselectPage}
            onSelectAllUnmarked={() => selection.selectIds(unmarkedIds)}
            onClearSelection={clearSelection}
            onReload={() => {
              setRosterLoading(true);
              loadRoster();
            }}
          />

          <section className="atm-card">
            <header className="atm-card-header">
              <h2 className="atm-card-title">
                <FiZap aria-hidden="true" /> Run
              </h2>
            </header>

            <div className="atm-controls">
              <div className="atm-options">
                <button
                  type="button"
                  className={`atm-toggle${dryRun ? " atm-toggle--on" : ""}`}
                  aria-pressed={dryRun}
                  onClick={() => setDryRun((v) => !v)}
                  disabled={launching || continuing}
                >
                  Dry run
                  <span className="atm-toggle-hint">
                    Verify, prompt and page count only — stops before marking
                  </span>
                </button>

                <button
                  type="button"
                  className={`atm-toggle atm-toggle--danger${force ? " atm-toggle--on" : ""}`}
                  aria-pressed={force}
                  onClick={() => setForce((v) => !v)}
                  disabled={launching || continuing}
                >
                  Force
                  <span className="atm-toggle-hint">
                    Start even before the due date, or after it but must be unmarked
                  </span>
                </button>

                <button
                  type="button"
                  className={`atm-toggle atm-toggle--danger${remark ? " atm-toggle--on" : ""}`}
                  aria-pressed={remark}
                  onClick={() => setRemark((v) => !v)}
                  disabled={launching || continuing}
                >
                  Re-mark
                  <span className="atm-toggle-hint">
                    {scopedMarkedCount
                      ? `Delete and redo ${scopedMarkedCount} existing mark${
                          scopedMarkedCount === 1 ? "" : "s"
                        } in scope`
                      : "Nothing in scope is marked yet"}
                  </span>
                </button>
              </div>

              <div className="atm-run">
                <button
                  type="button"
                  className="sah-btn sah-btn--primary"
                  onClick={() => launch()}
                  disabled={!!blockedReason || launching || continuing}
                >
                  <FiPlay aria-hidden="true" />
                  {launching ? "Starting…" : dryRun ? "Start dry run" : "Run automation"}
                </button>
                <span className="atm-run-scope">Covers {scopeLabel}</span>
              </div>
            </div>

            {blockedReason && <p className="atm-blocked">{blockedReason}</p>}

            {rejection && (
              <div className="atm-notice atm-notice--danger">
                <FiAlertTriangle aria-hidden="true" />
                <div>
                  <p className="atm-notice-title">{rejection.message}</p>
                  {rejection.hint && rejection.hint !== rejection.message && (
                    <p className="atm-notice-text">{rejection.hint}</p>
                  )}
                  {rejection.forceable && (
                    <button
                      type="button"
                      className="sah-btn sah-btn--secondary atm-btn--sm atm-notice-btn"
                      onClick={runWithForce}
                      disabled={launching}
                    >
                      Run with Force
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <AutomationRunPanel
            run={run}
            loading={runLoading}
            starting={launching}
            busy={launching || continuing}
            remark={remark}
            onRefresh={() => {
              setRunLoading(true);
              refreshRun({ silent: false });
            }}
            onForceRetry={runWithForce}
            onContinue={handleContinue}
          />
        </>
      )}

      <AutomationRecentRuns
        runs={recentRuns}
        loading={recentLoading}
        onRefresh={() => {
          setRecentLoading(true);
          loadRecentRuns();
        }}
      />
    </div>
  );
}
