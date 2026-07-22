import { formatBatchPricingNote, formatPriorityPricingNote, formatCostEgp, formatCostUsd, resolveMarkingCost } from "../utils/markingCost";

function tokenLines(tokenUsage) {
  const cached = Number(tokenUsage.cachedContentTokens) || 0;
  const thoughts = Number(tokenUsage.thoughtsTokens) || 0;
  const candidates =
    tokenUsage.candidatesTokens != null
      ? Number(tokenUsage.candidatesTokens) || 0
      : Math.max(0, (Number(tokenUsage.outputTokens) || 0) - thoughts);

  return [
    { key: "input", label: "Input", value: tokenUsage.inputTokens, color: "#399cf2" },
  ]
    .concat(cached > 0 ? [{ key: "cached", label: "Cached", value: cached, color: "#38bdf8" }] : [])
    .concat([
      { key: "output", label: "Output", value: candidates, color: "#22c55e" },
    ])
    .concat(
      thoughts > 0
        ? [{ key: "thinking", label: "Thinking", value: thoughts, color: "#f472b6" }]
        : []
    )
    .concat([
      { key: "total", label: "Total", value: tokenUsage.totalTokens, color: "#f59e0b" },
    ]);
}

export default function TokenUsageStats({
  result,
  compact = false,
  title = "AI Token Usage",
  hideCost = false,
}) {
  const tokenUsage = result?.tokenUsage;
  if (!tokenUsage) return null;

  const cost = resolveMarkingCost(result);
  const batchNote = formatBatchPricingNote(cost);
  const priorityNote = formatPriorityPricingNote(cost);
  const downgraded =
    result?.requestedServiceTier === "priority" &&
    result?.servedServiceTier === "standard";
  const lines = tokenLines(tokenUsage);

  if (compact) {
    return (
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {lines.map((line) => (
            <span key={line.key}>
              <span style={{ color: line.color, fontWeight: 700 }}>{line.label}:</span> {line.value}
            </span>
          ))}
        </div>
        {cost && !hideCost && (
          <div style={{ marginTop: 4, color: "var(--muted)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>Cost:</span>{" "}
            {formatCostUsd(cost.usd)} · {formatCostEgp(cost.egp)}
            {batchNote ? (
              <span style={{ marginLeft: 6, color: "var(--muted)" }}>({batchNote})</span>
            ) : null}
            {priorityNote ? (
              <span style={{ marginLeft: 6, color: "var(--warning)" }}>({priorityNote})</span>
            ) : null}
          </div>
        )}
        {downgraded && (
          <div style={{ marginTop: 4, color: "var(--warning)" }}>
            ⚡ Priority unavailable — ran at standard speed.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="msv-summary-box" style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--muted)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
        {result?.geminiModel ? (
          <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
            ({result.geminiModel})
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {lines.map((line) => (
          <div key={line.key} style={{ fontSize: 13 }}>
            <span style={{ color: line.color, fontWeight: 700 }}>{line.label}:</span> {line.value}
          </div>
        ))}
      </div>

      {cost && !hideCost && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>Cost (USD):</span> {formatCostUsd(cost.usd)}
          </div>
          <div>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>Cost (EGP):</span> {formatCostEgp(cost.egp)}
          </div>
          {batchNote ? (
            <div style={{ color: "var(--muted)" }}>{batchNote}</div>
          ) : null}
          {priorityNote ? (
            <div style={{ color: "var(--warning)" }}>{priorityNote}</div>
          ) : null}
        </div>
      )}
      {downgraded && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--warning)" }}>
          ⚡ Priority unavailable — ran at standard speed.
        </div>
      )}
    </div>
  );
}
