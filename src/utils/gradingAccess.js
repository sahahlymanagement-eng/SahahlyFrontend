/**
 * Who may use the external grading tabs (LoginCSS, Mariam Gabalawy, Dr Peter),
 * and what they are allowed to do inside them.
 *
 * Access is per-account, not per-role: the tabs are shared by one manager and one
 * assistant, so no single role name covers them. The manager is matched by email
 * (stable, human-readable); the assistant by Person._id because that is what we
 * were given and it survives an email change.
 *
 * The two accounts do NOT have the same rights. Every marking process — single,
 * bulk, priority, batch, prompt generation, mark scheme verification — belongs to
 * manager01. The assistant account only reviews what manager01 produced: open the
 * results modal, edit it, publish it, and only for the partners listed below.
 *
 * Client-side only — the backend enforces access on its own. To change who gets
 * what, edit GRADING_ACCOUNTS; every call site already routes through the two
 * predicates underneath it.
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

function currentGradingAccount() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const email = String(user?.email || "").trim().toLowerCase();
    // /auth/login returns the person as `id`; tolerate `_id` in case a caller
    // stores the raw document instead.
    const id = String(user?.id ?? user?._id ?? "").trim().toLowerCase();
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
 */
export function canGradeProvider(slug) {
  const account = currentGradingAccount();
  if (!account) return false;
  return account.providers === null || account.providers.includes(slug);
}

/** May this account start a marking run or use the marking setup tools? */
export function canRunGradingMarking() {
  return currentGradingAccount()?.canMark === true;
}
