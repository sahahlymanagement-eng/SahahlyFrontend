import { useEffect } from "react";

let openDialogs = 0;
let originalOverflow;

/** Focus containment, keyboard viewport sizing, and restoration for phone dialogs. */
export default function useMobileDialog(ref, enabled, onClose) {
  useEffect(() => {
    if (!enabled) return undefined;
    const dialog = ref.current?.closest('[role="dialog"]');
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    if (openDialogs++ === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const size = () => dialog.style.setProperty("--msv-phone-height", `${window.visualViewport?.height || window.innerHeight}px`);
    size();
    window.visualViewport?.addEventListener("resize", size);
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const close = dialog.querySelector('[aria-label="Close viewer"]');
    close?.focus({ preventScroll: true });
    const handleKey = (event) => {
      // A nested dialog owns keyboard input while it is open.
      if (event.target.closest('[role="dialog"]') !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); onClose?.(); }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", handleKey);
    return () => {
      window.visualViewport?.removeEventListener("resize", size);
      dialog.removeEventListener("keydown", handleKey);
      dialog.style.removeProperty("--msv-phone-height");
      if (--openDialogs === 0) document.body.style.overflow = originalOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [ref, enabled, onClose]);
}
