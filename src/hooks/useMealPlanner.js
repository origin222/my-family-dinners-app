import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { doc, setDoc } from 'firebase/firestore';
import { mergeShoppingLists } from '../utils/helpers';

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";
const finalGeminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

const MEAL_PLAN_DOC_ID = 'current_plan';

// --- JSON SCHEMAS ---
const PLAN_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "weeklyPlan": { type: "ARRAY", items: { type: "OBJECT", properties: { "day": { "type": "STRING" }, "meal": { "type": "STRING" }, "description": { "type": "STRING" }, "calories": { "type": "NUMBER" }, "protein": { "type": "NUMBER" }, "carbs": { "type": "NUMBER" }, "fats": { "type": "NUMBER" } } } }, "shoppingList": { type: "ARRAY", items: { type: "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "category": { "type": "STRING" }, "isChecked": { "type": "BOOLEAN" } } } } } };
const RECIPE_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "recipeName": { "type": "STRING" }, "prepTimeMinutes": { "type": "NUMBER" }, "cookTimeMinutes": { "type": "NUMBER" }, "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } }, "timeline": { type: "ARRAY", items: { "type": "OBJECT", "properties": { "minutesBefore": { "type": "NUMBER" }, "action": { "type": "STRING" } } } }, "instructions": { "type": "ARRAY", "items": { "type": "STRING" } } } };

export const useMealPlanner = (db, userId, appId) => {
    const [isLoading, setIsLoading] = useState(null);
    const [error, setError] = useState(null);

    const retryFetch = useCallback(async (url, options, maxRetries = 3) => {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status < 500 && response.status !== 429) {
                    return response;
                }
                lastError = new Error(`API request failed with status ${response.status}`);
            } catch (error) {
                lastError = error;
            }
            if (i === maxRetries - 1) {
                throw lastError;
            }
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        throw new Error("Exhausted retries without a conclusive response or error.");
    }, []);
    
    const processPlanGeneration = useCallback(async ({isRegeneration, query, planData, mealsToRegenerate, regenerationConstraint, useFavorites, selectedFavorites, setView, setMealsToRegenerate}) => {
        if (!db || !userId) { toast.error("Not connected to the database. Please refresh."); return; }
        if (isLoading) return;
        if (!query.trim() && !isRegeneration) { toast.error("Please enter your family's preferences first."); return; }
        setIsLoading(true);
        setError(null);
        let systemPrompt;
        let userPrompt = "Generate the complete weekly dinner plan and consolidated shopping list.";
        const macroInstruction = "For each meal, you MUST provide an estimated nutritional breakdown PER SERVING including 'calories', 'protein', 'carbs', and 'fats' as numbers. Infer serving size from user query.";
        let favoritesInstruction = '';
        if (useFavorites && selectedFavorites.length > 0) {
            const favoriteMealsStr = selectedFavorites.join(', ');
            favoritesInstruction = `You MUST include the following meals in the plan: ${favoriteMealsStr}. Generate new and creative meals for the remaining days.`;
        }

        if (isRegeneration && planData) {
            const mealsToUpdate = mealsToRegenerate.map(index => planData.weeklyPlan[index].day).join(', ');
            const unchangedMeals = planData.weeklyPlan.filter((_, index) => !mealsToRegenerate.includes(index)).map(meal => `${meal.day}: ${meal.meal}`).join('; ');
            systemPrompt = `You are updating a meal plan. New meals must follow this constraint: ${regenerationConstraint || 'None'}. Generate NEW meals for: ${mealsToUpdate}. Keep these meals: ${unchangedMeals}. ${macroInstruction} ${favoritesInstruction}`;
            userPrompt = `Replace meals for ${mealsToUpdate}. Return the full 7-day plan and a new consolidated shopping list.`;
        } else {
            systemPrompt = `You are a meal planner. Generate a 7-day dinner plan and shopping list based on: "${query.trim()}". ${macroInstruction} ${favoritesInstruction}`;
        }
        
        try {
            const payload = { contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json", responseSchema: PLAN_RESPONSE_SCHEMA } };
            const url = `${API_URL}?key=${finalGeminiApiKey}`;
            const response = await retryFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(errorBody?.error?.message || response.statusText);
            }
            const result = await response.json();
            const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonString) { throw new Error("AI response was empty."); }
            const parsedPlan = JSON.parse(jsonString);
            const mergedList = mergeShoppingLists(parsedPlan.shoppingList, planData?.shoppingList);
            const newPlanData = { ...parsedPlan, shoppingList: mergedList, initialQuery: query.trim() };
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
            await setDoc(docRef, newPlanData);
            setView('review');
        } catch (e) {
            console.error("Plan Generation Error:", e);
            toast.error(`Failed to generate plan: ${e.message}`);
        } finally {
            setIsLoading(false);
            if (setMealsToRegenerate) setMealsToRegenerate([]);
        }
    }, [db, userId, retryFetch]);

    const generateRecipeDetail = useCallback(async ({planData, selectedMealIndex, dinnerTime, setDetailedRecipe, setView}) => {
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
    }, [db, userId, retryFetch]);

    return { isLoading, error, processPlanGeneration, generateRecipeDetail };
};