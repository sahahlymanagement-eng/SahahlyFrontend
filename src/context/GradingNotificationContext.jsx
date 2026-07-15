import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import { toast } from "react-toastify";
import api from "../api/api";
import { isGradingManager } from "../utils/gradingAccess";

// One entry per external grading company. Each has its own backend collection and
// its own counts, so they are polled and badged independently. LoginCSS keeps its
// original /external-grading routes; newer companies sit on /grading/:provider.
const GRADING_PROVIDERS = [
  { slug: "logincss", label: "LoginCSS", base: "/external-grading" },
  { slug: "mariamgabalawy", label: "Mariam Gabalawy", base: "/grading/mariamgabalawy" },
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

export function GradingNotificationProvider({ children }) {
  const [counts, setCounts] = useState(emptyCounts);
  const enabled = useRef(isGradingManager());
  // Previous ungraded count per provider, to detect arrivals between polls.
  // null until the first poll seeds it, so a standing backlog doesn't toast on load.
  const prevUngraded = useRef({});

  const refresh = useCallback(async () => {
    if (!enabled.current) return;
    await Promise.all(
      GRADING_PROVIDERS.map(async ({ slug, label, base }) => {
        try {
          const res = await api.get(`${base}/notifications`);
          const next = res.data?.ungradedTotal ?? 0;
          setCounts((prev) => ({
            ...prev,
            [slug]: { ungradedTotal: next, pendingTotal: res.data?.pendingTotal ?? 0 },
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
  }, []);

  useEffect(() => {
    if (!enabled.current) return;
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
  }, [refresh]);

  return (
    <GradingNotificationContext.Provider value={{ counts, refresh }}>
      {children}
    </GradingNotificationContext.Provider>
  );
}

export function useGradingNotifications() {
  return useContext(GradingNotificationContext);
}
