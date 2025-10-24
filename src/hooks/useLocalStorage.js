// src/hooks/useLocalStorage.js
import { useState, useEffect } from 'react';

/**
 * Persist a simple state value to localStorage.
 * Example: const [plan, setPlan] = useLocalStorage('meal-plan', initialValue)
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}
