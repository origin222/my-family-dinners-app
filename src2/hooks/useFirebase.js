import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection } from 'firebase/firestore';

const VERCEL_APP_ID = import.meta.env.VITE_APP_ID;
const VERCEL_FIREBASE_CONFIG_STRING = import.meta.env.VITE_FIREBASE_CONFIG;
const appId = VERCEL_APP_ID || 'default-app-id';

// Firestore Collection Constants
const MEAL_PLAN_DOC_ID = 'current_plan';
const FAVORITES_COLLECTION_NAME = 'favorites';
const SHARED_PLANS_COLLECTION_NAME = 'public/data/shared_plans';

export const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false);
    const [error, setError] = useState(null);
    const [planData, setPlanData] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [view, setView] = useState('planning');
    const [query, setQuery] = useState('');
    const [detailedRecipe, setDetailedRecipe] = useState(null);

    useEffect(() => {
        const configString = VERCEL_FIREBASE_CONFIG_STRING;
        if (!configString) {
            setError("Firebase config is missing. Check Vercel environment variables.");
            return;
        };
        try {
            const firebaseConfig = JSON.parse(configString);
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);
            setIsFirebaseInitialized(true);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) { setUserId(user.uid); } 
                else { await signInAnonymously(authInstance); setUserId(authInstance.currentUser?.uid || crypto.randomUUID()); }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (e) { console.error("Firebase Initialization Error:", e); setError(`Failed to initialize Firebase: ${e.message}`); }
    }, []);

    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;
        
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPlanData(data);
                setView(currentView => {
                    if (!['shopping', 'timing', 'detail', 'favorites', 'public', 'share'].includes(currentView)) {
                        return 'review';
                    }
                    return currentView;
                });
                if (!query) setQuery(data.initialQuery || '');
            } else {
                setPlanData(null);
                setView('planning');
                setDetailedRecipe(null);
            }
        }, (e) => { console.error("Firestore Snapshot Error:", e); setError("Could not connect to the database."); });
        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;
        const favoritesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME);
        const unsubscribe = onSnapshot(favoritesCollectionRef, (snapshot) => {
            const favoriteList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFavorites(favoriteList);
        }, (e) => { console.error("Favorites Snapshot Error:", e); setError("Could not load saved favorites."); });
        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    return { db, userId, isAuthReady, isFirebaseInitialized, error, planData, favorites, view, setView, query, setQuery, detailedRecipe, setDetailedRecipe };
};