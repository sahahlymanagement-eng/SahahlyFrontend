/**
 * Session storage + token-liveness helpers.
 *
 * Everything that decides "is this browser still signed in" lives here, so the
 * axios layer, the route guard and the login page all answer that question the
 * same way. Deliberately free of imports: `api.js` pulls `endSession` in from
 * here, so anything imported here would close a cycle.
 *
 * Background: the session used to be judged purely by the PRESENCE of
 * localStorage("user"). That key is written at login and never removed on
 * expiry, so once the token died the app still rendered as signed in while
 * every request 401'd — pages showed their last state and gated features
 * quietly vanished. The token's own `exp` is the source of truth now.
 */

const TOKEN_KEY = "token";
const USER_KEY = "user";
// Written by gradingAccess.setDelegatedProviders(); cleared with the session so
// a delegate's grant can never outlive the account it was fetched for.
const DELEGATION_CACHE_KEY = "gradingDelegatedProviders";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

/** Persist the token + user returned by /auth/login or /auth/refresh. */
export function storeSession(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* a full or blocked localStorage costs persistence, not the current tab */
  }
}

/** Expiry of a JWT in epoch ms, or null when it carries no readable `exp`. */
export function tokenExpiryMs(token = getToken()) {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    // base64url -> base64, then pad. atob rejects the URL-safe alphabet.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const { exp } = JSON.parse(atob(padded));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Is there a token that has not expired?
 *
 * A token with no readable `exp` counts as live — the server is the authority,
 * and a parse failure here must not sign anyone out on its own.
 *
 * @param {number} [skewMs] treat a token expiring within this many ms as dead.
 */
export function hasLiveSession(skewMs = 0) {
  if (!getToken()) return false;
  const exp = tokenExpiryMs();
  if (exp === null) return true;
  return exp - skewMs > Date.now();
}

/** Drop every trace of the signed-in account from this browser. */
export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(DELEGATION_CACHE_KEY);
  } catch {
    /* nothing further we can do */
  }
}

// One expiry can 401 a dozen in-flight requests at once; only the first of them
// should own the redirect.
let ending = false;

/**
 * End the session and send the browser to the login page.
 *
 * A full page load rather than a router navigate: it is the only way to be sure
 * no component is left holding data or permissions from the dead session.
 */
export function endSession({ expired = true } = {}) {
  if (ending) return;
  ending = true;

  clearSession();

  if (typeof window === "undefined") return;

  // Already on the login screen — clearing storage was the whole job.
  if (window.location.pathname.startsWith("/login")) {
    ending = false;
    return;
  }

  window.location.replace(expired ? "/login?expired=1" : "/login");
}
