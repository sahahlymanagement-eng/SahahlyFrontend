import { useCallback, useSyncExternalStore } from "react";

const supportsMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 * Uses useSyncExternalStore so it stays in sync with the browser without
 * setState-in-effect cascades. SSR-safe (returns false on the server).
 *
 * @param {string} query - e.g. "(max-width: 1024px)"
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (!supportsMatchMedia()) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = () =>
    supportsMatchMedia() ? window.matchMedia(query).matches : false;

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * True when the viewport is narrow enough that the sidebar should become an
 * off-canvas drawer (tablets and phones). Matches the ≤1024px breakpoint
 * convention documented in src/styles/ui-polish.css.
 *
 * @returns {boolean}
 */
export function useIsMobileNav() {
  return useMediaQuery("(max-width: 1024px)");
}
