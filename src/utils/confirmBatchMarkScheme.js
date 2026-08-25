// TEMP DISABLED 2026-08-25 — mark-scheme verification paused; restore imports + body later.
// import { toast } from "react-toastify";
// import { confirmToast } from "./confirmToast";
// import { runMarkSchemeVerification } from "../components/MarkSchemeVerificationModal";
// import { getApiErrorMessage } from "./markingFormData";

/**
 * Batch-pipeline mark-scheme gate (same check as the old toolbar button).
 *
 * Compares the assignment mark scheme to 1–3 sample student papers. On a clean
 * pass, batch continues. On fail / warning / error, the user can Continue anyway
 * or Stop — mirroring the page-count / orientation continue pattern.
 *
 * @param {string|number} assignmentId
 * @param {{ grading?: boolean, provider?: string|null }} [options]
 * @returns {Promise<boolean>} true → continue batch; false → abort
 */
export async function confirmBatchMarkScheme(assignmentId, options = {}) {
  if (assignmentId == null || assignmentId === "") return true;

  // TEMP DISABLED 2026-08-25 — skip mark-scheme verification for now; re-enable below later.
  void options;
  return true;

  /*
  const checking = toast.info("Checking mark scheme against sample papers…", {
    autoClose: false,
  });

  let result;
  try {
    result = await runMarkSchemeVerification(assignmentId, "", options);
  } catch (err) {
    toast.dismiss(checking);
    const raw =
      (await getApiErrorMessage(err)) || "Mark scheme check failed";
    const timedOut =
      err?.code === "ECONNABORTED" ||
      /timeout|timed?\s*out|UNAVAILABLE|503|temporarily unavailable/i.test(String(raw));
    const message = timedOut
      ? "Mark scheme check timed out (usually a large PDF or slow AI response). You can retry later, or continue batch marking without this check."
      : raw;
    const ok = await confirmToast(
      `${message}\n\nContinue batch marking anyway?`,
      {
        title: timedOut ? "Mark scheme check timed out" : "Mark scheme check failed",
        confirmLabel: "Continue",
        cancelLabel: "Stop",
        danger: true,
        toastId: "batch-ms-verify-error",
      }
    );
    return Boolean(ok);
  }

  toast.dismiss(checking);

  const status = String(result?.status || "").toLowerCase();
  const summary =
    result?.summary ||
    result?.message ||
    result?.reason ||
    (status === "pass"
      ? "Mark scheme looks correct for the sample papers."
      : "Mark scheme may not match the sample student papers.");

  if (status === "pass") {
    toast.success("Mark scheme verified — continuing batch marking");
    return true;
  }

  const isFail = status === "fail";
  const ok = await confirmToast(
    `${summary}\n\nContinue batch marking anyway?`,
    {
      title: isFail ? "Mark scheme looks wrong" : "Mark scheme check warning",
      confirmLabel: "Continue",
      cancelLabel: "Stop",
      danger: isFail,
      toastId: "batch-ms-verify-continue",
    }
  );
  return Boolean(ok);
  */
}
