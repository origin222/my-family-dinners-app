// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { db } from '../services/firebase'; // ← reuse the singleton (may be null)

// Very simple anon uid; replace later with real Firebase Auth
function getUid() {
  try {
    const k = 'uid';
    const existing = window.localStorage.getItem(k);
    if (existing) return existing;
    const uid = 'anon_' + Math.random().toString(36).slice(2);
    window.localStorage.setItem(k, uid);
    return uid;
  } catch {
    return 'anon_local';
  }
}

const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  // Local-first state (always works, even without Firebase)
  const [plan, setPlan] = useLocalStorage('meal-plan', {
    weekStart: null,
    days: {}
  });
  const [recipes, setRecipes] = useLocalStorage('recipes', {}); // id -> recipe
  const [archivedPlans, setArchivedPlans] = useLocalStorage('archived-plans', []);

  // Cloud gating
  const uidRef = useRef(null);
  const cloudReadyRef = useRef(false);

  // Initial load from Firestore (best-effort, only if db exists)
  useEffect(() => {
    if (!db) return; // no Firebase config → stay local-only

    (async () => {
      try {
        const uid = getUid();
        uidRef.current = uid;

        const {
          doc, getDoc, setDoc,
          collection, getDocs, query, orderBy, limit
        } = await import('firebase/firestore');

        // Load plan (or seed from local)
        const planRef = doc(db, 'users', uid, 'state', 'currentPlan');
        const planSnap = await getDoc(planRef);
        if (planSnap.exists()) {
          const data = planSnap.data();
          if (data?.plan) setPlan(data.plan);
        } else {
          await setDoc(planRef, { plan });
        }

        // Load recipes (or seed from local)
        const recRef = doc(db, 'users', uid, 'state', 'recipes');
        const recSnap = await getDoc(recRef);
        if (recSnap.exists()) {
          const data = recSnap.data();
          if (data?.recipes) setRecipes(data.recipes);
        } else {
          await setDoc(recRef, { recipes });
        }

        // Load recent archives
        const archQ = query(
          collection(db, 'users', uid, 'archives'),
          orderBy('archivedAt', 'desc'),
          limit(50)
        );
        const archDocs = await getDocs(archQ);
        const loaded = archDocs.docs.map(d => ({ id: d.id, ...d.data() }));
        if (loaded.length) setArchivedPlans(loaded);

        cloudReadyRef.current = true;
      } catch (e) {
        console.warn('Firestore load skipped:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // Save plan to Firestore when it changes (if cloud ready)
  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        if (!cloudReadyRef.current) return;
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'users', uidRef.current, 'state', 'currentPlan'), { plan }, { merge: true });
      } catch {}
    })();
  }, [plan, db]);

  // Save recipes to Firestore when they change
  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        if (!cloudReadyRef.current) return;
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'users', uidRef.current, 'state', 'recipes'), { recipes }, { merge: true });
      } catch {}
    })();
  }, [recipes, db]);

  // Local helpers
  function addRecipe(recipe) {
    if (!recipe?.id) return;
    setRecipes(prev => ({ ...prev, [recipe.id]: recipe }));
  }

  async function archiveCurrentPlan() {
    // Local-first update (always works)
    const entry = { id: String(Date.now()), plan, archivedAt: new Date().toISOString() };
    setArchivedPlans(prev => [entry, ...prev]);
    setPlan({ weekStart: null, days: {} });

    // Best-effort Firestore write
    if (!db) return;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', uidRef.current, 'archives', entry.id), entry);
    } catch {}
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
