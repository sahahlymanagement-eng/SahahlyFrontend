/** Gemini pricing mirrors backend/src/utils/geminiModels.js */
export const MARKING_GEMINI_PRICING = [
  { id: "gemini-3.1-flash-lite", inputPer1M: 0.25, outputPer1M: 1.5 },
  { id: "gemini-2.5-flash-lite", inputPer1M: 0.1, outputPer1M: 0.4 },
  { id: "gemini-3-flash-preview", inputPer1M: 0.5, outputPer1M: 3.0 },
];

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export let USD_TO_EGP_RATE = 50;

export function setUsdToEgpRate(rate) {
  const n = Number(rate);
  if (Number.isFinite(n) && n > 0) USD_TO_EGP_RATE = n;
}

export function parseGeminiModelsResponse(data) {
  if (Array.isArray(data)) {
    return { models: data, usdToEgpRate: USD_TO_EGP_RATE };
  }
  const models = data?.models || [];
  if (data?.usdToEgpRate) setUsdToEgpRate(data.usdToEgpRate);
  return { models, usdToEgpRate: USD_TO_EGP_RATE };
}

export function estimateMarkingCost(modelId, tokenUsage) {
  if (!tokenUsage) return null;
  const meta = MARKING_GEMINI_PRICING.find((m) => m.id === modelId) ||
    MARKING_GEMINI_PRICING.find((m) => m.id === DEFAULT_GEMINI_MODEL);
  if (!meta) return null;

  const input = ((Number(tokenUsage.inputTokens) || 0) / 1_000_000) * meta.inputPer1M;
  const output = ((Number(tokenUsage.outputTokens) || 0) / 1_000_000) * meta.outputPer1M;
  const usd = Math.round((input + output) * 1_000_000) / 1_000_000;
  const egp = Math.round(usd * USD_TO_EGP_RATE * 100) / 100;
  return { usd, egp };
}

export function resolveMarkingCost(result) {
  if (!result) return null;
  if (result.estimatedCost?.usd != null) return result.estimatedCost;
  if (result.estimatedCostUsd != null) {
    return {
      usd: result.estimatedCostUsd,
      egp: result.estimatedCostEgp ?? result.estimatedCostUsd * USD_TO_EGP_RATE,
    };
  }
  return estimateMarkingCost(result.geminiModel || DEFAULT_GEMINI_MODEL, result.tokenUsage);
}

export function formatCostUsd(usd) {
  if (usd == null || !Number.isFinite(Number(usd))) return "—";
  const n = Number(usd);
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatCostEgp(egp) {
  if (egp == null || !Number.isFinite(Number(egp))) return "—";
  const n = Number(egp);
  if (n === 0) return "0.00 EGP";
  if (n < 1) return `${n.toFixed(2)} EGP`;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
}

export function formatCostPair(cost) {
  if (!cost) return null;
  return `${formatCostUsd(cost.usd)} · ${formatCostEgp(cost.egp)}`;
}
