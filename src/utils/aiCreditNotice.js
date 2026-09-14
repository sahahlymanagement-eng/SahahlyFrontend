export const CREDIT_MESSAGE = 'AI provider credits are depleted. An administrator needs to top up the provider billing account before AI processing can continue.';
export const CREDIT_EVENT = 'ai-provider-credits-depleted';

// Inspect error metadata only, never student answers or generated document text.
export function hasDepletedCredits(value, errorContext = false, depth = 0) {
  if (depth > 15 || value == null) return false;
  if (typeof value === 'string') return errorContext && /prepayment credits are depleted|insufficient_quota|(?:credits?|balance).{0,35}(?:depleted|exhausted|insufficient)|insufficient.{0,20}(?:credits?|balance)/i.test(value);
  if (Array.isArray(value)) return value.some(v => hasDepletedCredits(v, errorContext, depth + 1));
  if (typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => {
    if (['result', 'markingPack', 'questions', 'content', 'text'].includes(key) && !errorContext) return false;
    return hasDepletedCredits(child, errorContext || /error|failure|message|code|reason/i.test(key), depth + 1);
  });
}

let lastNotice = -Infinity;
export function notifyDepletedCredits(payload) {
  if (!hasDepletedCredits(payload, typeof payload === 'string')) return;
  window.dispatchEvent(new CustomEvent('ai-provider-processing-blocked'));
  const now = Date.now();
  if (now - lastNotice < 60000) return;
  lastNotice = now;
  window.dispatchEvent(new CustomEvent(CREDIT_EVENT));
}
