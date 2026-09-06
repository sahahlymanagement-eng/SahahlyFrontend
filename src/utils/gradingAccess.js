/**
 * Who may use the external grading tabs (LoginCSS, Mariam Gabalawy, Dr Peter),
 * and what they are allowed to do inside them.
 *
 * There are two independent grants, and either one opens a tab:
 *
 * 1. THE STATIC ALLOW-LIST (GRADING_ACCOUNTS below) — the original, per-account
 *    grant. Access is per-account, not per-role: the tabs are shared by one
 *    manager and two assistants, so no single role name covers them. The manager
 *    is matched by email (stable, human-readable); the assistants by Person._id
 *    because that is what we were given and it survives an email change.
 *    These accounts do NOT have the same rights — there are three tiers, and an
 *    account's tier is the pair (canMark, canEdit):
 *
 *      canMark + canEdit  — manager01. Every marking process (single, bulk,
 *          priority, batch, prompt generation, mark scheme verification) plus
 *          everything below it.
 *      canEdit only       — the original assistant. Reviews what manager01
 *          produced: opens the results modal, edits marks/feedback/annotations,
 *          confirms, publishes.
 *      neither            — a REVIEW-ONLY reviewer. The results modal shows the
 *          corrected PDF and nothing else: no question editor, no annotating, no
 *          confirm-edits, no unconfirmed-edits autosave. What is left is reading
 *          the PDF and sending it on — Upload to <partner> for one submission,
 *          Publish All for an assignment. Because this tier exists to keep an
 *          account away from the marking itself, it is never overridden by a
 *          director delegation: see canRunGradingMarking below.
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
 * Neither grant covers REPORTING on a partner, which is a third, wider door:
 * canReportOnPartner also lets an org-wide oversight role (director / admin /
 * backup) open the Partner Reports tab without granting it any marking rights.
 *
 * Client-side only — the backend enforces access and scoping on its own. To
 * change who gets what statically, edit GRADING_ACCOUNTS; every call site
 * already routes through the two predicates underneath it.
 */

import { isDirectorLikeRole } from "./directorLikeAccess";

// Person._id of the review-only Mariam Gabalawy reviewer. Kept as a named
// constant because it is filled in after the account is created — the backend's
// scripts/createGradingReviewerAccount.js prints the id to paste here. While it
// still holds the placeholder it matches no signed-in user, so the tier is inert.
const MARIAMGABALAWY_REVIEWER_PERSON_ID = "6a7b0d6841b2c3cf6b6e9360";

// Mariam Gabalawy and Dr Peter are two teachers on the same partner platform.
// A static allow-list grant for either one also opens the other tab (and the
// reverse). Director delegations are NOT paired — those stay assignment-scoped
// per provider so unlocking the sibling tab cannot accidentally unscope the
// whole other queue (see gradingDelegationScope.js).
const PAIRED_PROVIDERS = {
  mariamgabalawy: ["drpeter"],
  drpeter: ["mariamgabalawy"],
};

/** Expand a static provider list with its paired siblings. `null` stays "all". */
function withPairedProviders(providers) {
  if (providers == null) return null;
  const set = new Set(providers);
  for (const slug of providers) {
    for (const other of PAIRED_PROVIDERS[slug] || []) set.add(other);
  }
  return [...set];
}

// `providers: null` means every provider.
// `canEdit` defaults to true when omitted, so leaving it off keeps an account's
// existing rights (see canEditGradingResults).
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
  {
    // Review-only reviewer for Mariam Gabalawy + Dr Peter: reads the corrected
    // PDFs and publishes them back to the partner, and does nothing else.
    // `gradingOnly` also strips the rest of the assistant portal down to these
    // tabs (AssistantSidebar / AssistantLayout / authRoutes).
    //
    // Deliberately holds NO GradingAssignmentDelegation rows: an account with no
    // delegations for a partner is unscoped by the backend and therefore sees
    // every assignment in that partner's tab. Delegating even one assignment to
    // it would narrow it to that assignment — see the backend's
    // services/gradingDelegationScope.js.
    personId: MARIAMGABALAWY_REVIEWER_PERSON_ID,
    providers: ["mariamgabalawy", "drpeter"],
    canMark: false,
    canEdit: false,
    gradingOnly: true,
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

/**
 * The allow-list entry for the signed-in account, or null.
 *
 * @param {object} [forUser] judge this user object instead of the stored session.
 *   Used by the post-login redirect, which knows the user before it is read back
 *   out of localStorage.
 */
function currentGradingAccount(forUser = null) {
  try {
    const user = forUser || JSON.parse(localStorage.getItem("user") || "{}");
    const email = String(user?.email || "").trim().toLowerCase();
    const id = forUser
      ? String(forUser?.id ?? forUser?._id ?? "").trim().toLowerCase()
      : currentPersonId();
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
 * Directors and admins always see Mariam Gabalawy and Dr Peter (org-wide
 * oversight, same as the classroom Submission Viewer). Static allow-list and
 * director delegations still gate managers/assistants.
 *
 * @param {string} slug
 * @param {object} [grant] the delegation grant to judge against. Defaults to the
 *   module cache; React callers pass the one from GradingNotificationContext so
 *   their render is tied to it and re-runs when it resolves.
 */
export function canGradeProvider(slug, grant = delegatedProviders) {
  // Director portal partner tabs — full queue, unscoped on the backend.
  if (
    (slug === "mariamgabalawy" || slug === "drpeter") &&
    isDirectorPartnerOverseer()
  ) {
    return true;
  }
  // A dedicated per-provider role always opens its own tab, even before the
  // director has delegated it a first assignment — the backend already
  // scopes such an account to an empty list in that case (see
  // gradingDelegationScope.js resolveGradingScope), so the tab correctly
  // shows "nothing yet" rather than being unreachable.
  const user = resolveUser();
  if (user?.gradingRole && user?.gradingProvider === slug) return true;
  if (grant?.[slug]) return true;
  const account = currentGradingAccount();
  if (!account) return false;
  const providers = withPairedProviders(account.providers);
  return providers === null || providers.includes(slug);
}

/**
 * Is this account specifically the dedicated "Manager - <slug>" role — not
 * merely someone who canGradeProvider(slug) (which is also true for
 * manager01 and any director-delegated manager). Used to gate UI that only
 * makes sense for the dedicated role, like the "assign assistants to a
 * class" tab: manager01 has no whole-assignment delegation concept to hang
 * that page off of the way a dedicated provider-manager does.
 *
 * @param {string} slug
 * @param {object} [forUser] see currentGradingAccount.
 */
export function isDedicatedProviderManager(slug, forUser = null) {
  const user = resolveUser(forUser);
  return user?.gradingRole === "manager" && user?.gradingProvider === slug;
}

/** Director/admin get the partner tabs (backup does not — separate portal). */
function isDirectorPartnerOverseer(forUser = null) {
  const role = currentRoleName(forUser);
  return role === "director" || role === "admin";
}

/** The signed-in role name, lowercased ("admin", "director", "manager", …). */
function currentRoleName(forUser = null) {
  try {
    const user = forUser || JSON.parse(localStorage.getItem("user") || "{}");
    // Same shapes authRoutes.getRoleName tolerates. Read here rather than
    // imported from there because authRoutes already imports THIS module.
    const raw =
      user?.roleName ?? user?.roleId?.name ?? user?.role?.name ?? user?.role ?? "";
    return String(raw).trim().toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Is this an org-wide oversight account — director / admin / backup?
 *
 * Deliberately the same set as the backend's UNSCOPED_ROLES
 * (services/gradingDelegationScope.js) and the roles /api/report-logos accepts
 * writes from, so what the UI offers matches what the API allows.
 *
 * @param {object} [forUser] judge this user object instead of the stored session.
 */
export function isReportsOverseer(forUser = null) {
  return isDirectorLikeRole(currentRoleName(forUser));
}

/**
 * May this account open the Partner Reports tab for one partner?
 *
 * Wider than canGradeProvider on purpose: reporting on a partner is oversight,
 * not marking. A director is in neither the static allow-list (those are the
 * marking accounts) nor the delegation grant (they are the one handing it out),
 * yet they are exactly who signs off on what goes to parents — and the backend
 * already serves /api/partner-reports and /api/report-logos to those roles,
 * unscoped. Marking rights are untouched: canGradeProvider and
 * canRunGradingMarking still decide who sees a grading tab and who may mark in it.
 *
 * @param {string} slug
 * @param {object} [grant] see canGradeProvider.
 */
export function canReportOnPartner(slug, grant = delegatedProviders) {
  return isReportsOverseer() || canGradeProvider(slug, grant);
}

/**
 * May this account upload or remove a report logo? Mirrors the role gate on
 * POST/DELETE /api/report-logos, so a grading manager sees the partner's logo
 * read-only instead of an upload button that 403s.
 */
export function canManageReportLogos() {
  return isReportsOverseer();
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
  // A review-only account is review-only whatever it is handed: the point of the
  // tier is that this login never runs marking, so a delegation cannot promote it.
  if (isGradingReviewOnly()) return false;
  // Same full marking tools as the director classroom Submission Viewer.
  if (
    isDirectorPartnerOverseer() &&
    (!slug || slug === "mariamgabalawy" || slug === "drpeter")
  ) {
    return true;
  }
  if (currentGradingAccount()?.canMark === true) return true;
  return !!slug && grant?.[slug] === "manager";
}

/**
 * Is this account the review-only tier — corrected PDF and publish, nothing else?
 *
 * @param {object} [forUser] see currentGradingAccount.
 */
export function isGradingReviewOnly(forUser = null) {
  return currentGradingAccount(forUser)?.canEdit === false;
}

/**
 * May this account change a marking result — marks, feedback, the summary, PDF
 * annotations, the paper total, the assignment's page/grade settings?
 *
 * True for everybody except the review-only tier, so no existing account and no
 * director delegation is affected by its introduction. Unlike
 * canRunGradingMarking this takes no slug: the restriction is a property of the
 * account, not of one partner.
 */
export function canEditGradingResults() {
  return !isGradingReviewOnly();
}

/** The signed-in user object, or the one explicitly passed in. */
function resolveUser(forUser) {
  if (forUser) return forUser;
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

/**
 * Is this account confined to its grading tab(s), with the rest of its portal
 * hidden? True for the static allow-list's `gradingOnly` accounts, AND for
 * anyone holding one of the two dedicated per-provider roles (Manager/
 * Assistant - <Provider>, see routes/auth.js publicUser() `gradingRole`) —
 * that confinement is total by design (see gradingOnlyProviders below), not
 * opt-in per account the way the static list is.
 *
 * @param {object} [forUser] see currentGradingAccount.
 */
export function isGradingOnlyAccount(forUser = null) {
  if (currentGradingAccount(forUser)?.gradingOnly === true) return true;
  return !!resolveUser(forUser)?.gradingRole;
}

/**
 * The only partner slugs a grading-only account may reach, in nav order — its
 * landing tab first. Empty for every other account, which is what callers use to
 * tell "confine this login" from "leave it alone".
 *
 * A dedicated per-provider role sees ONLY its own provider — deliberately no
 * `withPairedProviders` expansion (unlike the static allow-list's Mariam
 * Gabalawy ↔ Dr Peter pairing): that pairing exists because those two
 * teachers historically shared one login pattern, which doesn't apply to a
 * role that was created for exactly one named provider.
 *
 * @param {object} [forUser] see currentGradingAccount.
 */
export function gradingOnlyProviders(forUser = null) {
  const account = currentGradingAccount(forUser);
  if (account?.gradingOnly === true) {
    return withPairedProviders(account.providers) || [];
  }
  const user = resolveUser(forUser);
  if (user?.gradingRole && user?.gradingProvider) {
    return [user.gradingProvider];
  }
  return [];
}
