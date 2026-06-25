/** Gemini pricing mirrors backend/src/utils/geminiModels.js */
export const MARKING_GEMINI_PRICING = [
  { id: "gemini-3.1-flash-lite", inputPer1M: 0.25, outputPer1M: 1.5 },
  { id: "gemini-2.5-flash-lite", inputPer1M: 0.1, outputPer1M: 0.4 },
  { id: "gemini-3-flash-preview", inputPer1M: 0.5, outputPer1M: 3.0 },
  { id: "gemini-3.5-flash", inputPer1M: 1.5, outputPer1M: 9.0, cachedInputPer1M: 0.15 },
];

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export let USD_TO_EGP_RATE = 50;
export let CACHED_INPUT_RATE_FACTOR = 0.25;
export let BATCH_RATE_FACTOR = 0.5;
export let PRIORITY_RATE_FACTOR = 1.85;

export function setUsdToEgpRate(rate) {
  const n = Number(rate);
  if (Number.isFinite(n) && n > 0) USD_TO_EGP_RATE = n;
}

export function setCachedInputRateFactor(factor) {
  const n = Number(factor);
  if (Number.isFinite(n) && n > 0) CACHED_INPUT_RATE_FACTOR = n;
}

export function setBatchRateFactor(factor) {
  const n = Number(factor);
  if (Number.isFinite(n) && n > 0) BATCH_RATE_FACTOR = n;
}

export function setPriorityRateFactor(factor) {
  const n = Number(factor);
  if (Number.isFinite(n) && n > 0) PRIORITY_RATE_FACTOR = n;
}

export function parseGeminiModelsResponse(data) {
  if (Array.isArray(data)) {
    return {
      models: data,
      usdToEgpRate: USD_TO_EGP_RATE,
      cachedInputRateFactor: CACHED_INPUT_RATE_FACTOR,
      batchRateFactor: BATCH_RATE_FACTOR,
      priorityRateFactor: PRIORITY_RATE_FACTOR,
    };
  }
  const models = data?.models || [];
  if (data?.usdToEgpRate) setUsdToEgpRate(data.usdToEgpRate);
  if (data?.cachedInputRateFactor) setCachedInputRateFactor(data.cachedInputRateFactor);
  if (data?.batchRateFactor) setBatchRateFactor(data.batchRateFactor);
  if (data?.priorityRateFactor) setPriorityRateFactor(data.priorityRateFactor);
  return {
    models,
    usdToEgpRate: USD_TO_EGP_RATE,
    cachedInputRateFactor: CACHED_INPUT_RATE_FACTOR,
    batchRateFactor: BATCH_RATE_FACTOR,
    priorityRateFactor: PRIORITY_RATE_FACTOR,
  };
}

/** Keep dropdown value aligned with backend-allowed model ids (prevents 400 on submit). */
export function pickValidGeminiModel(models, current) {
  const fallback = DEFAULT_GEMINI_MODEL;
  if (!Array.isArray(models) || !models.length) {
    return (current && String(current).trim()) || fallback;
  }
  const ids = models.map((m) => m.id);
  if (current && ids.includes(current)) return current;
  if (ids.includes(fallback)) return fallback;
  return ids[0];
}

export function geminiModelLabel(models, modelId) {
  const match = models?.find((m) => m.id === modelId);
  return match?.label || modelId || DEFAULT_GEMINI_MODEL;
}

function cachedInputPer1M(meta) {
  return meta.cachedInputPer1M != null
    ? meta.cachedInputPer1M
    : meta.inputPer1M * CACHED_INPUT_RATE_FACTOR;
}

export function estimateMarkingCost(modelId, tokenUsage, options = {}) {
  if (!tokenUsage) return null;
  const meta =
    MARKING_GEMINI_PRICING.find((m) => m.id === modelId) ||
    MARKING_GEMINI_PRICING.find((m) => m.id === DEFAULT_GEMINI_MODEL);
  if (!meta) return null;

  const batch = Boolean(options.batch || tokenUsage.batch);
  const priority = Boolean(options.priority || tokenUsage.priority);

  const prompt = Number(tokenUsage.inputTokens) || 0;
  const cached = Number(tokenUsage.cachedContentTokens) || 0;
  const toolUse = Number(tokenUsage.toolUseTokens) || 0;
  const candidates =
    tokenUsage.candidatesTokens != null
      ? Number(tokenUsage.candidatesTokens) || 0
      : Math.max(0, (Number(tokenUsage.outputTokens) || 0) - (Number(tokenUsage.thoughtsTokens) || 0));
  const thoughts = Number(tokenUsage.thoughtsTokens) || 0;

  const freshInput =
    tokenUsage.freshInputTokens != null
      ? Number(tokenUsage.freshInputTokens) || 0
      : Math.max(0, prompt - cached) + toolUse;

  // Thinking tokens bill at the same rate as visible output.
  const billableOutput = candidates + thoughts;

  const inputCost = (freshInput / 1_000_000) * meta.inputPer1M;
  const cachedCost = (cached / 1_000_000) * cachedInputPer1M(meta);
  const outputCost = (billableOutput / 1_000_000) * meta.outputPer1M;
  let usd = inputCost + cachedCost + outputCost;
  if (batch) usd *= BATCH_RATE_FACTOR;
  else if (priority) usd *= PRIORITY_RATE_FACTOR;

  usd = Math.round(usd * 1_000_000) / 1_000_000;
  const egp = Math.round(usd * USD_TO_EGP_RATE * 100) / 100;
  return { usd, egp, batchPricing: batch || undefined, priorityPricing: priority || undefined };
}

export function resolveMarkingCost(result) {
  if (!result) return null;
  if (result.estimatedCost?.usd != null) return result.estimatedCost;
  if (result.estimatedCostUsd != null) {
    return {
      usd: result.estimatedCostUsd,
      egp: result.estimatedCostEgp ?? result.estimatedCostUsd * USD_TO_EGP_RATE,
      batchPricing: result.batchPricing || result.estimatedCost?.batchPricing,
    };
  }
  const batch =
    result.batchPricing ||
    result.provider === "gemini-batch";
  // Premium only applies when Gemini actually served the request at priority tier.
  const priority =
    !batch &&
    (result.priorityPricing ||
      result.servedServiceTier === "priority");
  return estimateMarkingCost(
    result.geminiModel || DEFAULT_GEMINI_MODEL,
    result.tokenUsage,
    { batch, priority }
  );
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

export function formatBatchPricingNote(cost) {
  if (!cost?.batchPricing) return null;
  const pct = Math.round((1 - BATCH_RATE_FACTOR) * 100);
  return `Batch API pricing (−${pct}%)`;
}

export function formatPriorityPricingNote(cost) {
  if (!cost?.priorityPricing) return null;
  const pct = Math.round((PRIORITY_RATE_FACTOR - 1) * 100);
  return `Priority pricing (+${pct}%)`;
}
