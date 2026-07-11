import { FiCheckCircle, FiAlertTriangle, FiX, FiXCircle, FiShield } from "react-icons/fi";
import api from "../api/api";
import { toast } from "react-toastify";

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
          Checks that your mark scheme covers the same questions as the student papers.
          Mixed IGCSE quizzes with repeated question numbers are allowed — only a wrong /
          mismatched mark scheme should fail.
        </p>

        <div className="apg-actions" style={{ marginTop: 0, marginBottom: 16 }}>
          <button
            type="button"
            className="msv-btn-ai msv-btn-verify"
            onClick={onRun}
            disabled={verifying || !assignmentId}
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
                <strong>{meta.label}</strong>
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

export async function runMarkSchemeVerification(assignmentId) {
  const res = await api.post(`/marking/markscheme-verification/${assignmentId}`);
  return res.data;
}
