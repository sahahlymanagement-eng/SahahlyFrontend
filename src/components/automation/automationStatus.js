/**
 * Vocabulary of an automation run, in one place so the stepper, the badges and
 * the rejection copy can't drift apart.
 *
 * The backend owns these strings. Anything unrecognised is humanised and shown
 * verbatim rather than dropped, so a stage added server-side degrades to a
 * readable label instead of a blank panel.
 */
import { isStudentSubmitted } from "../../utils/markingFormData";

/**
 * Whether a roster row is something the run can mark. Selection is keyed by
 * `submissionId` because that is what the backend scopes on, so a student with
 * no submission is never selectable.
 */
export function isEligibleRow(student) {
  return !!student?.submissionId && isStudentSubmitted(student.state);
}

/** Pipeline stages, in the order the run walks them. */
export const STAGES = [
  { key: "fetching_submissions", label: "Fetch submissions" },
  { key: "verifying_mark_scheme", label: "Verify mark scheme" },
  { key: "generating_prompt", label: "Generate prompt" },
  { key: "computing_expected_pages", label: "Expected pages" },
  // Only entered on a re-mark run; it sits inside the mark step, just before the
  // upload, so it belongs here in the walk even though most runs skip it.
  { key: "clearing_previous_results", label: "Clear old marks" },
  { key: "batch_upload", label: "Upload batch" },
  { key: "batch_submit", label: "Submit batch" },
  { key: "polling_batch", label: "Mark" },
  { key: "saving_results", label: "Save results" },
  { key: "marking_done", label: "Done" },
];

const STAGE_INDEX = new Map(STAGES.map((s, i) => [s.key, i]));

// Stages that aren't steps of their own: the run passes through them on the way
// into the loop, so they read as "at the top of the pipeline".
const STAGE_ALIASES = {
  starting: "fetching_submissions",
  resuming: "fetching_submissions",
};

/**
 * The four resumable steps the backend records in `resumeStep`, named as the
 * user sees them in the stepper.
 */
export const RESUME_STEP_LABELS = {
  verify: "mark-scheme verification",
  prompt: "prompt generation",
  pages: "the expected page count",
  mark: "batch marking",
};

/** Statuses where the pipeline has stopped for good — polling can stand down. */
export const TERMINAL_STATUSES = new Set([
  "marking_done",
  "halted_markscheme",
  "failed",
  "cancelled",
]);

/** A missing record is not a run in progress, so this is false for null. */
export function isRunActive(run) {
  return !!run?.status && !TERMINAL_STATUSES.has(run.status);
}

/** -1 for an unknown stage, which the stepper renders as "not reached yet". */
export function stageIndexOf(stage) {
  const key = STAGE_ALIASES[stage] || stage;
  return STAGE_INDEX.has(key) ? STAGE_INDEX.get(key) : -1;
}

/**
 * How far the stepper should fill. A finished run is complete regardless of the
 * stage it last reported; a halt is pinned to the stage that raised it, since
 * that is the step the user has to act on.
 */
export function progressIndex(run) {
  if (!run) return -1;
  if (run.status === "marking_done") return STAGES.length - 1;
  if (run.status === "halted_markscheme") {
    return stageIndexOf(run.stage) >= 0
      ? stageIndexOf(run.stage)
      : stageIndexOf("verifying_mark_scheme");
  }
  return stageIndexOf(run.stage);
}

export function humanize(value) {
  if (!value) return "";
  return String(value)
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

const STATUS_TONE = {
  queued: "neutral",
  pending: "neutral",
  running: "info",
  marking: "info",
  marking_done: "success",
  halted_markscheme: "warning",
  failed: "danger",
  cancelled: "muted",
};

export function statusTone(status) {
  return STATUS_TONE[status] || "neutral";
}

/**
 * Why a trigger was refused, in the user's terms. The backend's own `message`
 * still wins where it has one — this fills the gap when it doesn't, and adds
 * the "what do I do about it" half that a reason code alone can't carry.
 */
export const REJECTION_HINTS = {
  no_mark_scheme:
    "This assignment has no mark scheme. Upload one from the Submission Viewer, then run again.",
  due_not_passed:
    "The due date hasn't passed yet, so submissions are still open. Force runs it anyway.",
  already_active: "A run is already in progress for this assignment. Wait for it to finish.",
  already_done:
    "This assignment has already been marked. Force re-runs it and overwrites the results.",
  no_submissions: "There is no submitted work to mark for this assignment.",
  none_of_selected_found: "None of the selected rows are eligible submissions.",
  no_run: "There is no run to continue for this assignment — start one instead.",
  nothing_to_resume:
    "This run has no halted or failed step left to continue from. Start a fresh run instead.",
};

/** Rejections that Force resolves — `already_active` is not one of them. */
export const FORCEABLE_REASONS = new Set(["due_not_passed", "already_done"]);

/**
 * Result counts, tolerant of where the backend hangs them: the run doc may
 * carry them flat or nested under `counts`.
 */
export function runCounts(run) {
  const c = run?.counts || {};
  const pick = (...keys) => {
    for (const key of keys) {
      const flat = run?.[key];
      if (typeof flat === "number") return flat;
      const nested = c[key];
      if (typeof nested === "number") return nested;
    }
    return null;
  };
  // `eligible` is what actually went into the batch and is the honest
  // denominator once marking starts; before that it is still 0, so fall back to
  // the count of students with a submission.
  const eligible = pick("eligibleCount", "eligible");
  const total = pick("totalCount", "total", "scopedCount");

  return {
    saved: pick("savedCount", "saved"),
    total: eligible || total,
    failed: pick("failedCount", "failed"),
  };
}

/** Whether the backend left this run somewhere Continue can pick up from. */
export function canContinue(run) {
  return !!run?.resumeStep && !isRunActive(run);
}
