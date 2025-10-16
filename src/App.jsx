import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from 'firebase/firestore';

// --- LOCAL IMPORTS ---
import { convertToActualTime, mergeShoppingLists, convertIngredient } from './utils/helpers';
import { ThemeToggle, PlanSkeleton, UnitConverter } from './components/UIComponents';
import { ShoppingView, ReviewView, TimingView, DetailView, FavoritesView } from './components/ViewComponents';


// --- CONFIGURATION ---
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";
const VERCEL_APP_ID = import.meta.env.VITE_APP_ID;
const VERCEL_FIREBASE_CONFIG_STRING = import.meta.env.VITE_FIREBASE_CONFIG;
const GEMINI_API_KEY_ENV = import.meta.env.VITE_GEMINI_API_KEY;
const appId = VERCEL_APP_ID || 'default-app-id';
let firebaseConfig = {};
try {
    if (VERCEL_FIREBASE_CONFIG_STRING) firebaseConfig = JSON.parse(VERCEL_FIREBASE_CONFIG_STRING);
} catch (e) { console.error("Error parsing VITE_FIREBASE_CONFIG JSON:", e); }
const finalGeminiApiKey = GEMINI_API_KEY_ENV || "";

// Firestore Collection Constants
const MEAL_PLAN_DOC_ID = 'current_plan';
const FAVORITES_COLLECTION_NAME = 'favorites';
const SHARED_PLANS_COLLECTION_NAME = 'public/data/shared_plans';

// --- JSON SCHEMAS ---
const PLAN_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "weeklyPlan": { type: "ARRAY", items: { type: "OBJECT", properties: { "day": { "type": "STRING" }, "meal": { "type": "STRING" }, "description": { "type": "STRING" }, "calories": { "type": "STRING" }, "protein": { "type": "STRING" }, "carbs": { "type": "STRING" }, "fats": { "type": "STRING" } } } }, "shoppingList": { type: "ARRAY", items: { type: "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "category": { "type": "STRING" }, "isChecked": { "type": "BOOLEAN" } } } } } };
const RECIPE_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "recipeName": { "type": "STRING" }, "prepTimeMinutes": { "type": "NUMBER" }, "cookTimeMinutes": { "type": "NUMBER" }, "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } }, "timeline": { type: "ARRAY", items: { "type": "OBJECT", "properties": { "minutesBefore": { "type": "NUMBER" }, "action": { "type": "STRING" } } } }, "instructions": { "type": "ARRAY", "items": { "type": "STRING" } } } };
// --- MAIN APP COMPONENT ---
const App = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false);
    const [query, setQuery] = useState('');
    const [view, setView] = useState('planning');
    const [planData, setPlanData] = useState(null);
    const [detailedRecipe, setDetailedRecipe] = useState(null);
    const [selectedMealIndex, setSelectedMealIndex] = useState(null);
    const [mealsToRegenerate, setMealsToRegenerate] = useState([]);
    const [dinnerTime, setDinnerTime] = useState('19:00');
    const [isLoading, setIsLoading] = useState(null);
    const [error, setError] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [regenerationConstraint, setRegenerationConstraint] = useState('');
    const [openShoppingCategory, setOpenShoppingCategory] = useState(null);

    const updateShoppingList = useCallback(async (updatedList) => {
        if (!db || !userId || !planData) return;
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
        try {
            await updateDoc(docRef, { shoppingList: updatedList });
        } catch (e) {
            console.error("Firestore Update Error:", e);
            toast.error("Could not update shopping list.");
        }
    }, [db, userId, planData, appId]);

    const handleSelectMeal = useCallback((index) => { setSelectedMealIndex(index); setDetailedRecipe(null); setView('timing'); }, []);
    const toggleMealSelection = useCallback((index) => { setMealsToRegenerate(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]); }, []);
    const handleStartOver = useCallback(async () => { if (!db || !userId) return; if (window.confirm("Are you sure?")) { const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID); try { await deleteDoc(docRef); toast.success("Plan deleted."); } catch (e) { toast.error("Could not delete plan."); } } }, [db, userId, appId]);
    const handlePrint = useCallback(() => { window.print(); }, []);
    const handleCheckItem = useCallback((index) => { if (!planData) return; const newShoppingList = [...planData.shoppingList]; newShoppingList[index].isChecked = !newShoppingList[index].isChecked; updateShoppingList(newShoppingList); }, [planData, updateShoppingList]);
    const handleClearChecked = useCallback(() => { if (!planData) return; const uncheckedList = planData.shoppingList.filter(item => !item.isChecked); updateShoppingList(uncheckedList); toast.success('Checked items cleared!'); }, [planData, updateShoppingList]);
    const loadFavorite = useCallback(async (favorite) => { setDetailedRecipe(favorite); setDinnerTime(favorite.dinnerTime || '19:00'); setView('detail'); if (favorite.id) { const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, favorite.id); try { await updateDoc(docRef, { lastUsed: new Date().toISOString() }); } catch (e) { console.error("Error updating lastUsed timestamp:", e); } } }, [db, userId, appId]);
    const deleteFavorite = useCallback(async (id, name) => { if (!db || !userId) return; if (window.confirm("Are you sure?")) { const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, id); try { await deleteDoc(docRef); toast.success(`"${name}" deleted.`); } catch (e) { toast.error("Failed to delete."); } } }, [db, userId, appId]);
    const generateShareLink = useCallback(async () => { if (!db || !userId || !planData) return; const shareDocRef = doc(db, 'artifacts', appId, SHARED_PLANS_COLLECTION_NAME, userId); const publicPlanData = { weeklyPlan: planData.weeklyPlan, initialQuery: planData.initialQuery, userId: userId, userName: "A Friend", sharedAt: new Date().toISOString(), }; try { await setDoc(shareDocRef, publicPlanData); const url = `${window.location.origin}/share/${userId}`; toast((t) => ( <div className="flex flex-col gap-2"> <span className="text-sm font-semibold">Shareable link!</span> <div className="flex gap-2"> <input type="text" value={url} readOnly className="input input-bordered input-sm w-full" /> <button className="btn btn-sm btn-primary" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied!', { id: t.id }); }}>Copy</button> </div> </div> ), { duration: 6000 }); } catch (e) { toast.error("Failed to generate link."); } }, [db, userId, planData, appId]);

    const handleToggleFavorite = useCallback(() => {
        if (!detailedRecipe || !db || !userId) return;
        const favoriteInstance = favorites.find(fav => fav.recipeName === detailedRecipe.recipeName);
        if (favoriteInstance) {
            deleteFavorite(favoriteInstance.id, detailedRecipe.recipeName);
        } else {
            const favoritesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME);
            const newFavorite = { ...detailedRecipe, lastUsed: new Date().toISOString(), savedAt: new Date().toISOString(), mealSource: planData?.weeklyPlan[selectedMealIndex]?.meal || detailedRecipe.recipeName };
            setDoc(doc(favoritesCollectionRef), newFavorite)
                .then(() => toast.success(`"${detailedRecipe.recipeName}" saved to favorites!`))
                .catch(() => toast.error("Failed to save favorite."));
        }
    }, [db, userId, detailedRecipe, favorites, planData, selectedMealIndex, appId, deleteFavorite]);

    const retryFetch = useCallback(async (url, options, maxRetries = 5) => { for (let i = 0; i < maxRetries; i++) { try { const response = await fetch(url, options); if (response.status !== 429 && response.status < 500) { return response; } if (i === maxRetries - 1) throw new Error(`API returned status ${response.status}`); const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; await new Promise(resolve => setTimeout(resolve, delay)); } catch (error) { if (i === maxRetries - 1) throw error; const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; await new Promise(resolve => setTimeout(resolve, delay)); } } }, []);
    
    const processPlanGeneration = useCallback(async (isRegeneration = false) => {
        if (!db || !userId) { toast.error("Not connected to the database. Please refresh."); return; }
        if (isLoading) return;
        if (!query.trim() && !isRegeneration) { toast.error("Please enter your family's preferences first."); return; }
        setIsLoading(true);
        setError(null);
        const oldPlan = planData;
        let systemPrompt;
        let userPrompt = "Generate the complete weekly dinner plan and consolidated shopping list.";
        const macroInstruction = "For each meal, you MUST provide an estimated nutritional breakdown including 'calories', 'protein', 'carbs', and 'fats'.";

        if (isRegeneration && oldPlan) {
            const mealsToUpdate = mealsToRegenerate.map(index => oldPlan.weeklyPlan[index].day).join(', ');
            const unchangedMeals = oldPlan.weeklyPlan.filter((_, index) => !mealsToRegenerate.includes(index)).map(meal => `${meal.day}: ${meal.meal} (${meal.description})`).join('; ');
            systemPrompt = `You are updating a meal plan. New meals must follow this constraint: ${regenerationConstraint || 'None'}. Generate NEW meals for: ${mealsToUpdate}. Keep these meals: ${unchangedMeals}. ${macroInstruction}`;
            userPrompt = `Replace meals for ${mealsToUpdate}. Return the full 7-day plan and a new consolidated shopping list.`;
            setRegenerationConstraint('');
        } else {
            systemPrompt = `You are a meal planner. Generate a 7-day dinner plan and shopping list based on: "${query.trim()}". ${macroInstruction}`;
        }
        try {
            const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: PLAN_RESPONSE_SCHEMA } };
            const url = `${API_URL}?key=${finalGeminiApiKey}`;
            const response = await retryFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorBody = await response.json();
                console.error("Gemini API Error Body:", errorBody);
                const errorMessage = errorBody?.error?.message || response.statusText;
                throw new Error(errorMessage);
            }
            const result = await response.json();
            const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonString) { throw new Error("AI response was empty."); }
            const parsedPlan = JSON.parse(jsonString);
            const mergedList = mergeShoppingLists(parsedPlan.shoppingList, oldPlan?.shoppingList);
            const newPlanData = { ...parsedPlan, shoppingList: mergedList, initialQuery: query.trim() };
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
            await setDoc(docRef, newPlanData);
            setView('review');
        } catch (e) {
            console.error("Plan Generation Error:", e);
            toast.error(`Failed to generate plan: ${e.message}`);
        } finally {
            setIsLoading(false);
            setMealsToRegenerate([]);
        }
    }, [db, userId, query, planData, mealsToRegenerate, regenerationConstraint, retryFetch]);

    const generateRecipeDetail = useCallback(async () => {
        if (!db || !userId) { toast.error("Not connected. Please refresh."); return; }
        if (isLoading) return;
        if (selectedMealIndex === null || !planData) { toast.error("Please select a meal first."); return; }
        setIsLoading(true);
        setError(null);
        const meal = planData.weeklyPlan[selectedMealIndex];
        const targetTime = convertToActualTime(dinnerTime, 0);
        const detailQuery = `Generate a full recipe for "${meal.meal}" based on: "${meal.description}". The meal must be ready at ${targetTime}. Provide a timeline using 'minutesBefore' (e.g., 60, 45, 10).`;
        const systemPrompt = "You are a chef. Provide precise recipe details and a reverse-engineered cooking timeline.";
        try {
            const payload = { contents: [{ parts: [{ text: detailQuery }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: RECIPE_RESPONSE_SCHEMA } };
            const url = `${API_URL}?key=${finalGeminiApiKey}`;
            const response = await retryFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorBody = await response.json();
                const errorMessage = errorBody?.error?.message || response.statusText;
                throw new Error(errorMessage);
            }
            const result = await response.json();
            const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonString) { throw new Error("AI response was empty."); }
            const parsedRecipe = JSON.parse(jsonString);
            parsedRecipe.dinnerTime = dinnerTime;
            setDetailedRecipe(parsedRecipe);
            setView('detail');
        } catch (e) {
            console.error("Recipe Generation Error:", e);
            toast.error(`Failed to generate recipe: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [db, userId, planData, selectedMealIndex, dinnerTime, retryFetch]);
	useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            setError("Firebase config is missing. Check Vercel environment variables.");
            return;
        };
        try {
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
                    if (!['shopping', 'timing', 'detail', 'favorites', 'public'].includes(currentView)) {
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
    
    let content;
    const isConnecting = !isFirebaseInitialized || !isAuthReady;
    
    if (isConnecting) {
        content = ( <div className="text-center py-20"> <span className="loading loading-spinner loading-lg text-primary"></span> <p className="mt-4 font-semibold">Connecting...</p> </div> );
    } else if (isLoading) {
        content = view === 'planning' || view === 'review' ? <PlanSkeleton /> : <div className="text-center py-20"><span className="loading loading-dots loading-lg text-primary"></span></div>;
    } else {
        switch (view) {
            case 'planning': 
                content = (
                    <div className="max-w-2xl mx-auto">
                        <div className="bg-base-200 p-6 rounded-box">
                            <div className="form-control w-full">
                                <label className="label">
                                    <span className="label-text text-lg font-bold">Family Preferences & Dietary Needs</span>
                                </label>
                                <textarea
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    rows="3"
                                    placeholder="e.g., Low-carb, no seafood, prioritize chicken..."
                                    className="textarea textarea-bordered h-24 mt-2"
                                />
                            </div>
                            <button onClick={() => processPlanGeneration(false)} className="btn btn-primary w-full mt-6">Generate 7-Day Plan</button>
                        </div>
                    </div>
                ); 
                break;
            case 'review': content = planData ? <ReviewView planData={planData} mealsToRegenerate={mealsToRegenerate} regenerationConstraint={regenerationConstraint} setRegenerationConstraint={setRegenerationConstraint} processPlanGeneration={processPlanGeneration} toggleMealSelection={toggleMealSelection} handleSelectMeal={handleSelectMeal} generateShareLink={generateShareLink} handleStartOver={handleStartOver} /> : null; break;
            case 'shopping': content = planData ? <ShoppingView planData={planData} handleClearChecked={handleClearChecked} handleCheckItem={handleCheckItem} openCategory={openShoppingCategory} setOpenCategory={setOpenShoppingCategory} /> : null; break;
            case 'favorites': content = <FavoritesView favorites={favorites} deleteFavorite={deleteFavorite} loadFavorite={loadFavorite} />; break;
            case 'timing': content = planData ? <TimingView meal={planData.weeklyPlan[selectedMealIndex]} dinnerTime={dinnerTime} setDinnerTime={setDinnerTime} generateRecipeDetail={generateRecipeDetail} isLoading={isLoading} /> : null; break;
            case 'detail': content = detailedRecipe ? <DetailView detailedRecipe={detailedRecipe} favorites={favorites} handleToggleFavorite={handleToggleFavorite} handlePrint={handlePrint} setView={setView} /> : null; break;
            default: content = ( <div className="text-center py-20 bg-base-200 rounded-box"> <p className="text-xl font-medium">Enter your preferences to start!</p> </div> );
        }
    }
    
    return (
        <div className="min-h-screen bg-base-200 p-4 sm:p-8">
            <Toaster position="top-right" />
            <div className="max-w-5xl mx-auto bg-base-100 rounded-box shadow-2xl p-6 sm:p-10">
                <header className="flex justify-between items-center mb-10 border-b border-base-300 pb-4 no-print">
                    <div className="text-left">
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-primary">Family Dinner Plans</h1>
                        <p className="opacity-70 mt-1 text-sm sm:text-base">Plan, Shop, and Cook with Precision</p>
                    </div>
                    <ThemeToggle />
                </header>
                {planData && (
                    <div className="flex justify-center gap-8 mb-8 no-print">
                        <button onClick={() => setView('review')} disabled={!planData} className={`btn ${['review', 'timing', 'detail'].includes(view) ? 'btn-primary' : ''}`}>Dinner Plan</button>
                        <button onClick={() => setView('shopping')} disabled={!planData} className={`btn ${view === 'shopping' ? 'btn-primary' : ''}`}>Shopping List</button>
                        <button onClick={() => setView('favorites')} disabled={!planData} className={`btn ${view === 'favorites' ? 'btn-primary' : ''}`}>Favorites</button>
                    </div>
                )}
                <div className="mt-8">
                    {error && <div className="alert alert-error mb-4"><span>{error}</span></div>}
                    {content}
                </div>
            </div>
        </div>
    );
};

export default App;