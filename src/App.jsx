import React, { useState, useEffect, useCallback, useMemo } from 'react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from 'firebase/firestore';

// --- CONFIGURATION ---
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent"; 
const apiKey = ""; 

// Environment Variables (Read directly from Vercel's standard injection)
// Despite the compiler warning, this is the CORRECT syntax Vercel requires.
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

// --- JSON SCHEMA FOR AI GENERATION (Plan & List) ---
const PLAN_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        "weeklyPlan": {
            type: "ARRAY",
            description: "A 7-day dinner plan (mixed old and new meals).",
            items: {
                type: "OBJECT",
                properties: {
                    "day": { "type": "STRING", "description": "e.g., Monday" },
                    "meal": { "type": "STRING", "description": "The name of the dinner." },
                    "description": { "type": "STRING", "description": "A brief description or suggested preparation method." }
                }
            }
        },
        "shoppingList": {
            type: "ARRAY",
            description: "A flat, consolidated list of ALL required grocery ingredients for the new 7-day plan.",
            items: {
                type: "OBJECT",
                properties: {
                    "item": { "type": "STRING", "description": "The name of the ingredient, e.g., Chicken Breast" },
                    "quantity": { "type": "STRING", "description": "The quantity, e.g., 2 lbs or 1 can" },
                    "category": { "type": "STRING", "description": "Grocery category for shopping efficiency (e.g., Produce, Dairy, Meat, Canned Goods)." },
                    "isChecked": { "type": "BOOLEAN", "description": "Always false initially (will be merged in client)." }
                },
                propertyOrdering: ["item", "quantity", "category", "isChecked"]
            }
        }
    },
    propertyOrdering: ["weeklyPlan", "shoppingList"]
};

// --- JSON SCHEMA FOR AI GENERATION (Detailed Recipe) ---
const RECIPE_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        "recipeName": { "type": "STRING" },
        "prepTimeMinutes": { "type": "NUMBER" },
        "cookTimeMinutes": { "type": "NUMBER" },
        "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } },
        "timeline": {
            type: "ARRAY",
            description: "Detailed, reverse-engineered timeline for the meal.",
            items: {
                "type": "OBJECT",
                "properties": {
                    "minutesBefore": { "type": "NUMBER", "description": "Minutes before the target dinner time the action should start. E.g., 60, 45, 10." },
                    "action": { "type": "STRING", "description": "Detailed step to be performed." }
                }
            }
        },
        "instructions": { "type": "ARRAY", "items": { "type": "STRING" } }
    },
    propertyOrdering: ["recipeName", "prepTimeMinutes", "cookTimeMinutes", "ingredients", "timeline", "instructions"]
};

/**
 * Converts a 24-hour time string (HH:mm) and a minutes offset into a 12-hour clock string.
 */
const convertToActualTime = (targetTimeStr, minutesBefore) => {
    if (!targetTimeStr) return 'N/A';
    
    const [hours, minutes] = targetTimeStr.split(':').map(Number);
    const targetDate = new Date();
    targetDate.setHours(hours, minutes, 0, 0);

    const startTime = new Date(targetDate.getTime() - minutesBefore * 60000);
    
    const h = startTime.getHours();
    const m = startTime.getMinutes();
    
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12; 
    const minute = m < 10 ? '0' + m : m;

    return `${hour}:${minute} ${ampm}`;
};

/**
 * Merges the new AI-generated shopping list with the old list, preserving the 'isChecked' status
 * for items that still exist in the new plan.
 */
const mergeShoppingLists = (newShoppingList, oldShoppingList) => {
    if (!oldShoppingList) return newShoppingList;

    const oldListMap = new Map();
    oldShoppingList.forEach(item => {
        // Use a combined key (item + quantity + category) for reliable matching
        const key = `${item.item}|${item.quantity}|${item.category}`;
        oldListMap.set(key, item.isChecked);
    });

    return newShoppingList.map(newItem => {
        const key = `${newItem.item}|${newItem.quantity}|${newItem.category}`;
        const wasChecked = oldListMap.get(key);
        
        return {
            ...newItem,
            // Preserve 'isChecked' status if the item existed and was checked in the old list
            isChecked: wasChecked === true 
        };
    });
};

// --- CONSTANTS FOR UNIT CONVERSION ---
const UNIT_CONVERSIONS = {
    'lb': { unit: 'kg', factor: 0.453592 },
    'oz': { unit: 'g', factor: 28.3495 },
    'cup': { unit: 'ml', factor: 236.588 },
    'tsp': { unit: 'ml', factor: 4.92892 },
    'tbsp': { unit: 'ml', factor: 14.7868 }
};
const imperialUnits = Object.keys(UNIT_CONVERSIONS);

// --- APP COMPONENT ---

const App = () => {
    // Firebase State
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false);
    
    // Application State
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

    // --- UI HANDLERS ---
    const handleSelectMeal = useCallback((index) => {
        setSelectedMealIndex(index);
        setDetailedRecipe(null); 
        setView('timing');
    }, []);

    const toggleMealSelection = (index) => {
        setMealsToRegenerate(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index]
        );
    };
    
    // --- FIREBASE INITIALIZATION ---
    useEffect(() => {
        // If config is missing, set error state and stop
        if (!VERCEL_FIREBASE_CONFIG_STRING || !Object.keys(firebaseConfig).length) {
            setError("Error: Failed to initialize Firebase. The VITE_FIREBASE_CONFIG environment variable is either empty or invalid. Please check the JSON format in Vercel.");
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);
            setIsFirebaseInitialized(true);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Sign in anonymously if no authenticated user exists
                    await signInAnonymously(authInstance);
                    setUserId(authInstance.currentUser?.uid || crypto.randomUUID()); 
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError(`Failed to initialize Firebase. Please check VERCEL_FIREBASE_CONFIG and ensure Firestore/Auth services are enabled.`);
        }
    }, []);

    // 2. Set up Firestore Real-Time Listener for Weekly Plan
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const docRef = doc(db, 
            'artifacts', appId, 
            'users', userId, 
            'mealPlans', MEAL_PLAN_DOC_ID
        );

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPlanData(data);
                if (!['shopping', 'timing', 'detail', 'favorites', 'public'].includes(view)) {
                    setView('review');
                }
                if (!query) setQuery(data.initialQuery || '');

            } else {
                setPlanData(null);
                setView('planning');
                setDetailedRecipe(null);
            }
        }, (e) => {
            console.error("Firestore Snapshot Error:", e);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady, view, query]);
    
    // 3. Set up Real-Time Listener for Favorites
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        const favoritesCollectionRef = collection(db, 
            'artifacts', appId, 
            'users', userId, 
            FAVORITES_COLLECTION_NAME
        );

        const unsubscribe = onSnapshot(favoritesCollectionRef, (snapshot) => {
            const favoriteList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setFavorites(favoriteList);
        }, (e) => {
            console.error("Favorites Snapshot Error:", e);
        });

        return () => unsubscribe();
    }, [db, userId, isAuthReady]);

    // Helper for fetch with exponential backoff 
    const retryFetch = useCallback(async (url, options, maxRetries = 5) => {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status !== 429 && response.status < 500) {
                    return response;
                }
                if (i === maxRetries - 1) throw new Error("Max retries reached.");
                
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }, []);


    // 4. AI Plan Generation Handler (Handles BOTH initial generation and regeneration)
    const processPlanGeneration = useCallback(async (isRegeneration = false) => {
        if (!db || !userId || isLoading || !query.trim()) return;

        setIsLoading(true);
        setError(null);
        setDetailedRecipe(null); 
        setSelectedMealIndex(null); 
        setMealsToRegenerate([]); 

        const oldPlan = planData;
        
        let systemPrompt;
        let userPrompt = "Generate the complete weekly dinner plan and consolidated shopping list. The shopping list MUST be grouped into common grocery store categories (e.g., Produce, Dairy, Meat, Canned Goods, Spices).";

        if (isRegeneration && oldPlan) {
            const mealsToUpdate = mealsToRegenerate.map(index => oldPlan.weeklyPlan[index].day).join(', ');
            
            const unchangedMeals = oldPlan.weeklyPlan
                .filter((_, index) => !mealsToRegenerate.includes(index))
                .map(meal => `${meal.day}: ${meal.meal} (${meal.description})`)
                .join('; ');
            
            systemPrompt = `You are updating an existing 7-day meal plan based on the user's initial query: "${oldPlan.initialQuery}".
            
            Instructions:
            1. Generate NEW meal details (name, description) for ONLY the following days: ${mealsToUpdate}.
            2. For the remaining days, you MUST retain these exact meals: ${unchangedMeals}.
            3. The new meals must adhere to this temporary constraint: ${regenerationConstraint || 'None'}.
            4. Generate a single, consolidated 'shoppingList' for ALL 7 final meals. The shopping list MUST be grouped by Category.`;
            
            userPrompt = `Replace the meals for ${mealsToUpdate}. Return the full 7-day plan with a new consolidated shopping list.`;
            setRegenerationConstraint('');

        } else {
            systemPrompt = `You are a professional weekly meal planner. Generate a comprehensive 7-day dinner plan and the corresponding, consolidated shopping list based on the user's request: "${query.trim()}"
            
            Rules:
            1. Always provide exactly 7 meals (Monday to Sunday).
            2. Consolidate ALL ingredients into a single 'shoppingList' array, with each item containing a 'category'.
            3. For every ingredient in 'shoppingList', 'isChecked' must be 'false'.`;
        }
        
        try {
            const payload = {
                contents: [{ parts: [{ text: userPrompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: PLAN_RESPONSE_SCHEMA
                }
            };

            const url = `${API_URL}?key=${finalGeminiApiKey}`;
            
            const response = await retryFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            const result = await response.json();
            const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!jsonString) {
                throw new Error("AI response was empty or incorrectly formatted.");
            }

            const parsedPlan = JSON.parse(jsonString);
            
            const mergedList = mergeShoppingLists(parsedPlan.shoppingList, oldPlan?.shoppingList);
            
            const newPlanData = {
                ...parsedPlan,
                shoppingList: mergedList,
                initialQuery: query.trim() 
            };
            
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
            await setDoc(docRef, newPlanData);
            
            setView('review'); 

        } catch (e) {
            console.error("Plan Generation Error:", e);
            setError(`Failed to generate plan: ${e.message}. Please check your query.`);
        } finally {
            setIsLoading(false);
            setMealsToRegenerate([]); 
        }
    }, [db, userId, query, planData, mealsToRegenerate, regenerationConstraint, retryFetch]);


    // 5. AI Detail Generation Handler (Creates recipe and timeline)
    const generateRecipeDetail = useCallback(async () => {
        if (!db || !userId || isLoading || selectedMealIndex === null || !planData) return;

        setIsLoading(true);
        setError(null);
        setDetailedRecipe(null);
        
        const meal = planData.weeklyPlan[selectedMealIndex];
        const targetTime = convertToActualTime(dinnerTime, 0); 
        
        const detailQuery = `Generate a full recipe for "${meal.meal}" based on this description: "${meal.description}". The meal MUST be ready to serve exactly at ${targetTime}. Provide a detailed, step-by-step timeline working backward from the target time. IMPORTANT: For the timeline, use the 'minutesBefore' field to return the total minutes before the target time (e.g., 60, 45, 10).`;

        const systemPrompt = "You are a professional chef and kitchen manager. You provide extremely precise recipe details, ingredient lists, and a reverse-engineered cooking timeline to ensure the meal is perfectly ready at the specified time.";
        
        try {
            const payload = {
                contents: [{ parts: [{ text: detailQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: RECIPE_RESPONSE_SCHEMA
                }
            };

            const url = `${API_URL}?key=${finalGeminiApiKey}`;
            const response = await retryFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            const result = await response.json();
            const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!jsonString) {
                throw new Error("AI response was empty or incorrectly formatted.");
            }

            const parsedRecipe = JSON.parse(jsonString);
            
            parsedRecipe.dinnerTime = dinnerTime; 
            
            setDetailedRecipe(parsedRecipe);
            setView('detail'); 

        } catch (e) {
            console.error("Recipe Generation Error:", e);
            setError(`Failed to generate recipe details: ${e.message}. Please check your query.`);
        } finally {
            setIsLoading(false);
        }
    }, [db, userId, planData, selectedMealIndex, dinnerTime, retryFetch]);
    
    // --- Shopping List Update Handlers ---
    const updateShoppingList = useCallback(async (updatedList) => {
        if (!db || !userId || !planData) return;
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);

        try {
            await setDoc(docRef, { ...planData, shoppingList: updatedList });
        } catch (e) {
            console.error("Firestore Update Error:", e);
        }
    }, [db, userId, planData]);

    const handleCheckItem = useCallback((index) => {
        const newShoppingList = planData.shoppingList.map((item, i) => 
            i === index ? { ...item, isChecked: !item.isChecked } : item
        );
        updateShoppingList(newShoppingList);
    }, [planData, updateShoppingList]);

    const handleClearChecked = useCallback(() => {
        const uncheckedList = planData.shoppingList.filter(item => !item.isChecked);
        updateShoppingList(uncheckedList);
    }, [planData, updateShoppingList]);

    // --- Favorites Handlers ---
    const saveFavorite = useCallback(async () => {
        if (!db || !userId || !detailedRecipe) return;

        const favoritesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME);
        
        const newFavorite = {
            ...detailedRecipe,
            lastUsed: new Date().toISOString(), // Use lastUsed for saving/tracking
            savedAt: new Date().toISOString(),
            mealSource: planData?.weeklyPlan[selectedMealIndex]?.meal || detailedRecipe.recipeName, 
        };
        
        try {
            // Using setDoc with a unique ID generation (Firestore auto ID)
            await setDoc(doc(favoritesCollectionRef), newFavorite);
            console.log(`Successfully saved "${detailedRecipe.recipeName}" to Favorites.`); 
        } catch (e) {
            console.error("Error saving favorite:", e);
            setError("Failed to save meal to favorites.");
        }
    }, [db, userId, detailedRecipe, planData, selectedMealIndex]);
    
    const loadFavorite = useCallback(async (favorite) => {
        setDetailedRecipe(favorite);
        setDinnerTime(favorite.dinnerTime || '19:00'); 
        setView('detail');

        // Update the lastUsed timestamp in Firestore
        if (favorite.id) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, favorite.id);
            try {
                await updateDoc(docRef, { lastUsed: new Date().toISOString() });
            } catch(e) {
                console.error("Error updating lastUsed timestamp:", e);
            }
        }

    }, [db, userId]);

    const deleteFavorite = useCallback(async (id) => {
        if (!db || !userId) return;

        if (!window.confirm("Are you sure you want to delete this favorite recipe?")) return;

        const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, id);
        
        try {
            await deleteDoc(docRef);
        } catch (e) {
            console.error("Error deleting favorite:", e);
            setError("Failed to delete favorite.");
        }
    }, [db, userId]);

    // --- Sharing Handlers ---

    const generateShareLink = useCallback(async () => {
        if (!db || !userId || !planData) return;
        
        // 1. Save the Weekly Plan to the Public collection
        const shareDocRef = doc(db, 'artifacts', appId, SHARED_PLANS_COLLECTION_NAME, userId); // Using userId as document ID for simplicity
        
        const publicPlanData = {
            weeklyPlan: planData.weeklyPlan,
            initialQuery: planData.initialQuery,
            userId: userId,
            userName: "Dickerson Family", // Hardcoded for app name
            sharedAt: new Date().toISOString(),
        };

        try {
            await setDoc(shareDocRef, publicPlanData);
            
            // 2. Construct and display the shareable URL
            // In a real deployed environment, you'd use the domain, e.g., https://myfamilydinners.com/share/USER_ID
            // For now, we'll log the full path needed.
            const path = `/share/${userId}`;
            alert(`Shareable Link Path: ${path}\n\nTo view this link, another user would need access to the same project environment!`);
            
        } catch (e) {
            console.error("Error sharing plan:", e);
            setError("Failed to generate share link.");
        }

    }, [db, userId, planData]);

    // --- Unit Conversion Utility ---
    const convertIngredient = (ingredientString, targetUnit) => {
        if (!ingredientString) return { original: 'N/A', converted: 'N/A' };

        const parts = ingredientString.toLowerCase().match(/(\d+\.?\d*)\s*([a-z]+)/);
        if (!parts) return { original: ingredientString, converted: ingredientString };

        const value = parseFloat(parts[1]);
        const unit = parts[2].trim();
        
        if (targetUnit === 'metric') {
            const conversion = UNIT_CONVERSIONS[unit];
            if (conversion) {
                const newValue = value * conversion.factor;
                return { 
                    original: `${value} ${unit}`, 
                    converted: `${newValue.toFixed(1)} ${conversion.unit}` 
                };
            }
        } else if (targetUnit === 'imperial') {
            const metricUnit = Object.keys(UNIT_CONVERSIONS).find(key => UNIT_CONVERSIONS[key].unit === unit);
            if (metricUnit) {
                 const conversion = UNIT_CONVERSIONS[metricUnit];
                 const newValue = value / conversion.factor;
                 return { 
                    original: `${value} ${unit}`, 
                    converted: `${newValue.toFixed(1)} ${metricUnit}` 
                };
            }
        }
        return { original: ingredientString, converted: "No standard conversion found." };
    };

    const UnitConverter = ({ ingredients }) => {
        const [conversionType, setConversionType] = useState('metric');
        
        const targetUnits = conversionType === 'metric' ? ['kg', 'g', 'ml'] : ['lb', 'oz', 'cup', 'tsp', 'tbsp'];

        return (
            <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h4 className="text-xl font-bold text-gray-700">Unit Converter</h4>
                    <select 
                        value={conversionType} 
                        onChange={(e) => setConversionType(e.target.value)}
                        className="p-2 border rounded-lg text-sm"
                    >
                        <option value="metric">Convert To Metric (g/kg/ml)</option>
                        <option value="imperial">Convert To Imperial (lb/oz/cup)</option>
                    </select>
                </div>
                <ul className="space-y-1 text-sm">
                    {ingredients.map((item, index) => {
                        const conversion = convertIngredient(item, conversionType);
                        return (
                            <li key={index} className="flex justify-between border-b border-gray-200 last:border-b-0 py-1">
                                <span className="text-gray-900 font-medium">{item}</span>
                                <span className="text-indigo-600 font-semibold">
                                    {conversion.converted !== conversion.original ? conversion.converted : '-'}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    // --- UI COMPONENTS ---
    
    // A. Shopping View 
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

        const [openCategory, setOpenCategory] = useState(null);

        return (
            <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-6 flex justify-between items-center">
                    Grocery Shopping List 
                    <button 
                        onClick={handleClearChecked}
                        disabled={planData?.shoppingList?.filter(i => i.isChecked).length === 0}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 px-3 rounded-full shadow transition disabled:opacity-50"
                    >
                        Clear Checked
                    </button>
                </h2>

                <div className="space-y-4">
                    {Object.keys(groupedList).sort().map(category => (
                        <div key={category} className="border border-gray-200 rounded-xl shadow-sm">
                            <button
                                onClick={() => setOpenCategory(openCategory === category ? null : category)}
                                className="w-full text-left p-4 bg-gray-100 hover:bg-gray-200 rounded-t-xl flex justify-between items-center font-bold text-lg text-indigo-700"
                            >
                                {category} ({groupedList[category].length})
                                <span>{openCategory === category ? '▲' : '▼'}</span>
                            </button>
                            
                            {openCategory === category && (
                                <div className="p-4 space-y-2">
                                    {groupedList[category].map((item, index) => {
                                        const globalIndex = planData.shoppingList.findIndex(i => 
                                            i.item === item.item && i.quantity === item.quantity
                                        );

                                        return (
                                            <div 
                                                key={globalIndex} 
                                                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition ${item.isChecked ? 'bg-green-50 opacity-70 line-through' : 'bg-white hover:bg-indigo-50'}`}
                                                onClick={() => handleCheckItem(globalIndex)}
                                            >
                                                <div className="flex flex-col">
                                                    <span className={`font-semibold text-base ${item.isChecked ? 'text-green-700' : 'text-gray-800'}`}>
                                                        {item.item}
                                                    </span>
                                                    <span className={`text-xs ${item.isChecked ? 'text-green-600' : 'text-gray-500'}`}>
                                                        {item.quantity}
                                                    </span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={item.isChecked}
                                                    readOnly
                                                    className="h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {planData?.shoppingList?.length === 0 && (
                     <p className="text-center text-gray-500 mt-10 p-6 bg-white rounded-xl">Your shopping list is empty! Ready for a new plan?</p>
                )}
            </div>
        );
    };

    // B. Review View
    const ReviewView = () => (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Review & Select Meals</h2>
            
            <div className="flex space-x-4 mb-6">
                {mealsToRegenerate.length > 0 && (
                    <input 
                        type="text"
                        placeholder="e.g., Use leftover chicken, Make vegetarian"
                        value={regenerationConstraint}
                        onChange={(e) => setRegenerationConstraint(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded-lg"
                    />
                )}
                <button 
                    onClick={() => processPlanGeneration(true)}
                    disabled={mealsToRegenerate.length === 0}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg disabled:opacity-50"
                >
                    Regenerate {mealsToRegenerate.length || ''} Meal(s)
                </button>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {planData.weeklyPlan.map((meal, index) => {
                    const isSelected = mealsToRegenerate.includes(index);
                    return (
                    <div key={index} 
                         className={`bg-white p-4 rounded-xl shadow-md flex flex-col justify-between transition duration-150 ${isSelected ? 'border-4 border-yellow-500 ring-2 ring-yellow-300' : 'border-l-4 border-indigo-500'}`}>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-indigo-700 mb-1">{meal.day}</h3>
                            <p className="text-md font-semibold text-gray-800 mb-2">{meal.meal}</p>
                            <p className="text-gray-500 text-sm">{meal.description}</p>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                            <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleMealSelection(index)}
                                    className="h-4 w-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-500"
                                />
                                <span>Replace</span>
                            </label>
                            <button 
                                onClick={() => handleSelectMeal(index)}
                                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-3 text-sm rounded-lg shadow transition"
                            >
                                Get Recipe
                            </button>
                        </div>
                    </div>
                );})}
            </div>
            
            <div className="mt-8 flex justify-between space-x-4">
                <button 
                    onClick={generateShareLink}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg"
                >
                    Share Plan
                </button>
                <button 
                    onClick={() => setView('planning')}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg"
                >
                    Start Over (New Preferences)
                </button>
            </div>
        </div>
    );

    // C. Timing View 
    const TimingView = () => {
        const meal = planData.weeklyPlan[selectedMealIndex];
        return (
            <div className="p-8 bg-indigo-50 rounded-xl shadow-inner text-center">
                <h2 className="text-3xl font-bold text-indigo-800 mb-2">Planning Timeline for {meal.day}</h2>
                <p className="text-xl text-gray-700 mb-6">Meal: <span className="font-bold">{meal.meal}</span></p>

                <label htmlFor="dinner-time" className="block text-lg font-medium text-gray-700 mb-3">
                    What time do you need dinner ready?
                </label>
                <input
                    type="time"
                    id="dinner-time"
                    value={dinnerTime}
                    onChange={(e) => setDinnerTime(e.target.value)}
                    step="300" 
                    className="p-3 border border-indigo-300 rounded-lg text-2xl font-mono text-center mb-6 focus:ring-indigo-500 focus:border-indigo-500"
                />

                <button
                    onClick={generateRecipeDetail}
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg disabled:opacity-50"
                >
                    Generate Timeline & Recipe
                </button>
            </div>
        );
    };
    
    // D. Detail View 
    const DetailView = () => {
        if (!detailedRecipe) return <p className="text-center text-red-500">Error loading recipe detail.</p>;

        const { recipeName, prepTimeMinutes, cookTimeMinutes, ingredients, timeline, instructions } = detailedRecipe;
        const targetTimeDisplay = convertToActualTime(dinnerTime, 0); 
        
        const isFavorite = favorites.some(fav => fav.recipeName === recipeName && fav.dinnerTime === detailedRecipe.dinnerTime);
        
        return (
            <div className="space-y-10">
                <header className="text-center border-b pb-4">
                    <h2 className="text-4xl font-extrabold text-indigo-700">{recipeName}</h2>
                    <p className="text-xl text-green-600 mt-2 font-medium">Dinner Ready At: {targetTimeDisplay}</p>
                    <p className="text-gray-500 mt-1">Total Prep: {prepTimeMinutes} mins | Total Cook: {cookTimeMinutes} mins</p>
                    
                    {!isFavorite && (
                         <button 
                            onClick={saveFavorite}
                            className="mt-4 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded-full shadow-md transition flex items-center justify-center mx-auto text-sm"
                        >
                            <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"></path></svg>
                            Save as Favorite
                        </button>
                    )}
                    {isFavorite && (
                        <p className="mt-4 text-sm text-pink-500 font-medium flex items-center justify-center">
                            <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"></path></svg>
                            Saved to Favorites
                        </p>
                    )}
                </header>

                /* Timeline Section */
                <div>
                    <h3 className="text-3xl font-bold text-gray-800 mb-5 border-b pb-2">Step-by-Step Timeline</h3>
                    <div className="space-y-4">
                        {timeline.map((step, index) => (
                            <div key={index} className="flex flex-col sm:flex-row items-start bg-gray-50 p-4 rounded-lg border-l-4 border-yellow-500 shadow-sm">
                                <span className="text-2xl font-extrabold text-yellow-700 mr-4 min-w-[120px] mb-2 sm:mb-0">
                                    {convertToActualTime(dinnerTime, step.minutesBefore)}
                                </span>
                                <p className="text-gray-700 pt-1">{step.action}</p>
                            </div>
                        ))}
                    </div>
                </div>
                
                /* Ingredients Section */
                <div>
                    <h3 className="text-3xl font-bold text-gray-800 mb-5 border-b pb-2">Full Ingredient List</h3>
                    <ul className="list-disc list-inside space-y-2 text-lg text-gray-700 pl-4 bg-gray-50 p-4 rounded-lg">
                        {ingredients.map((item, index) => (
                            <li key={index} className="border-b border-gray-200 last:border-b-0 pb-2">{item}</li>
                        ))}
                    </ul>
                </div>
                
                /* Unit Conversion Utility */
                <UnitConverter ingredients={ingredients} />

                /* Instructions Section */
                <div>
                    <h3 className="text-3xl font-bold text-gray-800 mb-5 border-b pb-2">Cooking Instructions</h3>
                    <ol className="list-decimal list-inside space-y-4 text-gray-700 pl-4">
                        {instructions.map((step, index) => (
                            <li key={index} className="font-medium">
                                <span className="text-gray-900">{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                
                <button 
                    onClick={() => setView('review')}
                    className="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg"
                >
                    Back to Meal Plan
                </button>
            </div>
        );
    };

    // E. Favorites View
    const FavoritesView = () => (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex justify-between items-center">
                Your Saved Favorites ({favorites.length})
            </h2>
            
            <div className="space-y-4">
                {favorites.length === 0 ? (
                    <p className="text-center text-gray-500 mt-10 p-6 bg-white rounded-xl">
                        You don't have any saved favorite recipes yet. Save one from a generated timeline!
                    </p>
                ) : (
                    favorites.map((fav) => (
                        <div key={fav.id} 
                             className="bg-white p-5 rounded-xl shadow-md border-l-4 border-pink-500 flex justify-between items-center">
                            <div className="flex-1 pr-4">
                                <p className="text-lg font-bold text-pink-700">{fav.recipeName}</p>
                                <p className="text-gray-500 text-sm mt-1">
                                    Last Made: {fav.lastUsed ? new Date(fav.lastUsed).toLocaleDateString() : 'Never'}
                                </p>
                            </div>
                            <div className="flex space-x-2">
                                <button 
                                    onClick={() => loadFavorite(fav)}
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-3 text-sm rounded-lg shadow transition"
                                >
                                    View Recipe
                                </button>
                                <button 
                                    onClick={() => deleteFavorite(fav.id)}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-3 text-sm rounded-lg shadow transition"
                                >
                                    Delete
                                </button>
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

    if (!isFirebaseInitialized || !isAuthReady) {
         content = (
            <div className="flex flex-col items-center justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-indigo-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <p className="text-gray-600 font-semibold">Connecting to Database...</p>
                {error && <p className="text-red-500 mt-4 text-center p-2 border border-red-300 rounded-lg">{error}</p>}
            </div>
        );
    } else if (isLoading) {
        content = (
            <div className="flex flex-col items-center justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-indigo-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <p className="text-gray-600 font-semibold">Working on your request...</p>
            </div>
        );
    } else {
        switch (view) {
            case 'planning':
                content = (
                    <div className="bg-indigo-50 p-6 rounded-xl shadow-inner mb-8">
                        <label htmlFor="plan-query" className="block text-lg font-bold text-indigo-800 mb-2">
                            Enter Family Preferences & Dietary Needs
                        </label>
                        <textarea
                            id="plan-query"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            rows="3"
                            placeholder="e.g., 2 adults, 3 kids. Needs to be low-carb, no seafood, and prioritize chicken and vegetarian meals."
                            className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition duration-150"
                            disabled={isLoading}
                        ></textarea>
                        <button
                            onClick={() => processPlanGeneration(false)}
                            disabled={!query.trim()}
                            className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-[1.005] shadow-lg disabled:opacity-50"
                        >
                            Generate Initial 7-Day Plan & Shopping List
                        </button>
                    </div>
                );
                break;
            case 'review':
                content = planData ? <ReviewView /> : null;
                break;
            case 'shopping':
                content = planData ? <ShoppingView /> : null;
                break;
            case 'favorites':
                content = <FavoritesView />;
                break;
            case 'timing':
                content = planData ? <TimingView /> : null;
                break;
            case 'detail':
                content = detailedRecipe ? <DetailView /> : null;
                break;
            default:
                 content = (
                    <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p className="text-xl font-medium text-gray-500">
                            Enter your family's preferences above and click "Generate Plan" to start!
                        </p>
                    </div>
                );
        }
    }
    
    // G. Global Layout
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-6 sm:p-10">
                <header className="text-center mb-10 border-b pb-4">
                    <h1 className="text-4xl font-extrabold text-indigo-700">
                        Dickerson Family Dinner Plans
                    </h1>
                    <p className="text-gray-500 mt-2">Plan, Shop, and Cook with Precision</p>
                </header>

                /* Navigation and Content Switch */
                <div className="flex space-x-4 mb-8 border-b pb-4">
                    <button 
                        onClick={() => setView('review')}
                        disabled={!planData}
                        className={`py-2 px-4 rounded-full font-semibold transition ${isDinnerPlanActive ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} disabled:opacity-50`}
                    >
                        Dinner Plan
                    </button>
                    <button 
                        onClick={() => setView('shopping')}
                        disabled={!planData}
                        className={`py-2 px-4 rounded-full font-semibold transition ${view === 'shopping' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} disabled:opacity-50`}
                    >
                        Shopping List
                    </button>
                     <button 
                        onClick={() => setView('favorites')}
                        className={`py-2 px-4 rounded-full font-semibold transition ${view === 'favorites' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        Favorites
                    </button>
                </div>

                /* Main Content Area */
                <div className="mt-8">
                    {content}
                </div>

            </div>
        </div>
    );
};

export default App;
