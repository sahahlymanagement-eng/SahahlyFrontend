import { toast } from "react-toastify";
import { confirmToast } from "./confirmToast";
import { runMarkSchemeVerification } from "../components/MarkSchemeVerificationModal";
import { getApiErrorMessage } from "./markingFormData";

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

  const checking = toast.info("Checking mark scheme with Gemini against sample papers…", {
    autoClose: false,
  });

  let result;
  try {
    result = await runMarkSchemeVerification(assignmentId, "", options);
  } catch (err) {
    toast.dismiss(checking);
    const message =
      (await getApiErrorMessage(err)) || "Mark scheme check failed";
    const ok = await confirmToast(
      `${message}\n\nContinue batch marking anyway?`,
      {
        title: "Mark scheme check failed",
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
}
