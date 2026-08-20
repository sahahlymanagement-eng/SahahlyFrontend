import { useEffect, useState } from "react";
import { FiCheckCircle, FiAlertTriangle, FiX, FiXCircle, FiShield, FiRotateCcw } from "react-icons/fi";
import api from "../api/api";

const STATUS_META = {
  pass: {
    label: "Verification passed",
    icon: FiCheckCircle,
    className: "msv-verify-banner--pass",
  },
  warning: {
    label: "Verification warnings",
    icon: FiAlertTriangle,
    className: "msv-verify-banner--warning",
  },
  fail: {
    label: "Verification failed",
    icon: FiXCircle,
    className: "msv-verify-banner--fail",
  },
};

function CheckStatusIcon({ status }) {
  if (status === "pass") return <FiCheckCircle size={14} className="msv-verify-check--pass" />;
  if (status === "fail") return <FiXCircle size={14} className="msv-verify-check--fail" />;
  return <FiAlertTriangle size={14} className="msv-verify-check--warning" />;
}

export default function MarkSchemeVerificationModal({
  open,
  onClose,
  assignmentId,
  assignmentTitle,
  verifying,
  result,
  onRun,
}) {
  const [masterPrompt, setMasterPrompt] = useState("");
  const [defaultMasterPrompt, setDefaultMasterPrompt] = useState("");
  const [loadingMaster, setLoadingMaster] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingMaster(true);
    api
      .get("/marking/openai-master-prompts")
      .then((res) => {
        if (cancelled) return;
        const text = res.data?.markSchemeVerification || "";
        setDefaultMasterPrompt(text);
        setMasterPrompt((prev) => (prev.trim() ? prev : text));
      })
      .catch(() => {
        if (!cancelled) setDefaultMasterPrompt("");
      })
      .finally(() => {
        if (!cancelled) setLoadingMaster(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const meta = result ? STATUS_META[result.status] || STATUS_META.warning : null;
  const StatusIcon = meta?.icon;

  return (
    <div className="msv-overlay" onClick={onClose}>
      <div className="msv-guidance-modal apg-modal msv-verify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="msv-guidance-header">
          <div>
            <h3>Mark Scheme Verification</h3>
            <p className="apg-subtitle">
              {assignmentTitle
                ? `${assignmentTitle} — QA check before bulk marking`
                : "Verify mark scheme matches Classroom and student papers"}
            </p>
          </div>
          <button type="button" className="msv-icon-btn" onClick={onClose} aria-label="Close">
            <FiX size={16} />
          </button>
        </div>

        <p className="apg-help">
          Edit the verification prompt, then run. Compares the uploaded mark scheme with three
          sample student submissions. Verdicts: safe to use, required corrections, or rejected.
        </p>

        <div className="apg-master-row">
          <label className="apg-extra-label" htmlFor="msv-master-prompt">
            Verification prompt (editable)
          </label>
          <button
            type="button"
            className="apg-reset-btn"
            onClick={() => setMasterPrompt(defaultMasterPrompt)}
            disabled={loadingMaster || verifying || !defaultMasterPrompt}
          >
            <FiRotateCcw size={12} /> Reset to default
          </button>
        </div>
        {loadingMaster ? (
          <p className="apg-loading">Loading verification prompt…</p>
        ) : (
          <textarea
            id="msv-master-prompt"
            className="apg-textarea apg-textarea--master"
            value={masterPrompt}
            onChange={(e) => setMasterPrompt(e.target.value)}
            placeholder="Prompt used for mark scheme verification…"
            rows={18}
            disabled={verifying}
          />
        )}

        <div className="apg-actions" style={{ marginTop: 12, marginBottom: 16 }}>
          <button
            type="button"
            className="msv-btn-ai msv-btn-verify"
            onClick={() => onRun?.(masterPrompt)}
            disabled={verifying || !assignmentId || loadingMaster || !masterPrompt.trim()}
          >
            {verifying ? (
              <>
                <span className="pm-spinner" /> Verifying…
              </>
            ) : (
              <>
                <FiShield size={13} /> Run verification
              </>
            )}
          </button>
        </div>

        {result && meta ? (
          <>
            <div className={`msv-verify-banner ${meta.className}`}>
              {StatusIcon ? <StatusIcon size={20} /> : null}
              <div>
                <strong>{result.verdict || meta.label}</strong>
                <p>{result.summary}</p>
              </div>
            </div>

            <div className="msv-verify-stats">
              <div>
                <span>Classroom max</span>
                <strong>{result.classroomMaxPoints ?? "—"}</strong>
              </div>
              <div>
                <span>Mark scheme total</span>
                <strong>{result.markSchemeTotalMarks ?? "—"}</strong>
              </div>
              <div>
                <span>Totals match</span>
                <strong>{result.totalsMatch ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Questions in MS</span>
                <strong>{result.questionCount ?? "—"}</strong>
              </div>
            </div>

            {result.checks?.length > 0 && (
              <div className="msv-verify-checks">
                <h4>Checks</h4>
                <ul>
                  {result.checks.map((check, idx) => (
                    <li key={check.id || idx}>
                      <CheckStatusIcon status={check.status} />
                      <div>
                        <strong>{check.label}</strong>
                        <p>{check.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.recommendations?.length > 0 && (
              <div className="msv-verify-recommendations">
                <h4>Recommendations</h4>
                <ul>
                  {result.recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.fullReport ? (
              <div className="msv-verify-recommendations">
                <h4>Full verification report</h4>
                <pre className="apg-textarea" style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>
                  {result.fullReport}
                </pre>
              </div>
            ) : null}

            {result.verifiedAt ? (
              <p className="msv-verify-footnote">
                Verified {new Date(result.verifiedAt).toLocaleString()}
                {result.sampleCount ? ` · ${result.sampleCount} sample submission(s)` : ""}
              </p>
            ) : null}
          </>
        ) : !verifying ? (
          <p className="apg-loading">Press “Run verification” to analyze the mark scheme.</p>
        ) : null}

        <div className="apg-actions">
          <button type="button" className="msv-cancel-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Two id spaces, same as the assignment prompt — see useAssignmentMarkingPrompt.js.
//
// Classroom assignments have an Assignment document, so /marking/markscheme-verification
// is keyed by a Mongo ObjectId. Grading-partner assignments (LoginCSS, Mariam
// Gabalawy, Dr Peter) have none — they arrive inline on each submission, keyed by
// the partner's own numeric id — so that route answers "Assignment not found" for
// every one of them. Their verification lives behind the provider-scoped routes
// below, which take the mark scheme and samples from the partner instead of Drive.
//
// `provider` null/undefined means LoginCSS, which keeps its own /external-grading
// routes; any slug goes through the shared /grading/:provider registry.
function markSchemeVerificationPath({ grading, provider, assignmentId }) {
  if (!grading) return `/marking/markscheme-verification/${assignmentId}`;
  return provider
    ? `/grading/${provider}/assignments/${assignmentId}/markscheme-verification`
    : `/external-grading/assignments/${assignmentId}/markscheme-verification`;
}

/**
 * @param {string|number} assignmentId
 * @param {string} [masterPrompt]
 * @param {{grading?: boolean, provider?: string|null}} [options]
 */
export async function runMarkSchemeVerification(assignmentId, masterPrompt = "", options) {
  const res = await api.post(
    markSchemeVerificationPath({
      grading: Boolean(options?.grading),
      provider: options?.provider ?? null,
      assignmentId,
    }),
    { masterPrompt: String(masterPrompt || "").trim() }
  );
  return res.data;
}
