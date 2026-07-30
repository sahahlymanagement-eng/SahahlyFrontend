/**
 * Who may use the external grading tabs (LoginCSS, Mariam Gabalawy, Dr Peter),
 * and what they are allowed to do inside them.
 *
 * There are two independent grants, and either one opens a tab:
 *
 * 1. THE STATIC ALLOW-LIST (GRADING_ACCOUNTS below) — the original, per-account
 *    grant. Access is per-account, not per-role: the tabs are shared by one
 *    manager and one assistant, so no single role name covers them. The manager
 *    is matched by email (stable, human-readable); the assistant by Person._id
 *    because that is what we were given and it survives an email change.
 *    These two accounts do NOT have the same rights. Every marking process —
 *    single, bulk, priority, batch, prompt generation, mark scheme verification
 *    — belongs to manager01. The assistant account only reviews what manager01
 *    produced: open the results modal, edit it, publish it.
 *
 * 2. DIRECTOR DELEGATIONS — the director can hand ONE partner assignment to a
 *    manager or an assistant with a deadline (backend model
 *    GradingAssignmentDelegation, director UI DirectorGradingDelegations). A
 *    delegate gets that partner's tab, scoped by the backend to the assignments
 *    they were given, and marking rights only if they were delegated as a
 *    "manager". Because this grant is fetched (GradingNotificationContext)
 *    rather than hard-coded it arrives a moment after mount, so a caller that
 *    bounces an unauthorized user must wait for `delegationsLoaded` from that
 *    context before deciding.
 *
 * Client-side only — the backend enforces access and scoping on its own. To
 * change who gets what statically, edit GRADING_ACCOUNTS; every call site
 * already routes through the two predicates underneath it.
 */

// `providers: null` means every provider.
const GRADING_ACCOUNTS = [
  {
    email: "manager01@manager",
    providers: null,
    canMark: true,
  },
  {
    // Assistant account: Mariam Gabalawy + Dr Peter only, review/publish only.
    personId: "6a6abc72df0dd2a61a15214f",
    providers: ["mariamgabalawy", "drpeter"],
    canMark: false,
  },
];

// Cached delegation grant, so a reload renders a delegate's tabs immediately
// instead of hiding them until the fetch lands. Stamped with the person it was
// fetched for: another account signing in on the same browser must never
// inherit it.
const DELEGATION_CACHE_KEY = "gradingDelegatedProviders";

/** The signed-in Person._id, lowercased, or "" when signed out. */
function currentPersonId() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    // /auth/login returns the person as `id`; tolerate `_id` in case a caller
    // stores the raw document instead.
    return String(user?.id ?? user?._id ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function readCachedDelegations() {
  try {
    const cached = JSON.parse(localStorage.getItem(DELEGATION_CACHE_KEY) || "null");
    if (!cached || cached.personId !== currentPersonId()) return {};
    return cached.providers || {};
  } catch {
    return {};
  }
}

// { [providerSlug]: "manager" | "assistant" }
let delegatedProviders = readCachedDelegations();

/**
 * Record the delegation grant just fetched from the backend. Called by
 * GradingNotificationProvider; the module-level copy is what lets
 * canGradeProvider() stay synchronous for the sidebars.
 */
export function setDelegatedProviders(providersBySlug) {
  delegatedProviders = providersBySlug || {};
  try {
    localStorage.setItem(
      DELEGATION_CACHE_KEY,
      JSON.stringify({ personId: currentPersonId(), providers: delegatedProviders })
    );
  } catch {
    /* a full or blocked localStorage only costs us the warm start */
  }
}

/** The delegation grant currently in effect, keyed by provider slug. */
export function getDelegatedProviders() {
  return delegatedProviders;
}

function currentGradingAccount() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const email = String(user?.email || "").trim().toLowerCase();
    const id = currentPersonId();
    return (
      GRADING_ACCOUNTS.find(
        (account) =>
          (!!email && account.email?.toLowerCase() === email) ||
          (!!id && account.personId?.toLowerCase() === id)
      ) || null
    );
  } catch {
    return null;
  }
}

/**
 * May this account open one specific partner's tab? Also the "can this account
 * see any grading tab at all" test — it is false for every slug otherwise.
 *
 * @param {string} slug
 * @param {object} [grant] the delegation grant to judge against. Defaults to the
 *   module cache; React callers pass the one from GradingNotificationContext so
 *   their render is tied to it and re-runs when it resolves.
 */
export function canGradeProvider(slug, grant = delegatedProviders) {
  if (grant?.[slug]) return true;
  const account = currentGradingAccount();
  if (!account) return false;
  return account.providers === null || account.providers.includes(slug);
}

/**
 * May this account start a marking run or use the marking setup tools?
 *
 * @param {string} [slug] the partner tab being asked about. Required to pick up
 *   a delegation-granted right, since those are per-partner; without it only
 *   the static allow-list is consulted.
 * @param {object} [grant] see canGradeProvider.
 */
export function canRunGradingMarking(slug, grant = delegatedProviders) {
  if (currentGradingAccount()?.canMark === true) return true;
  return !!slug && grant?.[slug] === "manager";
}
