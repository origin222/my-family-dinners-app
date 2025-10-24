// src/context/MealPlanContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getFirebase } from '../services/firebase';

// simple uid fallback (replace with real auth later)
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
  // Local state (always active)
  const [plan, setPlan] = useLocalStorage('meal-plan', {
    weekStart: null,
    days: {}
  });
  const [recipes, setRecipes] = useLocalStorage('recipes', {});
  const [archivedPlans, setArchivedPlans] = useLocalStorage('archived-plans', []);

  // Cloud state toggles
  const uidRef = useRef(null);
  const cloudReadyRef = useRef(false);

  // Try to load from Firestore once (if configured)
  useEffect(() => {
    (async () => {
      try {
        const { db } = await getFirebase();
        if (!db) return; // no env config => stay local only
        const uid = getUid();
        uidRef.current = uid;

        const { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } =
          await import('firebase/firestore');

        // Load plan
        const planSnap = await getDoc(doc(db, 'users', uid, 'state', 'currentPlan'));
        if (planSnap.exists()) {
          const data = planSnap.data();
          if (data?.plan) setPlan(data.plan);
        } else {
          // seed remote with local so both match
          await setDoc(doc(db, 'users', uid, 'state', 'currentPlan'), { plan });
        }

        // Load recipes
        const rSnap = await getDoc(doc(db, 'users', uid, 'state', 'recipes'));
        if (rSnap.exists()) {
          const data = rSnap.data();
          if (data?.recipes) setRecipes(data.recipes);
        } else {
          await setDoc(doc(db, 'users', uid, 'state', 'recipes'), { recipes });
        }

        // Load recent archives (limit for performance)
        const archQ = query(collection(db, 'users', uid, 'archives'), orderBy('archivedAt', 'desc'), limit(50));
        const archDocs = await getDocs(archQ);
        const loaded = archDocs.docs.map(d => ({ id: d.id, ...d.data() }));
        if (loaded?.length) setArchivedPlans(loaded);

        cloudReadyRef.current = true;
      } catch (e) {
        console.warn('Firestore load skipped/failure:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to Firestore when local plan changes (if cloud is ready)
  useEffect(() => {
    (async () => {
      try {
        if (!cloudReadyRef.current) return;
        const { db } = await getFirebase();
        if (!db) return;
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'users', uidRef.current, 'state', 'currentPlan'), { plan }, { merge: true });
      } catch {}
    })();
  }, [plan]);

  // Save recipes map to Firestore on change
  useEffect(() => {
    (async () => {
      try {
        if (!cloudReadyRef.current) return;
        const { db } = await getFirebase();
        if (!db) return;
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'users', uidRef.current, 'state', 'recipes'), { recipes }, { merge: true });
      } catch {}
    })();
  }, [recipes]);

  function addRecipe(recipe) {
    if (!recipe?.id) return;
    setRecipes(prev => ({ ...prev, [recipe.id]: recipe }));
  }

  async function archiveCurrentPlan() {
    // Update local first
    const entry = { id: String(Date.now()), plan, archivedAt: new Date().toISOString() };
    setArchivedPlans(prev => [entry, ...prev]);
    setPlan({ weekStart: null, days: {} });

    // Try to persist to Firestore (best-effort)
    try {
      const { db } = await getFirebase();
      if (!db) return;
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
