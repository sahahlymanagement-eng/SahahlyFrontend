import { FiX, FiRefreshCw, FiEye } from "react-icons/fi";

// Advisory pre-grading page-count report modal. Driven by usePageCountCheck.
//
// Three outcomes, resolved as a decision object (see usePageCountCheck.js):
//   Cancel grading                    → { proceed: false }
//   Grade remaining without them (N)  → { proceed: true, excludedIds: [...flagged] }
//   Grade anyway                      → { proceed: true, excludedIds: [] }
//
// "Grade remaining without them" is hidden when every checked submission is
// flagged — excluding them all would grade nothing, which Cancel already does.
export default function PageCountCheckModal({ state, onResolve, onOpenPdf }) {
  if (!state) return null;

  const report = state.report;
  const checked = report?.checked || [];
  const flagged = checked.filter((c) => c.flagged);
  const scanFlagged = checked.filter((c) => c.scanQuality?.flagged);
  const unreadable = checked.filter((c) => c.unreadable);
  const skipped = report?.skipped || [];
  const errored = report?.errored || [];
  const excludedIds = flagged.map((c) => c.submissionId);
  const remaining = Math.max(0, checked.length - flagged.length);

  // Classroom rows carry a `student` object; grading-partner rows carry at most
  // a `studentName` (their payloads often have no student identity at all, in
  // which case the submission id is the only label available).
  const nameOf = (row) =>
    row.student?.name || row.studentName || row.student?.studentId || row.submissionId || "Unknown";

  const cancel = () => onResolve({ proceed: false, excludedIds: [] });

  return (
    <div
      className="msv-overlay"
      onClick={() => {
        if (!state.loading) cancel();
      }}
    >
      <div
        className="msv-results-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580 }}
      >
        <div className="msv-modal-header">
          <div style={{ fontSize: 15, fontWeight: 700 }}>📄 Page-Count Check</div>
          {!state.loading && (
            <button className="msv-icon-btn" onClick={cancel}>
              <FiX />
            </button>
          )}
        </div>

        {state.loading ? (
          <div style={{ padding: "30px 20px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            <FiRefreshCw size={18} className="msv-spin" style={{ verticalAlign: -3, marginRight: 8 }} />
            Counting submission pages before grading…
          </div>
        ) : (
          <div style={{ padding: "16px 20px" }}>
            {scanFlagged.length > 0 && (
              <div style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.5, marginBottom: 14 }}>
                📷 {scanFlagged.length} submission{scanFlagged.length === 1 ? "" : "s"} look like phone-scan
                PDFs (e.g. CamScanner). Ticks and handwriting may be misread — review before grading.
              </div>
            )}
            {flagged.length > 0 && (
            <div style={{ fontSize: 13, color: "#fbbf24", lineHeight: 1.5, marginBottom: 14 }}>
              ⚠️ {report.flaggedCount} submission{report.flaggedCount === 1 ? "" : "s"} differ from the expected{" "}
              {report.expectedPages != null
                ? `${report.expectedPages} page${report.expectedPages === 1 ? "" : "s"}`
                : "page count"}
              {" "}by more than {report.threshold} page{report.threshold === 1 ? "" : "s"}. These may be the wrong
              file — grading them will still cost AI tokens. Review before continuing.
            </div>
            )}

            {scanFlagged.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, marginBottom: flagged.length > 0 ? 12 : 0 }}>
                {scanFlagged.map((c) => (
                  <div
                    key={`scan-${c.submissionId}`}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                      padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {nameOf(c)}
                    </span>
                    <span style={{ color: "#fcd34d", whiteSpace: "nowrap" }}>
                      {c.scanQuality?.scanner || "Scan app"} watermark
                    </span>
                  </div>
                ))}
              </div>
            )}

            {flagged.length > 0 && (
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
                      {c.unreadable
                        ? "PDF unreadable"
                        : `${c.actualPages} pg vs ${c.expectedPages} expected (${c.difference > 0 ? "+" : ""}${c.difference})`}
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
            )}

            {(flagged.length === 0 && scanFlagged.length === 0) && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>
                No page-count mismatches or scan-app watermarks were detected in the checked submissions.
              </div>
            )}

            {(unreadable.length > 0 || skipped.length > 0 || errored.length > 0) && (
              <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {unreadable.length > 0 && <div>{unreadable.length} PDF{unreadable.length === 1 ? "" : "s"} could not be read (possibly the wrong or corrupt file).</div>}
                {skipped.length > 0 && <div>{skipped.length} skipped (not submitted / no attachment).</div>}
                {errored.length > 0 && <div>{errored.length} could not be checked (fetch error).</div>}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button className="msv-cancel-btn" onClick={cancel}>
                Cancel grading
              </button>
              {remaining > 0 && (
                <button
                  className="msv-action-btn"
                  onClick={() => onResolve({ proceed: true, excludedIds })}
                  style={{ padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500 }}
                  title={`Skip the ${flagged.length} flagged submission${flagged.length === 1 ? "" : "s"} and grade the rest`}
                >
                  Grade remaining without them ({remaining})
                </button>
              )}
              <button className="ma-send-btn" onClick={() => onResolve({ proceed: true, excludedIds: [] })}>
                Grade anyway
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
