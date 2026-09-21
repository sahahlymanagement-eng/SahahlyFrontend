import { useEffect } from "react";

/**
 * Warns before a tab close/refresh/URL-bar navigation while `active` is true.
 * Return All / Publish All only queue what's staged by the time the request
 * that started them resolves — closing the tab mid-run silently drops
 * whatever hasn't been staged yet, with no toast to explain why the count was
 * short. In-app (SPA) navigation isn't a risk here: the staging loop is a
 * plain awaited call, not tied to the component's lifecycle, so it keeps
 * running in the background even if the user clicks to another page.
 */
export function useBeforeUnloadGuard(
  active,
  message = "Still queuing submissions — leaving now will stop before they're all queued."
) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active, message]);
}
