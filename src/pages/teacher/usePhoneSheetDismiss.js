import { useEffect } from "react";

const PHONE_SHEET = "(max-width: 700px)";

/**
 * Phone sheets should leave with Escape and should not let the page behind
 * them scroll. Desktop popovers keep their existing pointer dismissal.
 */
export function usePhoneSheetDismiss(active, onClose) {
  useEffect(() => {
    if (!active || !window.matchMedia(PHONE_SHEET).matches) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onClose]);
}
