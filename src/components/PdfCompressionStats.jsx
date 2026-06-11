export default function PdfCompressionStats({ pdfCompression }) {
  if (!pdfCompression) return null;

  const { applied, originalSize, optimizedSize, savingsPercent, dpi, method, student, markScheme } =
    pdfCompression;

  return (
    <div className="msv-summary-box" style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        PDF Compression {applied ? "Applied" : "Skipped"}
      </div>

      {applied ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
          <div>
            <span style={{ color: "#94a3b8" }}>Before:</span> {originalSize}
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>After:</span> {optimizedSize}
          </div>
          <div>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>Saved:</span> {savingsPercent}%
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>DPI:</span> {dpi}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          {student?.reason || markScheme?.reason || method || "Compression not applied"}
        </div>
      )}
    </div>
  );
}
