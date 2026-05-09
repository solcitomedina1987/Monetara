"use client";

import { useState, useEffect } from "react";

/**
 * Works exactly like useState but persists the value in localStorage.
 *
 * Uses a two-pass render pattern to avoid Next.js SSR hydration mismatches:
 *   - Pass 1 (server + first client render): always uses `defaultValue`
 *   - Pass 2 (after mount, client only): reads localStorage and updates if present
 *
 * Writes back to localStorage on every subsequent state change.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);

  // `hydrated` gates localStorage writes so we don't overwrite stored data
  // with the default value on the very first render.
  const [hydrated, setHydrated] = useState(false);

  // Read from localStorage after mount (client-only, avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        setState(JSON.parse(stored) as T);
      }
    } catch {
      // corrupted or unavailable storage — keep default
    }
    setHydrated(true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Write to localStorage whenever state changes, but only after hydration
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // quota exceeded or private browsing — silently ignore
    }
  }, [key, state, hydrated]);

  return [state, setState];
}
