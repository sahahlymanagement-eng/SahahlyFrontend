import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
} from "react";
import api from "../api/api";

const LoginCssNotificationContext = createContext({
  newCount: 0,
  pendingTotal: 0,
  refresh: () => {},
  markSeen: () => {},
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
  const [newCount, setNewCount] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const enabled = useRef(isLoginCssManager());

  const refresh = useCallback(async () => {
    if (!enabled.current) return;
    try {
      const res = await api.get("/external-grading/notifications");
      setNewCount(res.data?.newCount ?? 0);
      setPendingTotal(res.data?.pendingTotal ?? 0);
    } catch {
      /* badge is non-critical — stay silent on errors */
    }
  }, []);

  const markSeen = useCallback(async () => {
    if (!enabled.current) return;
    setNewCount(0); // optimistic — clear immediately
    try {
      await api.post("/external-grading/notifications/seen");
    } catch {
      refresh(); // reconcile if the call failed
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled.current) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <LoginCssNotificationContext.Provider
      value={{ newCount, pendingTotal, refresh, markSeen }}
    >
      {children}
    </LoginCssNotificationContext.Provider>
  );
}

export function useLoginCssNotifications() {
  return useContext(LoginCssNotificationContext);
}
