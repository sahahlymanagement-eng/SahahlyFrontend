const rowInput = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  fontSize: 12,
  boxSizing: "border-box",
  outline: "none",
};

export default function CriteriaGradeEditor({ criteriaGrade, maxTotal, onChange, getScoreColor }) {
  if (!criteriaGrade) return null;

  const total = Number(criteriaGrade.totalMarks) || 0;
  const max = Math.max(1, Number(maxTotal) || Number(criteriaGrade.maxTotalMarks) || 1);
  const color = getScoreColor(total, max);

  const update = (patch) => onChange({ ...criteriaGrade, ...patch });

  const updateRow = (index, patch) => {
    const breakdown = (criteriaGrade.breakdown || []).map((row, i) =>
      i === index ? { ...row, ...patch } : row
    );
    const rowTotal = breakdown.reduce((s, r) => s + (Number(r.marksAwarded) || 0), 0);
    update({ breakdown, totalMarks: rowTotal });
  };

  return (
    <div
      style={{
        padding: "16px 20px",
        background: "color-mix(in srgb, var(--accent) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--accent)",
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Criteria grade (final)
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          type="number"
          min={0}
          max={max}
          value={total}
          onChange={(e) =>
            update({ totalMarks: Math.min(max, Math.max(0, Number(e.target.value) || 0)) })
          }
          style={{
            width: 64,
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${color}`,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
            fontWeight: 800,
            fontSize: 18,
            textAlign: "center",
            outline: "none",
          }}
        />
        <span style={{ color: "var(--muted)" }}>/ {max}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(criteriaGrade.breakdown || []).map((row, i) => {
          const rowColor = getScoreColor(row.marksAwarded, row.maxMarks);
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(120px, 1.4fr) 72px 72px 1fr",
                gap: 8,
                alignItems: "start",
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 8,
              }}
            >
              <input
                type="text"
                value={row.criterion ?? ""}
                onChange={(e) => updateRow(i, { criterion: e.target.value })}
                placeholder="Criterion"
                style={rowInput}
              />
              <input
                type="number"
                min={0}
                max={Number(row.maxMarks) || 999}
                value={Number(row.marksAwarded) || 0}
                onChange={(e) =>
                  updateRow(i, {
                    marksAwarded: Math.min(
                      Number(row.maxMarks) || 999,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  })
                }
                style={{ ...rowInput, borderColor: rowColor, fontWeight: 700 }}
              />
              <input
                type="number"
                min={1}
                value={Number(row.maxMarks) || 1}
                onChange={(e) => {
                  const nextMax = Math.max(1, Number(e.target.value) || 1);
                  updateRow(i, {
                    maxMarks: nextMax,
                    marksAwarded: Math.min(nextMax, Number(row.marksAwarded) || 0),
                  });
                }}
                style={rowInput}
              />
              <textarea
                value={row.reason ?? ""}
                onChange={(e) => updateRow(i, { reason: e.target.value })}
                rows={2}
                placeholder="Criterion feedback"
                style={{ ...rowInput, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--muted)",
            marginBottom: 4,
            textTransform: "uppercase",
          }}
        >
          Criteria summary
        </div>
        <textarea
          value={criteriaGrade.summary ?? ""}
          onChange={(e) => update({ summary: e.target.value })}
          rows={3}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
            boxSizing: "border-box",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}
