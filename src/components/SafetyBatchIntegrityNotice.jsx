export default function SafetyBatchIntegrityNotice({ assessment }) {
  if (!assessment?.issues?.length) return null;

  const failed = assessment.issues.filter((issue) => issue.kind === "failed");
  const incomplete = assessment.issues.filter((issue) => issue.kind === "incomplete");
  const missing = assessment.issues.filter((issue) => issue.kind === "missing");
  const severe = assessment.blocked || failed.length > 0;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        background: severe ? "rgba(239,68,68,0.12)" : "rgba(251,191,36,0.1)",
        border: `1px solid ${severe ? "rgba(239,68,68,0.35)" : "rgba(251,191,36,0.25)"}`,
        color: severe ? "#fca5a5" : "#fcd34d",
      }}
    >
      {assessment.blocked ? (
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Safety batch blocked — re-mark failed papers before Confirm & Mark Rest.
        </div>
      ) : (
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Review safety-batch papers before confirming the rest.
        </div>
      )}
      {[...failed, ...incomplete, ...missing].map((issue) => (
        <div key={issue.submissionId}>
          • {issue.studentName || issue.submissionId}: {issue.message}
        </div>
      ))}
    </div>
  );
}
