import { useEffect, useRef } from "react";
import api from "../api/api";
import { getStoredUser, hasLiveSession, storeSession } from "../utils/session";

/**
 * Keeps the signed-in session rolling.
 *
 * The access token has a fixed lifetime and used to be issued exactly once, at
 * login — so it expired on a wall clock regardless of whether the person was
 * using the site, and the first thing they noticed was pages quietly failing to
 * update. Re-issuing it while they are active makes the TTL an IDLE window
 * instead of a hard session cap.
 *
 * It also resyncs the cached `user`, so a role change or a new grading
 * delegation lands without the person signing out and back in.
 *
 * Mount once, inside the router, above the routes.
 */

/** Re-issue on a timer, so a long-lived tab never drifts into expiry. */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min
/** Floor between focus-triggered refreshes — tab switching must not spam it. */
const MIN_REFRESH_GAP_MS = 5 * 60 * 1000; // 5 min

export default function SessionRefresher() {
  const lastRefreshAt = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async ({ force = false } = {}) => {
      // No live token: either a public page, or expiry already signed them out.
      // Calling /auth/refresh here would 401 and trip a redirect on /login.
      if (!hasLiveSession()) return;
      if (inFlight.current) return;
      if (!force && Date.now() - lastRefreshAt.current < MIN_REFRESH_GAP_MS) return;

      inFlight.current = true;
      try {
        const { data } = await api.post("/auth/refresh");
        if (cancelled || !data?.token) return;
        // Store the user too: this is the only path by which a role changed on
        // the server reaches a browser that is already signed in.
        storeSession(data.token, data.user || getStoredUser());
        lastRefreshAt.current = Date.now();
      } catch {
        // A 401 is already handled globally by the api interceptor (session
        // over -> cleared + redirected). Anything else is transient — offline,
        // a 5xx — and the next tick retries.
      } finally {
        inFlight.current = false;
      }
    };

    // Boot: pick up any role/permission change made since this tab last ran.
    refresh({ force: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const timer = setInterval(() => refresh({ force: true }), REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return null;
}
