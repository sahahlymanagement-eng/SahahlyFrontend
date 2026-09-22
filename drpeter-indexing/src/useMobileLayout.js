import { useSyncExternalStore } from 'react';

const query = '(max-width: 767px)';
const subscribe = (listener) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

// Keep alternate phone workflows out of the existing desktop component tree.
export default function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
