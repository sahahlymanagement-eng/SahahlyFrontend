import { useEffect } from "react";

/**
 * When a secondary report workspace opens on a phone, its active tab can sit
 * outside the horizontally scrollable report rail. Center it once on mount so
 * the current report context is immediately obvious without moving desktop.
 */
export default function useMobileReportTabFocus() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector(".rw-report-surface .ma-report-tab--active")
        ?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
}
