import { FiX, FiRefreshCw, FiEye } from "react-icons/fi";

export default function OrientationCheckModal({ state, onResolve, onOpenPdf }) {
  if (!state) return null;

  const report = state.report;
  const checked = report?.checked || [];
  const flagged = checked.filter((c) => c.flagged);
  const unreadable = checked.filter((c) => c.unreadable);
  const skipped = report?.skipped || [];
  const errored = report?.errored || [];
  const nameOf = (row) =>
    row.student?.name || row.studentName || row.student?.studentId || row.submissionId || "Unknown";

  const summaryText = (c) => {
    if (c.unreadable) return "PDF unreadable";
    const pages = c.mismatchedPages?.length ? c.mismatchedPages.join(", ") : "unknown";
    return `Mixed orientation on page${c.mismatchedPages?.length === 1 ? "" : "s"} ${pages}`;
  };

  return (
    <div
      className="msv-overlay"
      onClick={() => {
        if (!state.loading) onResolve(false);
      }}
    >
      <div
        className="msv-results-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580 }}
      >
        <div className="msv-modal-header">
          <div style={{ fontSize: 15, fontWeight: 700 }}>↔ Page Orientation Check</div>
          {!state.loading && (
            <button className="msv-icon-btn" onClick={() => onResolve(false)}>
              <FiX />
            </button>
          )}
        </div>

        {state.loading ? (
          <div style={{ padding: "30px 20px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            <FiRefreshCw size={18} className="msv-spin" style={{ verticalAlign: -3, marginRight: 8 }} />
            Checking page orientation before grading…
          </div>
        ) : (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.5, marginBottom: 14 }}>
              ⚠️ {report.flaggedCount} submission{report.flaggedCount === 1 ? "" : "s"} contain mixed page orientations.
              These may be scanned or uploaded incorrectly. Review before continuing.
            </div>

            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
              {flagged.map((c) => (
                <div
                  key={c.submissionId}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                    padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {nameOf(c)}
                  </span>
                  <span style={{ color: "#fca5a5", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {summaryText(c)}
                  </span>
                  {onOpenPdf && (
                    <button
                      className="msv-action-btn"
                      title="Open PDF"
                      onClick={() => onOpenPdf(c)}
                      style={{ flexShrink: 0 }}
                    >
                      <FiEye size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {(unreadable.length > 0 || skipped.length > 0 || errored.length > 0) && (
              <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {unreadable.length > 0 && <div>{unreadable.length} PDF{unreadable.length === 1 ? "" : "s"} could not be read.</div>}
                {skipped.length > 0 && <div>{skipped.length} skipped (not submitted / no attachment).</div>}
                {errored.length > 0 && <div>{errored.length} could not be checked (fetch error).</div>}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button className="msv-cancel-btn" onClick={() => onResolve(false)}>
                Cancel grading
              </button>
              <button className="ma-send-btn" onClick={() => onResolve(true)}>
                Grade anyway
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
