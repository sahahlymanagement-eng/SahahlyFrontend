import { getRoleName } from "./authRoutes";

/** Director + admin only — money/cost must not appear for any other account. */
const MONEY_VIEW_ROLES = new Set(["director", "admin"]);

export const MONEY_FIELD_KEYS = new Set([
  "estimatedCost",
  "estimatedCostUsd",
  "estimatedCostEgp",
  "aggregateEstimatedCost",
  "costUsd",
  "costEgp",
  "grandCostUsd",
  "grandCostEgp",
  "costPerPaper",
  "batchPricing",
  "priorityPricing",
]);

export function canViewMoneyCosts(userOrRole) {
  const role =
    typeof userOrRole === "string" ? userOrRole.trim().toLowerCase() : getRoleName(userOrRole);
  return MONEY_VIEW_ROLES.has(role);
}

export function canViewMoneyCostsFromStorage() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return false;
    return canViewMoneyCosts(JSON.parse(raw));
  } catch {
    return false;
  }
}

export function stripMoneyFields(value, depth = 0) {
  if (value == null || depth > 10) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripMoneyFields(item, depth + 1));
  }
  if (typeof value !== "object") return value;

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (MONEY_FIELD_KEYS.has(key)) continue;
    out[key] = stripMoneyFields(nested, depth + 1);
  }
  return out;
}

/** Strip cost fields unless the current user is director/admin. */
export function maybeStripMoney(payload) {
  if (canViewMoneyCostsFromStorage()) return payload;
  return stripMoneyFields(payload);
}
