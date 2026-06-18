import { formatCostEgp, formatCostUsd, resolveMarkingCost } from "../utils/markingCost";

export default function TokenUsageStats({ result, compact = false, title = "AI Token Usage" }) {
  const tokenUsage = result?.tokenUsage;
  if (!tokenUsage) return null;

  const cost = resolveMarkingCost(result);

  if (compact) {
    return (
      <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>
            <span style={{ color: "#399cf2", fontWeight: 700 }}>In:</span> {tokenUsage.inputTokens}
          </span>
          <span>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>Out:</span> {tokenUsage.outputTokens}
          </span>
          <span>
            <span style={{ color: "#f59e0b", fontWeight: 700 }}>Total:</span> {tokenUsage.totalTokens}
          </span>
        </div>
        {cost && (
          <div style={{ marginTop: 4, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ color: "#a78bfa", fontWeight: 700 }}>Cost:</span>{" "}
            {formatCostUsd(cost.usd)} · {formatCostEgp(cost.egp)}
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
          color: "rgba(255,255,255,0.5)",
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
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#399cf2", fontWeight: 700 }}>Input:</span> {tokenUsage.inputTokens}
        </div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#22c55e", fontWeight: 700 }}>Output:</span> {tokenUsage.outputTokens}
        </div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#f59e0b", fontWeight: 700 }}>Total:</span> {tokenUsage.totalTokens}
        </div>
      </div>

      {cost && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
          <div>
            <span style={{ color: "#a78bfa", fontWeight: 700 }}>Cost (USD):</span> {formatCostUsd(cost.usd)}
          </div>
          <div>
            <span style={{ color: "#c084fc", fontWeight: 700 }}>Cost (EGP):</span> {formatCostEgp(cost.egp)}
          </div>
        </div>
      )}
    </div>
  );
}
