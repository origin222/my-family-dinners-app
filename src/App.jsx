import React, { useState, useEffect, useCallback, useMemo } from 'react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, getDocs, deleteDoc } from 'firebase/firestore';

// --- CONFIGURATION ---
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";
const apiKey = ""; // Canvas environment provides the API key
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firestore Collection Constants
const MEAL_PLAN_DOC_ID = 'current_plan'; 
const FAVORITES_COLLECTION_NAME = 'favorites';
// New collection for public sharing (though public sharing link implementation is outside of this single file, the logic for saving the share ID is included)
const PUBLIC_PLANS_COLLECTION_NAME = 'public_plans'; 

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
            description: "A flat list of all required grocery ingredients.",
            items: {
                type: "OBJECT",
                properties: {
                    "item": { "type": "STRING", "description": "The name of the ingredient, e.g., Chicken Breast" },
                    "quantity": { "type": "STRING", "description": "The quantity, e.g., 2 lbs or 1 can" },
                    "category": { "type": "STRING", "description": "The store category/aisle, e.g., Produce, Dairy, Canned Goods" },
                    "isChecked": { "type": "BOOLEAN", "description": "Always false initially (will be merged in client)." }
                }
            }
        }
    }
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
    }
};

// --- UTILITY FUNCTIONS ---

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
            isChecked: wasChecked === true 
        };
    });
};

/**
 * Ingredient Conversion Utility for Display
 */
const convertIngredient = (value, unit) => {
    // Simplified conversion utility for common units
    const conversions = {
        'cup': 236.588, 'oz': 28.3495, 'lb': 453.592, 'tsp': 4.92892, 'tbsp': 14.7868
    };
    
    const lowerUnit = unit.toLowerCase().replace(/s$/, '');
    const unitMap = {
        'milliliter': 'ml', 'gram': 'g', 'cup': 'cup', 'ounce': 'oz', 'pound': 'lb',
        'teaspoon': 'tsp', 'tablespoon': 'tbsp'
    };

    const targetUnit = unitMap[lowerUnit] || lowerUnit;

    let convertedValue = null;
    let targetText = '';

    if (conversions[targetUnit] && !isNaN(value)) {
        let baseValue;
        if (['cup', 'tsp', 'tbsp'].includes(targetUnit)) {
            baseValue = value * conversions[targetUnit]; // base in ml
            convertedValue = (baseValue / 29.574).toFixed(1); // converted to fluid ounces
            targetText = ` (≈ ${convertedValue} fl oz)`;
        } else if (['oz', 'lb'].includes(targetUnit)) {
            baseValue = value * conversions[targetUnit]; // base in grams
            convertedValue = (baseValue / 28.35).toFixed(1); // converted to ounces
            targetText = ` (≈ ${convertedValue} oz)`;
        }
    }
    
    return targetText;
};

// --- APP COMPONENT ---

const App = () => {
    // Firebase State
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    // Application State
    const [query, setQuery] = useState('');
    const [tempConstraint, setTempConstraint] = useState(''); 
    const [view, setView] = useState('planning'); 
    const [planData, setPlanData] = useState(null);
    const [detailedRecipe, setDetailedRecipe] = useState(null);
    const [selectedMealIndex, setSelectedMealIndex] = useState(null); 
    const [mealsToRegenerate, setMealsToRegenerate] = useState([]); 
    const [dinnerTime, setDinnerTime] = useState('19:00'); 
    const [isLoading, setIsLoading] = useState(null);
    const [error, setError] = useState(null);
    const [favorites, setFavorites] = useState([]); 
    const [expandedCategories, setExpandedCategories] = useState({}); 
    const [shareLink, setShareLink] = useState(null); 

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
    
    const toggleCategory = (category) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category]
        }));
    };
    // ---------------------------------------------

    // 1. Initialize Firebase and Auth
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        const auth = getAuth(app);
                        if (initialAuthToken) {
                             await signInWithCustomToken(auth, initialAuthToken);
                        } else {
                            await signInAnonymously(auth);
                        }
                    } catch (e) {
                        console.error("Firebase Auth Error:", e);
                        setUserId(crypto.randomUUID()); 
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError("Failed to initialize Firebase.");
        }
    }, []);

    // 2. Set up Firestore Real-Time Listener for Weekly Plan & Favorites
    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;

        // Listener for Weekly Plan
        const planDocRef = doc(db, 
            'artifacts', appId, 
            'users', userId, 
            'mealPlans', MEAL_PLAN_DOC_ID
        );

        const unsubscribePlan = onSnapshot(planDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPlanData(data);
                if (!['shopping', 'timing', 'detail', 'favorites'].includes(view)) {
                    setView('review');
                }
                if (!query) setQuery(data.initialQuery || '');
                // Simplified share link for development environment
                if (data.shareId) setShareLink(`${window.location.origin}?view=public&id=${data.shareId}`); 

            } else {
                setPlanData(null);
                setView('planning'); 
                setDetailedRecipe(null);
                setShareLink(null);
            }
        }, (e) => {
            console.error("Firestore Plan Snapshot Error:", e);
            setError("Failed to listen for real-time plan updates.");
        });

        // Listener for Favorites
        const favoritesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME);

        const unsubscribeFavorites = onSnapshot(favoritesCollectionRef, (snapshot) => {
            const favoriteList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setFavorites(favoriteList);
        }, (e) => {
            console.error("Favorites Snapshot Error:", e);
        });

        return () => {
            unsubscribePlan();
            unsubscribeFavorites();
        };
    }, [db, userId, isAuthReady, view, query]);

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


    // 3. AI Plan Generation Handler (Handles BOTH initial generation and regeneration)
    const processPlanGeneration = useCallback(async (isRegeneration = false) => {
        if (!db || !userId || isLoading || !query.trim()) return;

        setIsLoading(true);
        setError(null);
        setDetailedRecipe(null); 
        setSelectedMealIndex(null); 
        setMealsToRegenerate([]); 

        const oldPlan = planData;
        
        let systemPrompt;
        let userPrompt = "Generate the complete weekly dinner plan and consolidated shopping list.";

        if (isRegeneration && oldPlan) {
            // Regeneration Logic
            const mealsToUpdate = mealsToRegenerate.map(index => oldPlan.weeklyPlan[index].day).join(', ');
            
            const unchangedMeals = oldPlan.weeklyPlan
                .filter((_, index) => !mealsToRegenerate.includes(index))
                .map(meal => `${meal.day}: ${meal.meal} (${meal.description})`)
                .join('; ');
            
            const constraintText = tempConstraint ? `\n\nADDITIONAL TEMPORARY CONSTRAINT (must be met for new meals): ${tempConstraint}` : '';

            systemPrompt = `You are updating an existing 7-day meal plan based on the user's initial query: "${oldPlan.initialQuery}".
            
            Instructions:
            1. Generate NEW meal details (name, description) and a new consolidated shopping list, ensuring all ingredients include a store category/aisle (e.g., Produce).
            2. Generate NEW meal details for ONLY the following days: ${mealsToUpdate}.${constraintText}
            3. For the remaining days, you MUST retain these exact meals: ${unchangedMeals}.
            4. Generate a single, consolidated 'shoppingList' for ALL 7 final meals. Every ingredient must include a 'category' (e.g., 'Produce', 'Dairy', 'Spices', 'Canned Goods').`;
            
            userPrompt = `Replace the meals for ${mealsToUpdate}. Ensure the final output array contains 7 objects representing the full week plan.`;

        } else {
            // Initial Generation Logic
            systemPrompt = `You are a professional weekly meal planner. Your task is to generate a comprehensive 7-day dinner plan and the corresponding, consolidated shopping list based on the user's request.
            
            Rules:
            1. Always provide exactly 7 meals (Monday to Sunday).
            2. Consolidate ALL ingredients into a single 'shoppingList' array.
            3. **IMPORTANT:** Every ingredient in 'shoppingList' must include a 'category' (e.g., 'Produce', 'Dairy', 'Spices', 'Canned Goods').
            4. User Preferences: "${query.trim()}"`;
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

            const url = `${API_URL}?key=${apiKey}`;
            
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
            
            // 4. MERGE SHOPPING LISTS
            const mergedList = mergeShoppingLists(parsedPlan.shoppingList, oldPlan?.shoppingList);
            
            const newPlanData = {
                ...parsedPlan,
                shoppingList: mergedList,
                initialQuery: query.trim() 
            };
            
            // Save the new plan to Firestore
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
            await setDoc(docRef, newPlanData);
            
            // Reset temporary constraint after use
            setTempConstraint('');
            setView('review'); 

        } catch (e) {
            console.error("Plan Generation Error:", e);
            setError(`Failed to generate plan: ${e.message}. Please check your query.`);
        } finally {
            setIsLoading(false);
            setMealsToRegenerate([]); 
        }
    }, [db, userId, query, planData, mealsToRegenerate, tempConstraint, retryFetch]);


    // 5. AI Detail Generation Handler (Creates recipe and timeline)
    const generateRecipeDetail = useCallback(async (isFavoriteLoad = false, favoriteData = null) => {
        // Feature E: Tracks when a favorite recipe is loaded/used
        if (isFavoriteLoad && favoriteData) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, favoriteData.id);
            await setDoc(docRef, { lastUsed: new Date().toISOString() }, { merge: true });
            setDetailedRecipe(favoriteData); // Load locally after updating timestamp
            setView('detail');
            return;
        }

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

            const url = `${API_URL}?key=${apiKey}`;
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
            setError(`Failed to generate recipe details: ${e.message}.`);
        } finally {
            setIsLoading(false);
        }
    }, [db, userId, planData, selectedMealIndex, dinnerTime, isLoading, retryFetch]);
    
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
            savedAt: new Date().toISOString(),
            lastUsed: null, 
            mealSource: planData.weeklyPlan[selectedMealIndex]?.meal || detailedRecipe.recipeName, 
        };
        
        try {
            await setDoc(doc(favoritesCollectionRef), newFavorite);
            console.log(`Successfully saved "${detailedRecipe.recipeName}" to Favorites.`); 
        } catch (e) {
            console.error("Error saving favorite:", e);
            setError("Failed to save meal to favorites.");
        }
    }, [db, userId, detailedRecipe, planData, selectedMealIndex]);
    
    const loadFavorite = useCallback((favorite) => {
        // Feature E: Update last used when loaded (calls generateRecipeDetail with isFavoriteLoad=true)
        if (db && userId) {
             generateRecipeDetail(true, favorite);
        } else {
             setDetailedRecipe(favorite);
             setDinnerTime(favorite.dinnerTime || '19:00'); 
             setView('detail');
        }
    }, [db, userId, generateRecipeDetail]);

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


    // --- Public Sharing Handler (Feature F) ---
    const handleSharePlan = useCallback(async () => {
        if (!db || !userId || !planData) return;

        setIsLoading(true);
        setError(null);

        // Check if a share link already exists
        if (planData.shareId && shareLink) {
            // Copy to clipboard
            const el = document.createElement('textarea');
            el.value = shareLink;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setIsLoading(false);
            console.log("Link copied:", shareLink);
            return;
        }

        try {
            const shareId = crypto.randomUUID();
            const publicDocRef = doc(db, 'artifacts', appId, 'public', 'data', PUBLIC_PLANS_COLLECTION_NAME, shareId);
            
            const publicData = {
                weeklyPlan: planData.weeklyPlan,
                initialQuery: planData.initialQuery,
                lastUpdated: new Date().toISOString(),
                userId: userId, 
                shareId: shareId
            };
            await setDoc(publicDocRef, publicData);

            const privateDocRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
            await setDoc(privateDocRef, { shareId: shareId }, { merge: true });

            const newShareLink = `${window.location.origin}?view=public&id=${shareId}`;
            setShareLink(newShareLink);
            
            // Copy to clipboard
            const el = document.createElement('textarea');
            el.value = newShareLink;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);

        } catch (e) {
            console.error("Error sharing plan:", e);
            setError("Failed to create and share the public plan link.");
        } finally {
            setIsLoading(false);
        }
    }, [db, userId, planData, shareLink]);


    // --- UI COMPONENTS ---
    
    // A. Shopping View (Feature A: Categorization)
    const ShoppingView = () => {
        // Group items by category and sort categories
        const categorizedItems = planData.shoppingList.reduce((acc, item) => {
            const category = item.category || 'Unsorted';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(item);
            return acc;
        }, {});
        
        const sortedCategories = Object.keys(categorizedItems).sort();

        return (
            <div>
                <h2 className="text-3xl font-bold text-gray-800 mb-6 flex justify-between items-center">
                    Grocery Shopping List ({planData.shoppingList.filter(i => !i.isChecked).length} remaining)
                    <button 
                        onClick={() => { if(window.confirm("Remove all checked items?")) handleClearChecked(); }}
                        disabled={planData.shoppingList.filter(i => i.isChecked).length === 0}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 px-3 rounded-full shadow transition disabled:opacity-50"
                    >
                        Clear Checked
                    </button>
                </h2>

                <div className="space-y-4">
                    {sortedCategories.map(category => (
                        <div key={category} className="bg-white rounded-xl shadow-md overflow-hidden border">
                            <button
                                onClick={() => toggleCategory(category)}
                                className="w-full flex justify-between items-center p-4 bg-indigo-100 hover:bg-indigo-200 transition font-extrabold text-indigo-800"
                            >
                                {category} ({categorizedItems[category].length})
                                <svg className={`w-5 h-5 transition-transform ${expandedCategories[category] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>

                            {expandedCategories[category] && (
                                <div className="p-3 space-y-2">
                                    {categorizedItems[category].map((item, index) => (
                                        <div 
                                            key={index} 
                                            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition ${item.isChecked ? 'bg-green-50 opacity-80 line-through' : 'bg-gray-50 hover:bg-gray-100'}`}
                                            onClick={() => handleCheckItem(planData.shoppingList.findIndex(i => i.item === item.item && i.quantity === item.quantity))}
                                        >
                                            <div className="flex flex-col">
                                                <span className={`font-semibold text-base ${item.isChecked ? 'text-green-700' : 'text-gray-800'}`}>
                                                    {item.item}
                                                </span>
                                                <span className={`text-sm ${item.isChecked ? 'text-green-600' : 'text-gray-500'}`}>
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
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // B. Review View (Feature B: Calendar View, Feature D: Preference Refinement)
    const ReviewView = () => (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex justify-between items-center">
                Weekly Meal Plan
                <button
                    onClick={handleSharePlan}
                    disabled={isLoading}
                    className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition shadow-md disabled:opacity-50"
                >
                    {shareLink ? 'Link Copied!' : 'Share Plan'}
                </button>
            </h2>

            {/* Feature D: Temporary Constraint Input */}
            {planData && (
                <div className="bg-yellow-50 p-4 rounded-lg mb-6 border border-yellow-300">
                    <label className="block text-sm font-bold text-yellow-800 mb-1">
                        Temporary Regeneration Constraint (Optional)
                    </label>
                    <textarea
                        value={tempConstraint}
                        onChange={(e) => setTempConstraint(e.target.value)}
                        rows="1"
                        placeholder="e.g., must use up leftover chicken breast or need low-carb Tuesday"
                        className="w-full p-2 border border-yellow-200 rounded-lg text-sm focus:ring-yellow-500"
                    />
                </div>
            )}

            {mealsToRegenerate.length > 0 && (
                <button 
                    onClick={() => processPlanGeneration(true)}
                    className="mb-6 w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg"
                >
                    Regenerate {mealsToRegenerate.length} Selected Meal(s)
                </button>
            )}
            
            {/* Feature B: Calendar Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {planData.weeklyPlan.map((meal, index) => {
                    const isSelected = mealsToRegenerate.includes(index);
                    return (
                    <div key={index} 
                         className={`bg-white p-4 rounded-xl shadow-md flex flex-col justify-between h-48 transition duration-150 ${isSelected ? 'border-4 border-yellow-500 ring-2 ring-yellow-300' : 'border-b-4 border-indigo-500'}`}>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h3 className="text-sm font-extrabold text-indigo-700">{meal.day}</h3>
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleMealSelection(index)}
                                    className="h-4 w-4 text-yellow-500 rounded border-gray-300 focus:ring-yellow-500"
                                />
                            </div>
                            <p className="text-base font-semibold text-gray-800 mt-1">{meal.meal}</p>
                            <p className="text-gray-500 text-xs mt-1 overflow-hidden h-10">{meal.description}</p>
                        </div>
                        <button 
                            onClick={() => handleSelectMeal(index)}
                            className="mt-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 text-xs rounded-lg shadow transition w-full"
                        >
                            Get Recipe & Time
                        </button>
                    </div>
                );})}
            </div>
            
            <button 
                onClick={() => setView('planning')}
                className="mt-8 w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg"
            >
                Start Over with New Preferences
            </button>
        </div>
    );

    // C. Timing View (unchanged)
    const TimingView = () => {
        const meal = planData.weeklyPlan[selectedMealIndex];
        return (
            <div className="p-8 bg-indigo-50 rounded-xl shadow-inner text-center">
                <h2 className="text-3xl font-bold text-indigo-800 mb-2">Detailed Planning for {meal.day}</h2>
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
                    onClick={() => generateRecipeDetail(false)} 
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition shadow-lg disabled:opacity-50"
                >
                    Generate Timeline & Recipe
                </button>
            </div>
        );
    };
    
    // D. Detail View (Feature C: Conversion Utility)
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

                {/* Timeline Section */}
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
                
                {/* Ingredients Section (Feature C: Conversion) */}
                <div>
                    <h3 className="text-3xl font-bold text-gray-800 mb-5 border-b pb-2">Full Ingredient List</h3>
                    <ul className="list-disc list-inside space-y-2 text-lg text-gray-700 pl-4 bg-gray-50 p-4 rounded-lg">
                        {ingredients.map((item, index) => {
                            // Simple parsing to extract value and unit
                            const match = item.match(/(\d+\.?\d*)\s*(\w+)/);
                            const conversionText = match ? convertIngredient(parseFloat(match[1]), match[2]) : '';
                            return (
                                <li key={index} className="border-b border-gray-200 last:border-b-0 pb-2">
                                    {item}
                                    {conversionText && <span className="text-sm text-indigo-400 font-medium ml-2">{conversionText}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Instructions Section */}
                <div>
                    <h3 className="3xl font-bold text-gray-800 mb-5 border-b pb-2">Cooking Instructions</h3>
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

    // E. Favorites View (Feature E: Repetition Tracking)
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
                                    Saved: {new Date(fav.savedAt).toLocaleDateString()}
                                    {fav.lastUsed && (
                                        <span className="ml-2 font-medium text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                            Last Used: {new Date(fav.lastUsed).toLocaleDateString()}
                                        </span>
                                    )}
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
    if (!isAuthReady) {
         content = (
            <div className="flex flex-col items-center justify-center py-20">
                <svg className="animate-spin h-8 w-8 text-indigo-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <p className="text-gray-600 font-semibold">Connecting to Database...</p>
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
    
    // F. Global Layout
    
    const isDinnerPlanActive = ['review', 'timing', 'detail'].includes(view);
    
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-6 sm:p-10">
                <header className="text-center mb-10 border-b pb-4">
                    <h1 className="text-4xl font-extrabold text-indigo-700">
                        My Family Dinners
                    </h1>
                    <p className="text-gray-500 mt-2">Plan, Shop, and Cook with Precision</p>
                </header>

                {/* Navigation and Content Switch */}
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

                {/* Main Content Area */}
                <div className="mt-8">
                    {error && (
                        <div className="p-4 mb-4 text-center bg-red-100 text-red-700 rounded-lg shadow-md">
                            <p className="font-bold">Error:</p>
                            <p>{error}</p>
                        </div>
                    )}
                    
                    {content}
                </div>

            </div>
        </div>
    );
};

export default App;