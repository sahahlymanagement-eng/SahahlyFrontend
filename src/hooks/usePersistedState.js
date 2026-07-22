import { useEffect, useState } from "react";

// sessionStorage-backed useState. Persists across tab switches and page
// reloads within the same browser session; auto-clears when the tab closes
// (or on login/logout via clearPersistedUiState). Same [value, setValue]
// signature as useState, so it's a drop-in replacement.
const PREFIX = "sah-ui:";

function read(key, fallback) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export default function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() =>
    read(key, typeof initialValue === "function" ? initialValue() : initialValue)
  );

  useEffect(() => {
    try {
      if (value === undefined) sessionStorage.removeItem(PREFIX + key);
      else sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* quota / serialization — ignore, non-critical UI state */
    }
  }, [key, value]);

  return [value, setValue];
}

// Imperative accessors for cases that don't fit the useState shape
// (e.g. remember a value on mount, clear it on an explicit "back" action).
export function readPersisted(key, fallback = null) {
  return read(key, fallback);
}

export function writePersisted(key, value) {
  try {
    if (value === undefined || value === null) sessionStorage.removeItem(PREFIX + key);
    else sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function removePersisted(key) {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

// Call on login/logout so one user's in-progress state never bleeds into another's.
export function clearPersistedUiState() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
