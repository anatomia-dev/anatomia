"use client";

/**
 * lib/theme.ts
 * Theme persistence + subscription. The initial paint comes from the
 * inline script in app/layout.tsx — this hook handles runtime toggles
 * and syncs across tabs via the storage event.
 *
 * Uses useSyncExternalStore to avoid the setState-in-effect pattern.
 * The "external store" is the data-theme attribute on <html>.
 */
import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "anatomia-theme";
const CHANGE_EVENT = "anatomia-theme-change";

/** Read the current theme from the DOM attribute (set by bootstrap script). */
function getThemeSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

/** Server snapshot — always light (matches the default data-theme on <html>). */
function getServerSnapshot(): Theme {
  return "light";
}

/**
 * Subscribe to theme changes from two sources:
 * 1. Same-tab: custom "anatomia-theme-change" event (dispatched by setTheme)
 * 2. Cross-tab: storage event (fired by localStorage changes in other tabs)
 */
function subscribe(callback: () => void): () => void {
  // Same-tab changes
  window.addEventListener(CHANGE_EVENT, callback);
  // Cross-tab changes
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next = e.newValue as Theme | null;
    if (next === "light" || next === "dark") {
      document.documentElement.setAttribute("data-theme", next);
    }
    callback();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const toggle = useCallback(() => {
    const current = getThemeSnapshot();
    setTheme(current === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, toggle };
}
