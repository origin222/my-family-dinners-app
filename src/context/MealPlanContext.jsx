// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  // Core plan persisted locally
  const [plan, setPlan] = useLocalStorage('meal-plan', {
    weekStart: null,
    days: {} // e.g., { '2025-10-23': [{ id, title, notes }] }
  });

  // Recipes map: id -> { id,title,ingredients,steps }
  const [recipes, setRecipes] = useLocalStorage('recipes', {});

  // Archived plans list
  const [archivedPlans, setArchivedPlans] = useLocalStorage('archived-plans', []);

  // Helpers
  function addRecipe(recipe) {
    if (!recipe?.id) return;
    setRecipes(prev => ({ ...prev, [recipe.id]: recipe }));
  }

  function archiveCurrentPlan() {
    setArchivedPlans(prev => [
      { id: String(Date.now()), plan, archivedAt: new Date().toISOString() },
      ...prev
    ]);
    // Reset plan after archiving (optional)
    setPlan({ weekStart: null, days: {} });
  }

  const value = useMemo(() => ({
    plan, setPlan,
    recipes, setRecipes, addRecipe,
    archivedPlans, setArchivedPlans, archiveCurrentPlan
  }), [plan, recipes, archivedPlans]);

  return <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>;
}

export function useMealPlan() {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error('useMealPlan must be used within MealPlanProvider');
  return ctx;
}
