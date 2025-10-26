// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useMemo } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

/**
 * MealPlanContext
 * ----------------
 * Single source of truth for:
 * - current weekly plan (weekStart + days map)
 * - recipes map (future-friendly)
 * - archived plans list
 *
 * Storage: localStorage (no Firebase required).
 * You can later add Firestore and keep this API the same.
 *
 * NEW: Prevent archiving the same week twice.
 * Rule: A week is uniquely identified by its `weekStart` date (YYYY-MM-DD).
 */

const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  // Current plan: { weekStart: 'YYYY-MM-DD', days: { [isoDate]: [{id,title,notes}] } }
  const [plan, setPlan] = useLocalStorage("meal-plan", {
    weekStart: null,
    days: {},
  });

  // Recipes (kept for future features)
  const [recipes, setRecipes] = useLocalStorage("recipes", {});

  // Archives: array of { id, plan, archivedAt }
  const [archivedPlans, setArchivedPlans] = useLocalStorage(
    "archived-plans",
    []
  );

  // ---- Actions ----

  function addRecipe(recipe) {
    if (!recipe || !recipe.id) return;
    setRecipes((prev) => ({ ...prev, [recipe.id]: recipe }));
  }

  /**
   * Archive the current plan, but only once per weekStart.
   * If an archive with the same weekStart already exists, do nothing and notify.
   */
  function archiveCurrentPlan() {
    if (!plan || !plan.weekStart) {
      alert("Set a week start before archiving.");
      return;
    }

    // Check for an existing archive with the same weekStart
    const alreadyArchived = archivedPlans.some(
      (p) => p?.plan?.weekStart === plan.weekStart
    );

    if (alreadyArchived) {
      alert(
        `This week (${plan.weekStart}) has already been archived. You can only archive a given week once.`
      );
      return;
    }

    const entry = {
      id: String(Date.now()),
      plan,
      archivedAt: new Date().toISOString(),
    };

    setArchivedPlans((prev) => [entry, ...prev]);
    setPlan({ weekStart: null, days: {} });
  }

  function restoreArchivedPlan(id) {
    setArchivedPlans((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) {
        // Put archived plan back as current plan
        setPlan(found.plan);
        // Remove it from archives after restoring (common pattern)
        return prev.filter((p) => p.id !== id);
      }
      return prev;
    });
  }

  function clearAllArchives() {
    const ok = window.confirm(
      "Are you sure you want to delete ALL archived plans? This cannot be undone."
    );
    if (!ok) return;
    setArchivedPlans([]);
  }

  const value = useMemo(
    () => ({
      // state
      plan,
      recipes,
      archivedPlans,
      // setters
      setPlan,
      setRecipes,
      setArchivedPlans,
      // actions
      addRecipe,
      archiveCurrentPlan,
      restoreArchivedPlan,
      clearAllArchives,
    }),
    [plan, recipes, archivedPlans]
  );

  return (
    <MealPlanContext.Provider value={value}>
      {children}
    </MealPlanContext.Provider>
  );
}

export function useMealPlan() {
  const ctx = useContext(MealPlanContext);
  if (!ctx) {
    throw new Error("useMealPlan must be used within MealPlanProvider");
  }
  return ctx;
}
