// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

/**
 * Central store for meal planning state.
 * Keeps selections across refreshes (localStorage).
 */
const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useLocalStorage('meal-plan', {
    weekStart: null,
    days: {}, // e.g., { '2025-10-23': [{ id, title, notes }] }
  });
  const [recipes, setRecipes] = useLocalStorage('recipes', {}); // id -> recipe

  const value = useMemo(() => ({
    plan, setPlan, recipes, setRecipes
  }), [plan, recipes]);

  return <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>;
}

export function useMealPlan() {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error('useMealPlan must be used within MealPlanProvider');
  return ctx;
}
