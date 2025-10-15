import React, { useState, useEffect, useCallback, useMemo } from 'react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from 'firebase/firestore';

// --- CONFIGURATION ---
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";
const apiKey = "";

// Environment Variables (Read directly from Vercel's standard injection)
const VERCEL_APP_ID = import.meta.env.VITE_APP_ID;
const VERCEL_FIREBASE_CONFIG_STRING = import.meta.env.VITE_FIREBASE_CONFIG;
const GEMINI_API_KEY_ENV = import.meta.env.VITE_GEMINI_API_KEY;

// Parse the environment variables safely
const appId = VERCEL_APP_ID || 'default-app-id';
let firebaseConfig = {};
let finalGeminiApiKey = GEMINI_API_KEY_ENV || apiKey;

try {
    if (VERCEL_FIREBASE_CONFIG_STRING) {
        firebaseConfig = JSON.parse(VERCEL_FIREBASE_CONFIG_STRING);
    }
} catch (e) {
    console.error("Error parsing VITE_FIREBASE_CONFIG JSON:", e);
}

if (GEMINI_API_KEY_ENV) {
    finalGeminiApiKey = GEMINI_API_KEY_ENV;
}

// Firestore Collection Constants
const MEAL_PLAN_DOC_ID = 'current_plan';
const FAVORITES_COLLECTION_NAME = 'favorites';
const SHARED_PLANS_COLLECTION_NAME = 'public/data/shared_plans';

// --- JSON SCHEMAS (UNCHANGED) ---
const PLAN_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "weeklyPlan": { type: "ARRAY", description: "A 7-day dinner plan (mixed old and new meals).", items: { type: "OBJECT", properties: { "day": { "type": "STRING", "description": "e.g., Monday" }, "meal": { "type": "STRING", "description": "The name of the dinner." }, "description": { "type": "STRING", "description": "A brief description or suggested preparation method." } } } }, "shoppingList": { type: "ARRAY", description: "A flat, consolidated list of ALL required grocery ingredients for the new 7-day plan.", items: { type: "OBJECT", properties: { "item": { "type": "STRING", "description": "The name of the ingredient, e.g., Chicken Breast" }, "quantity": { "type": "STRING", "description": "The quantity, e.g., 2 lbs or 1 can" }, "category": { "type": "STRING", "description": "Grocery category for shopping efficiency (e.g., Produce, Dairy, Meat, Canned Goods)." }, "isChecked": { "type": "BOOLEAN", "description": "Always false initially (will be merged in client)." } }, propertyOrdering: ["item", "quantity", "category", "isChecked"] } } }, propertyOrdering: ["weeklyPlan", "shoppingList"] };
const RECIPE_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "recipeName": { "type": "STRING" }, "prepTimeMinutes": { "type": "NUMBER" }, "cookTimeMinutes": { "type": "NUMBER" }, "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } }, "timeline": { type: "ARRAY", description: "Detailed, reverse-engineered timeline for the meal.", items: { "type": "OBJECT", "properties": { "minutesBefore": { "type": "NUMBER", "description": "Minutes before the target dinner time the action should start. E.g., 60, 45, 10." }, "action": { "type": "STRING", "description": "Detailed step to be performed." } } } }, "instructions": { "type": "ARRAY", "items": { "type": "STRING" } } }, propertyOrdering: ["recipeName", "prepTimeMinutes", "cookTimeMinutes", "ingredients", "timeline", "instructions"] };

// --- HELPER FUNCTIONS (UNCHANGED) ---
const convertToActualTime = (targetTimeStr, minutesBefore) => { if (!targetTimeStr) return 'N/A'; const [hours, minutes] = targetTimeStr.split(':').map(Number); const targetDate = new Date(); targetDate.setHours(hours, minutes, 0, 0); const startTime = new Date(targetDate.getTime() - minutesBefore * 60000); const h = startTime.getHours(); const m = startTime.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'; const hour = h % 12 || 12; const minute = m < 10 ? '0' + m : m; return `${hour}:${minute} ${ampm}`; };
const mergeShoppingLists = (newShoppingList, oldShoppingList) => { if (!oldShoppingList) return newShoppingList; const oldListMap = new Map(); oldShoppingList.forEach(item => { const key = `${item.item}|${item.quantity}|${item.category}`; oldListMap.set(key, item.isChecked); }); return newShoppingList.map(newItem => { const key = `${newItem.item}|${newItem.quantity}|${newItem.category}`; const wasChecked = oldListMap.get(key); return { ...newItem, isChecked: wasChecked === true }; }); };

// --- CONSTANTS FOR UNIT CONVERSION (UNCHANGED) ---
const UNIT_CONVERSIONS = { 'lb': { unit: 'kg', factor: 0.453592 }, 'oz': { unit: 'g', factor: 28.3495 }, 'cup': { unit: 'ml', factor: 236.588 }, 'tsp': { unit: 'ml', factor: 4.92892 }, 'tbsp': { unit: 'ml', factor: 14.7868 } };
const imperialUnits = Object.keys(UNIT_CONVERSIONS);

// --- APP COMPONENT ---
const App = () => {
    // --- STATE HOOKS (UNCHANGED) ---
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

    // --- HANDLERS AND CORE LOGIC (MOSTLY UNCHANGED) ---
    const handleSelectMeal = useCallback((index) => { setSelectedMealIndex(index); setDetailedRecipe(null); setView('timing'); }, []);
    const toggleMealSelection = (index) => { setMealsToRegenerate(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]); };

    // --- FIX: New function to handle deleting the plan ---
    const handleStartOver = async () => {
        if (!db || !userId) return;

        if (window.confirm("Are you sure you want to delete this entire plan and start over?")) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
            try {
                await deleteDoc(docRef);
                // The onSnapshot listener will automatically handle resetting the view and local state
            } catch (e) {
                console.error("Error deleting plan:", e);
                setError("Could not delete the plan. Please try again.");
            }
        }
    };

    useEffect(() => { if (!VERCEL_FIREBASE_CONFIG_STRING || !Object.keys(firebaseConfig).length) { setError("Error: Failed to initialize Firebase. The VITE_FIREBASE_CONFIG environment variable is either empty or invalid. Please check the JSON format in Vercel."); return; } try { const app = initializeApp(firebaseConfig); const authInstance = getAuth(app); const dbInstance = getFirestore(app); setDb(dbInstance); setIsFirebaseInitialized(true); const unsubscribe = onAuthStateChanged(authInstance, async (user) => { if (user) { setUserId(user.uid); } else { await signInAnonymously(authInstance); setUserId(authInstance.currentUser?.uid || crypto.randomUUID()); } setIsAuthReady(true); }); return () => unsubscribe(); } catch (e) { console.error("Firebase Initialization Error:", e); setError(`Failed to initialize Firebase. Please check VERCEL_FIREBASE_CONFIG and ensure Firestore/Auth services are enabled.`); } }, []);
    useEffect(() => { if (!db || !userId || !isAuthReady) return; const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID); const unsubscribe = onSnapshot(docRef, (docSnap) => { if (docSnap.exists()) { const data = docSnap.data(); setPlanData(data); if (!['shopping', 'timing', 'detail', 'favorites', 'public'].includes(view)) { setView('review'); } if (!query) setQuery(data.initialQuery || ''); } else { setPlanData(null); setView('planning'); setDetailedRecipe(null); } }, (e) => { console.error("Firestore Snapshot Error:", e); }); return () => unsubscribe(); }, [db, userId, isAuthReady, view, query]);
    useEffect(() => { if (!db || !userId || !isAuthReady) return; const favoritesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME); const unsubscribe = onSnapshot(favoritesCollectionRef, (snapshot) => { const favoriteList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setFavorites(favoriteList); }, (e) => { console.error("Favorites Snapshot Error:", e); }); return () => unsubscribe(); }, [db, userId, isAuthReady]);
    const retryFetch = useCallback(async (url, options, maxRetries = 5) => { for (let i = 0; i < maxRetries; i++) { try { const response = await fetch(url, options); if (response.status !== 429 && response.status < 500) { return response; } if (i === maxRetries - 1) throw new Error("Max retries reached."); const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; await new Promise(resolve => setTimeout(resolve, delay)); } catch (error) { if (i === maxRetries - 1) throw error; const delay = Math.pow(2, i) * 1000 + Math.random() * 1000; await new Promise(resolve => setTimeout(resolve, delay)); } } }, []);
    const processPlanGeneration = useCallback(async (isRegeneration = false) => { if (!db || !userId || isLoading || !query.trim()) return; setIsLoading(true); setError(null); setDetailedRecipe(null); setSelectedMealIndex(null); setMealsToRegenerate([]); const oldPlan = planData; let systemPrompt; let userPrompt = "Generate the complete weekly dinner plan and consolidated shopping list. The shopping list MUST be grouped into common grocery store categories (e.g., Produce, Dairy, Meat, Canned Goods)."; if (isRegeneration && oldPlan) { const mealsToUpdate = mealsToRegenerate.map(index => oldPlan.weeklyPlan[index].day).join(', '); const unchangedMeals = oldPlan.weeklyPlan.filter((_, index) => !mealsToRegenerate.includes(index)).map(meal => `${meal.day}: ${meal.meal} (${meal.description})`).join('; '); systemPrompt = `You are updating an existing 7-day meal plan based on the user's initial query: "${oldPlan.initialQuery}".\n\nInstructions:\n1. Generate NEW meal details (name, description) for ONLY the following days: ${mealsToUpdate}.\n2. For the remaining days, you MUST retain these exact meals: ${unchangedMeals}.\n3. The new meals must adhere to this temporary constraint: ${regenerationConstraint || 'None'}.\n4. Generate a single, consolidated 'shoppingList' for ALL 7 final meals. The shopping list MUST be grouped by Category.`; userPrompt = `Replace the meals for ${mealsToUpdate}. Return the full 7-day plan with a new consolidated shopping list.`; setRegenerationConstraint(''); } else { systemPrompt = `You are a professional weekly meal planner. Generate a comprehensive 7-day dinner plan and the corresponding, consolidated shopping list based on the user's request: "${query.trim()}"\n\nRules:\n1. Always provide exactly 7 meals (Monday to Sunday).\n2. Consolidate ALL ingredients into a single 'shoppingList' array, with each item containing a 'category'.\n3. For every ingredient in 'shoppingList', 'isChecked' must be 'false'.`; } try { const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: PLAN_RESPONSE_SCHEMA } }; const url = `${API_URL}?key=${finalGeminiApiKey}`; const response = await retryFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) { throw new Error(`API error: ${response.statusText}`); } const result = await response.json(); const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text; if (!jsonString) { throw new Error("AI response was empty or incorrectly formatted."); } const parsedPlan = JSON.parse(jsonString); const mergedList = mergeShoppingLists(parsedPlan.shoppingList, oldPlan?.shoppingList); const newPlanData = { ...parsedPlan, shoppingList: mergedList, initialQuery: query.trim() }; const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID); await setDoc(docRef, newPlanData); setView('review'); } catch (e) { console.error("Plan Generation Error:", e); setError(`Failed to generate plan: ${e.message}. Please check your query.`); } finally { setIsLoading(false); setMealsToRegenerate([]); } }, [db, userId, query, planData, mealsToRegenerate, regenerationConstraint, retryFetch]);
    const generateRecipeDetail = useCallback(async () => { if (!db || !userId || isLoading || selectedMealIndex === null || !planData) return; setIsLoading(true); setError(null); setDetailedRecipe(null); const meal = planData.weeklyPlan[selectedMealIndex]; const targetTime = convertToActualTime(dinnerTime, 0); const detailQuery = `Generate a full recipe for "${meal.meal}" based on this description: "${meal.description}". The meal MUST be ready to serve exactly at ${targetTime}. Provide a detailed, step-by-step timeline working backward from the target time. IMPORTANT: For the timeline, use the 'minutesBefore' field to return the total minutes before the target time (e.g., 60, 45, 10).`; const systemPrompt = "You are a professional chef and kitchen manager. You provide extremely precise recipe details, ingredient lists, and a reverse-engineered cooking timeline to ensure the meal is perfectly ready at the specified time."; try { const payload = { contents: [{ parts: [{ text: detailQuery }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: RECIPE_RESPONSE_SCHEMA } }; const url = `${API_URL}?key=${finalGeminiApiKey}`; const response = await retryFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) { throw new Error(`API error: ${response.statusText}`); } const result = await response.json(); const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text; if (!jsonString) { throw new Error("AI response was empty or incorrectly formatted."); } const parsedRecipe = JSON.parse(jsonString); parsedRecipe.dinnerTime = dinnerTime; setDetailedRecipe(parsedRecipe); setView('detail'); } catch (e) { console.error("Recipe Generation Error:", e); setError(`Failed to generate recipe details: ${e.message}. Please check your query.`); } finally { setIsLoading(false); } }, [db, userId, planData, selectedMealIndex, dinnerTime, retryFetch]);
    const updateShoppingList = useCallback(async (updatedList) => { if (!db || !userId || !planData) return; const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID); try { await setDoc(docRef, { ...planData, shoppingList: updatedList }); } catch (e) { console.error("Firestore Update Error:", e); } }, [db, userId, planData]);
    const handleCheckItem = useCallback((index) => { const newShoppingList = planData.shoppingList.map((item, i) => i === index ? { ...item, isChecked: !item.isChecked } : item); updateShoppingList(newShoppingList); }, [planData, updateShoppingList]);
    const handleClearChecked = useCallback(() => { const uncheckedList = planData.shoppingList.filter(item => !item.isChecked); updateShoppingList(uncheckedList); }, [planData, updateShoppingList]);
    const saveFavorite = useCallback(async () => { if (!db || !userId || !detailedRecipe) return; const favoritesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME); const newFavorite = { ...detailedRecipe, lastUsed: new Date().toISOString(), savedAt: new Date().toISOString(), mealSource: planData?.weeklyPlan[selectedMealIndex]?.meal || detailedRecipe.recipeName, }; try { await setDoc(doc(favoritesCollectionRef), newFavorite); console.log(`Successfully saved "${detailedRecipe.recipeName}" to Favorites.`); } catch (e) { console.error("Error saving favorite:", e); setError("Failed to save meal to favorites."); } }, [db, userId, detailedRecipe, planData, selectedMealIndex]);
    const loadFavorite = useCallback(async (favorite) => { setDetailedRecipe(favorite); setDinnerTime(favorite.dinnerTime || '19:00'); setView('detail'); if (favorite.id) { const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, favorite.id); try { await updateDoc(docRef, { lastUsed: new Date().toISOString() }); } catch (e) { console.error("Error updating lastUsed timestamp:", e); } } }, [db, userId]);
    const deleteFavorite = useCallback(async (id) => { if (!db || !userId) return; if (!window.confirm("Are you sure you want to delete this favorite recipe?")) return; const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, id); try { await deleteDoc(docRef); } catch (e) { console.error("Error deleting favorite:", e); setError("Failed to delete favorite."); } }, [db, userId]);
    const generateShareLink = useCallback(async () => { if (!db || !userId || !planData) return; const shareDocRef = doc(db, 'artifacts', appId, SHARED_PLANS_COLLECTION_NAME, userId); const publicPlanData = { weeklyPlan: planData.weeklyPlan, initialQuery: planData.initialQuery, userId: userId, userName: "Dickerson Family", sharedAt: new Date().toISOString(), }; try { await setDoc(shareDocRef, publicPlanData); const path = `/share/${userId}`; alert(`Shareable Link Path: ${path}\n\nTo view this link, another user would need access to the same project environment!`); } catch (e) { console.error("Error sharing plan:", e); setError("Failed to generate share link."); } }, [db, userId, planData]);
    const convertIngredient = (ingredientString, targetUnit) => { if (!ingredientString) return { original: 'N/A', converted: 'N/A' }; const parts = ingredientString.toLowerCase().match(/(\d+\.?\d*)\s*([a-z]+)/); if (!parts) return { original: ingredientString, converted: ingredientString }; const value = parseFloat(parts[1]); const unit = parts[2].trim(); if (targetUnit === 'metric') { const conversion = UNIT_CONVERSIONS[unit]; if (conversion) { const newValue = value * conversion.factor; return { original: `${value} ${unit}`, converted: `${newValue.toFixed(1)} ${conversion.unit}` }; } } else if (targetUnit === 'imperial') { const metricUnit = Object.keys(UNIT_CONVERSIONS).find(key => UNIT_CONVERSIONS[key].unit === unit); if (metricUnit) { const conversion = UNIT_CONVERSIONS[metricUnit]; const newValue = value / conversion.factor; return { original: `${value} ${unit}`, converted: `${newValue.toFixed(1)} ${metricUnit}` }; } } return { original: ingredientString, converted: "No standard conversion found." }; };
    
    // --- UI COMPONENTS (UNCHANGED FROM DAISYUI REFACTOR) ---
    const UnitConverter = ({ ingredients }) => { const [conversionType, setConversionType] = useState('metric'); const targetUnits = conversionType === 'metric' ? ['kg', 'g', 'ml'] : ['lb', 'oz', 'cup', 'tsp', 'tbsp']; return ( <div className="p-4 bg-base-200 rounded-box"> <div className="flex justify-between items-center mb-4 border-b pb-2"> <h4 className="text-xl font-bold">Unit Converter</h4> <select value={conversionType} onChange={(e) => setConversionType(e.target.value)} className="select select-bordered select-sm"> <option value="metric">Convert To Metric (g/kg/ml)</option> <option value="imperial">Convert To Imperial (lb/oz/cup)</option> </select> </div> <ul className="space-y-1 text-sm"> {ingredients.map((item, index) => { const conversion = convertIngredient(item, conversionType); return ( <li key={index} className="flex justify-between border-b border-base-300 last:border-b-0 py-1"> <span className="font-medium">{item}</span> <span className="font-semibold text-accent"> {conversion.converted !== conversion.original ? conversion.converted : '-'} </span> </li> ); })} </ul> </div> ); };
    
    const ShoppingView = () => {
        const groupedList = useMemo(() => {
            const list = {};
            if (planData?.shoppingList) {
                planData.shoppingList.forEach(item => {
                    const category = item.category || 'Uncategorized';
                    if (!list[category]) {
                        list[category] = [];
                    }
                    list[category].push(item);
                });
            }
            return list;
        }, [planData?.shoppingList]);

        return (
            <div>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold">Grocery Shopping List</h2>
                    <button onClick={handleClearChecked} disabled={planData?.shoppingList?.filter(i => i.isChecked).length === 0} className="btn btn-error btn-sm" >
                        Clear Checked
                    </button>
                </div>
                <div className="space-y-4">
                    {Object.keys(groupedList).sort().map(category => (
                        <div key={category} className="collapse collapse-arrow bg-base-200">
                            <input type="radio" name="shopping-accordion" defaultChecked={Object.keys(groupedList).sort()[0] === category} />
                            <div className="collapse-title text-xl font-medium">{category} ({groupedList[category].length})</div>
                            <div className="collapse-content">
                                {groupedList[category].map((item, index) => {
                                    const globalIndex = planData.shoppingList.findIndex(i => i.item === item.item && i.quantity === item.quantity);
                                    return (
                                        <div key={globalIndex} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition ${item.isChecked ? 'opacity-50 line-through' : 'hover:bg-base-100'}`} onClick={() => handleCheckItem(globalIndex)} >
                                            <div className="flex items-center gap-4">
                                                <input type="checkbox" checked={item.isChecked} readOnly className="checkbox checkbox-primary" />
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">{item.item}</span>
                                                    <span className="text-xs opacity-70">{item.quantity}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                {planData?.shoppingList?.length === 0 && ( <p className="text-center text-base-content/70 mt-10 p-6 bg-base-200 rounded-box">Your shopping list is empty! Ready for a new plan?</p> )}
            </div>
        );
    };
    
    const ReviewView = () => (
        <div>
            <h2 className="text-3xl font-bold mb-6">Review & Select Meals</h2>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                {mealsToRegenerate.length > 0 && (
                    <input type="text" placeholder="e.g., Use leftover chicken, Make vegetarian" value={regenerationConstraint} onChange={(e) => setRegenerationConstraint(e.target.value)} className="input input-bordered w-full" />
                )}
                <button onClick={() => processPlanGeneration(true)} disabled={mealsToRegenerate.length === 0} className="btn btn-accent" >
                    Regenerate {mealsToRegenerate.length || ''} Meal(s)
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {planData.weeklyPlan.map((meal, index) => {
                    const isSelected = mealsToRegenerate.includes(index);
                    return (
                        <div key={index} className={`card bg-base-100 shadow-xl transition-all duration-300 ${isSelected ? 'border-2 border-accent' : ''}`}>
                            <div className="card-body">
                                <h3 className="card-title text-primary">{meal.day}</h3>
                                <p className="font-semibold text-lg">{meal.meal}</p>
                                <p className="text-sm opacity-70">{meal.description}</p>
                                <div className="card-actions justify-between items-center mt-4 pt-4 border-t border-base-300">
                                    <label className="label cursor-pointer gap-2">
                                        <input type="checkbox" checked={isSelected} onChange={() => toggleMealSelection(index)} className="checkbox checkbox-accent" />
                                        <span className="label-text">Replace</span>
                                    </label>
                                    <button onClick={() => handleSelectMeal(index)} className="btn btn-secondary btn-sm" > Get Recipe </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={generateShareLink} className="btn btn-primary" > Share Plan </button>
                {/* --- FIX: Changed onClick to call handleStartOver --- */}
                <button onClick={handleStartOver} className="btn btn-error" > Start Over </button>
            </div>
        </div>
    );
    
    const TimingView = () => {
        const meal = planData.weeklyPlan[selectedMealIndex];
        return (
            <div className="p-8 bg-base-200 rounded-box text-center">
                <h2 className="text-3xl font-bold mb-2">Planning Timeline for {meal.day}</h2>
                <p className="text-xl mb-6">Meal: <span className="font-bold">{meal.meal}</span></p>
                <div className="form-control w-full max-w-xs mx-auto">
                    <label className="label"> <span className="label-text">What time do you need dinner ready?</span> </label>
                    <input type="time" value={dinnerTime} onChange={(e) => setDinnerTime(e.target.value)} step="300" className="input input-bordered text-center text-2xl font-mono" />
                </div>
                <button onClick={generateRecipeDetail} disabled={isLoading} className="btn btn-success mt-6 w-full max-w-xs" > Generate Timeline & Recipe </button>
            </div>
        );
    };

    const DetailView = () => {
        if (!detailedRecipe) return <p className="text-center text-error">Error loading recipe detail.</p>;
        const { recipeName, prepTimeMinutes, cookTimeMinutes, ingredients, timeline, instructions } = detailedRecipe;
        const targetTimeDisplay = convertToActualTime(dinnerTime, 0);
        const isFavorite = favorites.some(fav => fav.recipeName === recipeName && fav.dinnerTime === detailedRecipe.dinnerTime);
        return (
            <div className="space-y-10">
                <header className="text-center border-b border-base-300 pb-4">
                    <h2 className="text-4xl font-extrabold text-primary">{recipeName}</h2>
                    <p className="text-xl text-success mt-2 font-medium">Dinner Ready At: {targetTimeDisplay}</p>
                    <p className="opacity-70 mt-1">Total Prep: {prepTimeMinutes} mins | Total Cook: {cookTimeMinutes} mins</p>
                    {!isFavorite && ( <button onClick={saveFavorite} className="btn btn-secondary btn-sm mt-4 gap-2" > <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"></path></svg> Save as Favorite </button> )}
                    {isFavorite && ( <p className="mt-4 text-sm text-secondary font-medium flex items-center justify-center gap-2"> <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"></path></svg> Saved to Favorites </p> )}
                </header>
                <div>
                    <h3 className="text-3xl font-bold mb-5">Step-by-Step Timeline</h3>
                    <ul className="steps steps-vertical lg:steps-horizontal w-full">
                        {timeline.map((step, index) => ( <li key={index} className="step step-primary"> <div className="text-left p-2"> <p className="font-bold text-lg">{convertToActualTime(dinnerTime, step.minutesBefore)}</p> <p className="text-sm opacity-80">{step.action}</p> </div> </li> ))}
                    </ul>
                </div>
                <div> <h3 className="text-3xl font-bold mb-5">Full Ingredient List</h3> <ul className="list-disc list-inside space-y-2 text-lg p-4 bg-base-200 rounded-box"> {ingredients.map((item, index) => ( <li key={index}>{item}</li> ))} </ul> </div>
                <UnitConverter ingredients={ingredients} />
                <div> <h3 className="text-3xl font-bold mb-5">Cooking Instructions</h3> <ol className="list-decimal list-inside space-y-4"> {instructions.map((step, index) => ( <li key={index} className="font-medium"> <span>{step}</span> </li> ))} </ol> </div>
                <button onClick={() => setView('review')} className="btn btn-primary w-full mt-8" > Back to Meal Plan </button>
            </div>
        );
    };

    const FavoritesView = () => (
        <div>
            <h2 className="text-3xl font-bold mb-6">Your Saved Favorites ({favorites.length})</h2>
            <div className="space-y-4">
                {favorites.length === 0 ? ( <p className="text-center p-6 bg-base-200 rounded-box"> You don't have any saved favorite recipes yet. Save one from a generated timeline! </p> ) : (
                    favorites.map((fav) => (
                        <div key={fav.id} className="card card-side bg-base-100 shadow-md">
                            <div className="card-body">
                                <h3 className="card-title text-secondary">{fav.recipeName}</h3>
                                <p className="text-sm opacity-70"> Last Made: {fav.lastUsed ? new Date(fav.lastUsed).toLocaleDateString() : 'Never'} </p>
                                <div className="card-actions justify-end">
                                    <button onClick={() => deleteFavorite(fav.id)} className="btn btn-ghost btn-sm">Delete</button>
                                    <button onClick={() => loadFavorite(fav)} className="btn btn-primary btn-sm">View Recipe</button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );


    // F. Main Render Switch
    let content;
    const isDinnerPlanActive = ['review', 'timing', 'detail'].includes(view);
    const isLoadingView = !isFirebaseInitialized || !isAuthReady || isLoading;

    if (isLoadingView) {
        content = (
            <div className="text-center py-20">
                <span className="loading loading-spinner loading-lg text-primary"></span>
                <p className="mt-4 font-semibold">{isLoading ? 'Working on your request...' : 'Connecting to Database...'}</p>
                {error && <div className="alert alert-error mt-4">{error}</div>}
            </div>
        );
    } else {
        switch (view) {
            case 'planning':
                content = (
                    <div className="bg-base-200 p-6 rounded-box">
                        <div className="form-control">
                            <label className="label"> <span className="label-text text-lg font-bold">Enter Family Preferences & Dietary Needs</span> </label>
                            <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows="3" placeholder="e.g., 2 adults, 3 kids. Needs to be low-carb, no seafood, and prioritize chicken and vegetarian meals." className="textarea textarea-bordered h-24" disabled={isLoading} ></textarea>
                        </div>
                        <button onClick={() => processPlanGeneration(false)} disabled={!query.trim()} className="btn btn-primary w-full mt-4" >
                            Generate Initial 7-Day Plan & Shopping List
                        </button>
                    </div>
                );
                break;
            case 'review': content = planData ? <ReviewView /> : null; break;
            case 'shopping': content = planData ? <ShoppingView /> : null; break;
            case 'favorites': content = <FavoritesView />; break;
            case 'timing': content = planData ? <TimingView /> : null; break;
            case 'detail': content = detailedRecipe ? <DetailView /> : null; break;
            default: content = ( <div className="text-center py-20 bg-base-200 rounded-box"> <p className="text-xl font-medium">Enter your family's preferences above and click "Generate Plan" to start!</p> </div> );
        }
    }
    
    // G. Global Layout
    return (
        <div className="min-h-screen bg-base-200 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto bg-base-100 rounded-box shadow-2xl p-6 sm:p-10">
                <header className="text-center mb-10 border-b border-base-300 pb-4">
                    <h1 className="text-4xl font-extrabold text-primary"> Dickerson Family Dinner Plans </h1>
                    <p className="opacity-70 mt-2">Plan, Shop, and Cook with Precision</p>
                </header>

                <div className="flex justify-center mb-8">
                    <div className="join">
                        <button onClick={() => setView('review')} disabled={!planData} className={`join-item btn ${isDinnerPlanActive ? 'btn-primary' : ''}`} > Dinner Plan </button>
                        <button onClick={() => setView('shopping')} disabled={!planData} className={`join-item btn ${view === 'shopping' ? 'btn-primary' : ''}`} > Shopping List </button>
                        <button onClick={() => setView('favorites')} className={`join-item btn ${view === 'favorites' ? 'btn-primary' : ''}`} > Favorites </button>
                    </div>
                </div>

                <div className="mt-8"> {content} </div>
            </div>
        </div>
    );
};

export default App;