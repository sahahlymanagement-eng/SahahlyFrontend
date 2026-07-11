import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import { toast } from "react-toastify";
import api from "../api/api";

const LoginCssNotificationContext = createContext({
  ungradedTotal: 0,
  pendingTotal: 0,
  refresh: () => {},
});

// Only this account sees LoginCSS today. To enable for all managers later,
// broaden this check (e.g. to a role check) — the rest needs no changes.
function isLoginCssManager() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user?.email?.toLowerCase() === "manager01@manager";
  } catch {
    return false;
  }
}

const POLL_MS = 60000;

export function LoginCssNotificationProvider({ children }) {
  const [ungradedTotal, setUngradedTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const enabled = useRef(isLoginCssManager());
  // Previous ungraded count, to detect arrivals between polls.
  // null until the first poll seeds it, so a standing backlog doesn't toast on load.
  const prevUngraded = useRef(null);

  const refresh = useCallback(async () => {
    if (!enabled.current) return;
    try {
      const res = await api.get("/external-grading/notifications");
      const next = res.data?.ungradedTotal ?? 0;
      setUngradedTotal(next);
      setPendingTotal(res.data?.pendingTotal ?? 0);
      if (prevUngraded.current !== null && next > prevUngraded.current) {
        toast.info("New LoginCSS submission pending grading");
      }
      prevUngraded.current = next;
    } catch {
      /* badge is non-critical — stay silent on errors */
    }
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
    <LoginCssNotificationContext.Provider
      value={{ ungradedTotal, pendingTotal, refresh }}
    >
      {children}
    </LoginCssNotificationContext.Provider>
  );
}

export function useLoginCssNotifications() {
  return useContext(LoginCssNotificationContext);
}
