function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function resolveCompressionDisplay(pdfCompression) {
  const student = pdfCompression.student || {};
  const originalSize =
    pdfCompression.originalSize ??
    student.originalSize ??
    formatBytes(pdfCompression.originalBytes ?? student.originalBytes);
  const optimizedSize =
    pdfCompression.optimizedSize ??
    student.optimizedSize ??
    formatBytes(pdfCompression.optimizedBytes ?? student.optimizedBytes);
  const savingsPercent =
    pdfCompression.savingsPercent ?? student.savingsPercent ?? null;
  const dpi = pdfCompression.dpi ?? student.dpi ?? null;

  return { originalSize, optimizedSize, savingsPercent, dpi };
}

export default function PdfCompressionStats({ pdfCompression }) {
  if (!pdfCompression) return null;

  const { applied, method, student, markScheme } = pdfCompression;
  const { originalSize, optimizedSize, savingsPercent, dpi } =
    resolveCompressionDisplay(pdfCompression);

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
            <span style={{ color: "#94a3b8" }}>Before:</span> {originalSize || "—"}
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>After:</span> {optimizedSize || "—"}
          </div>
          <div>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>Saved:</span>{" "}
            {savingsPercent != null ? `${savingsPercent}%` : "—"}
          </div>
          <div>
            <span style={{ color: "#94a3b8" }}>DPI:</span> {dpi ?? "—"}
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
