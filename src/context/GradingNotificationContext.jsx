import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import { toast } from "react-toastify";
import api from "../api/api";
import { canGradeProvider } from "../utils/gradingAccess";

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
  // Only the partners this account may actually open — polling one it cannot see
  // would 403 quietly and, worse, toast it about arrivals in someone else's tab.
  // Resolved once (lazy initial state) because it depends on the stored user.
  const [providers] = useState(() => GRADING_PROVIDERS.filter((p) => canGradeProvider(p.slug)));
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

  return (
    <GradingNotificationContext.Provider value={{ counts, refresh }}>
      {children}
    </GradingNotificationContext.Provider>
  );
}

export function useGradingNotifications() {
  return useContext(GradingNotificationContext);
}
