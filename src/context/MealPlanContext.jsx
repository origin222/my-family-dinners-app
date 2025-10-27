// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

/**
 * MealPlanContext
 * ----------------
 * - current plan: { weekStart: 'YYYY-MM-DD', days: { [isoDate]: [{id,title,notes}] } }
 * - recipes: future-friendly map
 * - archivedPlans: [{ id, plan, archivedAt }]
 *
 * Rules:
 * 1) A week can be archived only once (identified by plan.weekStart).
 * 2) If archiving the same week again, we UPDATE the existing archive in place.
 * 3) On load, we dedupe any past duplicates (keep the most recent by archivedAt).
 * 4) Emits window event 'archive:result' with { ok, mode, id } so UI can show toasts.
 */

// --- helpers ---
function toISODate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeWeekStart(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toISODate(value);
}

// Deduplicate archives by normalized weekStart, keep the most recent archivedAt
function dedupeArchives(list) {
  const map = new Map(); // weekStart -> item
  for (const item of list || []) {
    const ws = normalizeWeekStart(item?.plan?.weekStart);
    if (!ws) continue;
    const prev = map.get(ws);
    if (!prev) {
      map.set(ws, item);
    } else {
      const prevTime = new Date(prev.archivedAt || 0).getTime();
      const curTime = new Date(item.archivedAt || 0).getTime();
      map.set(ws, curTime >= prevTime ? item : prev);
    }
  }
  const unique = Array.from(map.values());
  unique.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
  return unique;
}

// --- context ---
const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useLocalStorage("meal-plan", {
    weekStart: null,
    days: {},
  });

  const [recipes, setRecipes] = useLocalStorage("recipes", {});

  const [archivedPlans, setArchivedPlans] = useLocalStorage("archived-plans", []);

  // One-time migration: dedupe any existing duplicates in storage
  useEffect(() => {
    if (!Array.isArray(archivedPlans) || archivedPlans.length <= 1) return;
    const deduped = dedupeArchives(archivedPlans);
    if (deduped.length !== archivedPlans.length) {
      setArchivedPlans(deduped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // ---- actions ----

  function addRecipe(recipe) {
    if (!recipe || !recipe.id) return;
    setRecipes((prev) => ({ ...prev, [recipe.id]: recipe }));
  }

  /**
   * Archive current plan, enforcing "only once per week".
   * If an archive already exists for the same weekStart, we UPDATE that entry.
   * Returns:
   *   { ok: true, mode: 'created'|'updated', id }
   *   { ok: false, reason: 'no-week-start' }
   * Also emits: window.dispatchEvent(new CustomEvent('archive:result', { detail: result }))
   */
  function archiveCurrentPlan() {
    const normalizedWS = normalizeWeekStart(plan?.weekStart);
    if (!normalizedWS) {
      const fail = { ok: false, reason: "no-week-start" };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("archive:result", { detail: fail }));
      }
      alert("Set a valid Week Start before archiving.");
      return fail;
    }

    let result = { ok: true, mode: "created", id: "" };

    setArchivedPlans((prev) => {
      const prevList = Array.isArray(prev) ? prev : [];

      // Find if an entry already exists for this weekStart
      const existingIndex = prevList.findIndex(
        (p) => normalizeWeekStart(p?.plan?.weekStart) === normalizedWS
      );

      const newEntry = {
        id:
          existingIndex !== -1
            ? prevList[existingIndex].id
            : String(Date.now()),
        plan: { ...plan, weekStart: normalizedWS },
        archivedAt: new Date().toISOString(),
      };

      let next;
      if (existingIndex !== -1) {
        // Update existing entry
        next = [...prevList];
        next[existingIndex] = newEntry;
        result.mode = "updated";
        result.id = newEntry.id;
      } else {
        // Create new entry
        next = [newEntry, ...prevList];
        result.mode = "created";
        result.id = newEntry.id;
      }

      // Safety net: dedupe again
      return dedupeArchives(next);
    });

    // Clear current plan (keeps original UX)
    setPlan({ weekStart: null, days: {} });

    // Announce result for toasts
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("archive:result", { detail: result }));
    }

    return result;
  }

  function restoreArchivedPlan(id) {
    setArchivedPlans((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) {
        setPlan(found.plan);
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
  if (!ctx) throw new Error("useMealPlan must be used within MealPlanProvider");
  return ctx;
}
