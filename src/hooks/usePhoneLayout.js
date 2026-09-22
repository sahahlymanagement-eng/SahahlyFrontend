import { useSyncExternalStore } from "react";

const query = "(max-width: 767px)";
const subscribe = (notify) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const getSnapshot = () => window.matchMedia(query).matches;

/** Keep phone-only interactions out of the existing tablet/desktop workflow. */
export default function usePhoneLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
