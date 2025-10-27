// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

/**
 * MealPlanContext
 * ----------------
 * - current plan: { weekStart: 'YYYY-MM-DD' | 'MM/DD/YYYY', days: { [isoDate]: [{id,title,notes}] } }
 * - recipes: future-friendly map
 * - archivedPlans: [{ id, plan, archivedAt }]
 *
 * Rules:
 * 1) A week can be archived only once.
 *    We dedupe by normalized weekStart (supports YYYY-MM-DD and MM/DD/YYYY).
 * 2) If weekStart is missing or unreliable, we also dedupe by a "plan content signature"
 *    so the exact same plan content cannot be archived twice.
 * 3) On load, we dedupe any historical duplicates (keep most recent).
 * 4) We emit a browser event 'archive:result' { ok, mode: 'created'|'updated', id } for toasts.
 */

/* ---------------- Date helpers ---------------- */

function toISODate(dateish) {
  if (!dateish) return null;
  if (typeof dateish === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateish)) {
    // Already ISO
    return dateish;
  }
  if (typeof dateish === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateish)) {
    // Handle US format MM/DD/YYYY
    const [m, d, y] = dateish.split("/").map((s) => parseInt(s, 10));
    if (!m || !d || !y) return null;
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  const d = dateish instanceof Date ? dateish : new Date(dateish);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeWeekStart(value) {
  if (!value) return null;
  return toISODate(value);
}

/* --------------- Content signature --------------- */
/** Create a stable signature for the plan content (ignores item ids). */
function planSignature(plan) {
  if (!plan || !plan.days) return "sig:empty";
  const days = plan.days;
  const dayKeys = Object.keys(days).sort();
  const reduced = {};
  for (const k of dayKeys) {
    const meals = Array.isArray(days[k]) ? days[k] : [];
    // Normalize each meal to just essential fields
    const simplified = meals.map((m) => ({
      title: (m?.title || "").trim(),
      notes: (m?.notes || "").trim(),
    }));
    // Keep stable order for signature
    reduced[k] = simplified;
  }
  return "sig:" + JSON.stringify(reduced);
}

/* --------------- Deduping archives --------------- */
/**
 * Deduplicate by:
 *  - Primary key: normalized weekStart (if available)
 *  - Fallback key: plan content signature
 * Keep the most recent by archivedAt.
 */
function dedupeArchives(list) {
  const map = new Map(); // key -> item
  for (const item of list || []) {
    const ws = normalizeWeekStart(item?.plan?.weekStart);
    const key = ws || planSignature(item?.plan);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
    } else {
      const prevTime = new Date(prev.archivedAt || 0).getTime();
      const curTime = new Date(item.archivedAt || 0).getTime();
      map.set(key, curTime >= prevTime ? item : prev);
    }
  }
  const unique = Array.from(map.values());
  unique.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
  return unique;
}

/* ---------------- Context ---------------- */

const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  const [plan, setPlan] = useLocalStorage("meal-plan", {
    weekStart: null,
    days: {},
  });

  const [recipes, setRecipes] = useLocalStorage("recipes", {});

  const [archivedPlans, setArchivedPlans] = useLocalStorage(
    "archived-plans",
    []
  );

  // One-time migration: dedupe any existing duplicates in storage
  useEffect(() => {
    if (!Array.isArray(archivedPlans) || archivedPlans.length <= 1) return;
    const deduped = dedupeArchives(archivedPlans);
    if (deduped.length !== archivedPlans.length) {
      setArchivedPlans(deduped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  /* ---------------- Actions ---------------- */

  function addRecipe(recipe) {
    if (!recipe || !recipe.id) return;
    setRecipes((prev) => ({ ...prev, [recipe.id]: recipe }));
  }

  /**
   * Archive current plan with hard dedupe.
   * - Normalize weekStart (accepts YYYY-MM-DD or MM/DD/YYYY).
   * - If an archive exists for this weekStart, UPDATE that archive.
   * - Else (no weekStart or different), dedupe by plan content signature
   *   so identical content does not create duplicates.
   * Returns { ok, mode: 'created'|'updated', id } or { ok:false, reason }.
   */
  function archiveCurrentPlan() {
    // Prefer normalized weekStart if present:
    const normalizedWS = normalizeWeekStart(plan?.weekStart);
    const sig = planSignature(plan);

    // If absolutely nothing to archive:
    const hasAnyMeals =
      plan && plan.days && Object.values(plan.days).some((arr) => (arr || []).length > 0);
    if (!normalizedWS && !hasAnyMeals) {
      const fail = { ok: false, reason: "no-content" };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("archive:result", { detail: fail }));
      }
      alert("Add meals or set a valid Week Start before archiving.");
      return fail;
    }

    let result = { ok: true, mode: "created", id: "" };

    setArchivedPlans((prev) => {
      const prevList = Array.isArray(prev) ? prev : [];

      // Prefer match by normalized weekStart if available.
      let existingIndex = -1;
      if (normalizedWS) {
        existingIndex = prevList.findIndex(
          (p) => normalizeWeekStart(p?.plan?.weekStart) === normalizedWS
        );
      }

      // If not found by weekStart, try by content signature.
      if (existingIndex === -1) {
        existingIndex = prevList.findIndex(
          (p) => planSignature(p?.plan) === sig
        );
      }

      const newEntry = {
        id:
          existingIndex !== -1
            ? prevList[existingIndex].id
            : String(Date.now()),
        plan: {
          ...plan,
          weekStart: normalizedWS || plan?.weekStart || null,
        },
        archivedAt: new Date().toISOString(),
      };

      let next;
      if (existingIndex !== -1) {
        // Update existing entry (no duplicate)
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

      // Final safety: dedupe
      return dedupeArchives(next);
    });

    // Clear current plan (keeps your original UX)
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
  if (!ctx) {
    throw new Error("useMealPlan must be used within MealPlanProvider");
  }
  return ctx;
}
