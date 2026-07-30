import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import { toast } from "react-toastify";
import api from "../api/api";
import {
  canGradeProvider,
  getDelegatedProviders,
  setDelegatedProviders,
} from "../utils/gradingAccess";

// One entry per external grading company. Each has its own backend collection and
// its own counts, so they are polled and badged independently. LoginCSS keeps its
// original /external-grading routes; newer companies sit on /grading/:provider.
const GRADING_PROVIDERS = [
  { slug: "logincss", label: "LoginCSS", base: "/external-grading" },
  { slug: "mariamgabalawy", label: "Mariam Gabalawy", base: "/grading/mariamgabalawy" },
  // Second teacher on the same platform as Mariam Gabalawy, separated by the
  // webhook key the partner sends — so his counts are genuinely independent.
  { slug: "drpeter", label: "Dr Peter", base: "/grading/drpeter" },
];

const emptyCounts = () =>
  Object.fromEntries(
    GRADING_PROVIDERS.map((p) => [p.slug, { ungradedTotal: 0, pendingTotal: 0 }])
  );

const GradingNotificationContext = createContext({
  counts: emptyCounts(),
  refresh: () => {},
});

// Deliberately a SECOND context rather than two more keys on the one above.
// The counts change every poll; the delegation grant is fetched once and then
// never moves. The partner tabs (GradingProviderPage, ManagerLoginCss) need
// only the grant — putting it on the counts context would re-render those
// 3,000-line pages every 60 seconds, mid-marking and with modals open.
//
// { [slug]: "manager" | "assistant" }, and `delegationsLoaded` false until the
// fetch settles: before that, "no access" and "not fetched yet" look identical,
// so nothing may bounce a user on it.
const GradingDelegationContext = createContext({
  delegations: {},
  delegationsLoaded: false,
});

const POLL_MS = 60000;

// A submission is "published/graded" once the grade is pushed back to the partner
// (marked) or our annotated feedback PDF has been uploaded (hasFeedbackPdf). Everything
// else — new, failed, or AI-graded drafts not yet uploaded — is still outstanding.
const isPublished = (s) => s?.marked === true || s?.hasFeedbackPdf === true;

// Page through a provider's submissions list (mirrors the tabs' loadAll) and count the
// submissions still outstanding, so the badge matches what the tab actually shows.
async function countOutstanding(base) {
  const collected = [];
  let p = 1;
  let tp = 1;
  do {
    const res = await api.get(`${base}/submissions`, { params: { page: p, per_page: 50 } });
    const body = res.data || {};
    const items =
      body.data ||
      body.submissions ||
      body.items ||
      body.results ||
      body.rows ||
      (Array.isArray(body) ? body : []);
    const meta = body.meta || body.pagination || body;
    const totalCount = meta.total ?? meta.totalItems ?? meta.count ?? items.length;
    tp =
      meta.totalPages ??
      meta.total_pages ??
      meta.last_page ??
      (meta.per_page ? Math.ceil(totalCount / meta.per_page) : 1);
    for (const raw of items) collected.push(raw);
    p += 1;
  } while (p <= tp && p <= 100);

  return collected.filter((s) => !isPublished(s)).length;
}

export function GradingNotificationProvider({ children }) {
  const [counts, setCounts] = useState(emptyCounts);

  // Partner tabs the director delegated work in to this account. Seeded from the
  // last-known grant so a reload doesn't blank a delegate's sidebar, then
  // refreshed once per mount. `delegationsLoaded` is what tells the partner
  // pages it is finally safe to bounce someone who has no access — before it
  // flips, "no access" is indistinguishable from "not fetched yet".
  const [delegations, setDelegations] = useState(getDelegatedProviders);
  const [delegationsLoaded, setDelegationsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/grading-delegations/providers")
      .then((res) => {
        if (cancelled) return;
        const map = Object.fromEntries(
          (res.data?.providers || []).map((p) => [p.slug, p.role])
        );
        // Write through to the module cache first: canGradeProvider() reads it
        // synchronously, and the setState below is what re-renders the callers.
        setDelegatedProviders(map);
        setDelegations(map);
      })
      .catch(() => {
        // No delegations resolvable (offline, or an account the endpoint has
        // nothing for) — fall back to the static allow-list alone.
        if (!cancelled) {
          setDelegatedProviders({});
          setDelegations({});
        }
      })
      .finally(() => {
        if (!cancelled) setDelegationsLoaded(true);
      });

    return () => { cancelled = true; };
  }, []);

  // Only the partners this account may actually open — polling one it cannot see
  // would 403 quietly and, worse, toast it about arrivals in someone else's tab.
  //
  // Keyed on the SLUG LIST rather than on `delegations` itself. The grant fetch
  // resolves on every mount and calls setDelegations with a fresh object even
  // when nothing changed (`{}` for every account holding no delegations, which
  // is most of them). Keying on the object would hand `providers` a new identity
  // each time, which recreates `refresh` and restarts the effect below — a
  // second full poll sweep on every page load, racing the first. The string is
  // equal whenever the visible partners are, so the poll only restarts when a
  // delegation genuinely adds or removes a tab.
  const visibleSlugs = GRADING_PROVIDERS
    .filter((p) => canGradeProvider(p.slug, delegations))
    .map((p) => p.slug)
    .join(",");

  const providers = useMemo(
    () => GRADING_PROVIDERS.filter((p) => visibleSlugs.split(",").includes(p.slug)),
    [visibleSlugs]
  );
  // Previous ungraded count per provider, to detect arrivals between polls.
  // null until the first poll seeds it, so a standing backlog doesn't toast on load.
  const prevUngraded = useRef({});

  const refresh = useCallback(async () => {
    if (!providers.length) return;
    await Promise.all(
      providers.map(async ({ slug, label, base }) => {
        try {
          const next = await countOutstanding(base);
          setCounts((prev) => ({
            ...prev,
            [slug]: { ungradedTotal: next, pendingTotal: next },
          }));
          const prev = prevUngraded.current[slug] ?? null;
          if (prev !== null && next > prev) {
            toast.info(`New ${label} submission pending grading`);
          }
          prevUngraded.current[slug] = next;
        } catch {
          /* badge is non-critical — stay silent on errors */
        }
      })
    );
  }, [providers]);

  useEffect(() => {
    if (!providers.length) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [providers, refresh]);

  const notificationValue = useMemo(
    () => ({ counts, refresh }),
    [counts, refresh]
  );

  const delegationValue = useMemo(
    () => ({ delegations, delegationsLoaded }),
    [delegations, delegationsLoaded]
  );

  return (
    <GradingDelegationContext.Provider value={delegationValue}>
      <GradingNotificationContext.Provider value={notificationValue}>
        {children}
      </GradingNotificationContext.Provider>
    </GradingDelegationContext.Provider>
  );
}

/** Unread counts per partner, and a manual re-poll. Changes every poll. */
export function useGradingNotifications() {
  return useContext(GradingNotificationContext);
}

/**
 * The director-delegated partner grant for this account. Settles once per mount
 * and then holds still — subscribe to this rather than to the counts if the
 * counts are not what you need.
 */
export function useGradingDelegations() {
  return useContext(GradingDelegationContext);
}
