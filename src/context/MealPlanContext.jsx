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
 *
 * RULE ENFORCED HERE:
 *   You can archive a given week (identified by `plan.weekStart`) only ONCE.
 *   If you attempt to archive the same week again, we UPDATE the existing archive
 *   entry instead of creating a duplicate.
 */

const MealPlanContext = createContext(null);

// Small helper to ensure weekStart is a YYYY-MM-DD string
function toISODate(d) {
  const date = d instanceof Date ? d : new Date(d || Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
   * Archive the current plan ONLY ONCE per weekStart.
   * Behavior:
   * - If no weekStart: stop and notify.
   * - If an entry with the same weekStart exists: UPDATE that entry (no duplicates).
   * - Else: CREATE a new archive entry.
   * Returns:
   *   { ok: true, mode: 'created' | 'updated', id: string } on success
   *   { ok: false, reason: 'no-week-start' } on failure
   */
  function archiveCurrentPlan() {
    if (!plan || !plan.weekStart) {
      // Friendly guard; UI can also check return value.
      alert("Set a week start before archiving.");
      return { ok: false, reason: "no-week-start" };
    }

    const normalizedWeekStart = toISODate(plan.weekStart);

    const result = { ok: true, mode: "created", id: "" };

    setArchivedPlans((prev) => {
      // Find any existing archive for the same weekStart
      const existingIndex = prev.findIndex(
        (p) => p?.plan?.weekStart === normalizedWeekStart
      );

      const newEntry = {
        id:
          existingIndex !== -1
            ? prev[existingIndex].id // keep the same ID if updating
            : String(Date.now()),
        plan: { ...plan, weekStart: normalizedWeekStart },
        archivedAt: new Date().toISOString(),
      };

      if (existingIndex !== -1) {
        // UPDATE existing archive instead of creating a duplicate
        const next = [...prev];
        next[existingIndex] = newEntry;
        result.mode = "updated";
        result.id = newEntry.id;
        return next;
      }

      // CREATE new archive
      result.mode = "created";
      result.id = newEntry.id;
      return [newEntry, ...prev];
    });

    // After archiving, clear the current plan (matches your original UX)
    setPlan({ weekStart: null, days: {} });

    return result;
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
