import {
  createContext, useContext, useState, useEffect, useCallback,
} from "react";

/**
 * App-wide light/dark theme.
 *
 * Source of truth is the `data-theme` attribute on <html>, which drives the
 * tokens in styles/theme.css. Resolution order:
 *   1. an explicit choice saved in localStorage("theme")
 *   2. otherwise the OS `prefers-color-scheme`
 *   3. otherwise dark (fallback)
 *
 * A tiny inline script in index.html applies the same resolution before first
 * paint so there is no flash; this provider keeps React in sync and reacts to
 * OS changes while the user has not made an explicit choice.
 */

const STORAGE_KEY = "theme";

export function resolveInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage may be unavailable (private mode) — fall through */
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  }
  return "dark";
}

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(resolveInitialTheme);

  // Keep <html data-theme> and storage in lockstep with state.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Follow the OS while the user hasn't picked a theme explicitly.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e) => {
      let stored = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (stored !== "light" && stored !== "dark") {
        setThemeState(e.matches ? "light" : "dark");
      }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
