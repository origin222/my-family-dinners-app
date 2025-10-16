import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from 'firebase/firestore';

// --- CONFIGURATION ---
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

// Environment Variables
const VERCEL_APP_ID = import.meta.env.VITE_APP_ID;
const VERCEL_FIREBASE_CONFIG_STRING = import.meta.env.VITE_FIREBASE_CONFIG;
const GEMINI_API_KEY_ENV = import.meta.env.VITE_GEMINI_API_KEY;

const appId = VERCEL_APP_ID || 'default-app-id';
let firebaseConfig = {};
let finalGeminiApiKey = GEMINI_API_KEY_ENV || "";
let firebaseParseError = null;

try {
    if (VERCEL_FIREBASE_CONFIG_STRING) {
        firebaseConfig = JSON.parse(VERCEL_FIREBASE_CONFIG_STRING);
    }
} catch (e) {
    firebaseParseError = e.message;
    console.error("CRITICAL: Error parsing VITE_FIREBASE_CONFIG JSON:", e);
}

// Firestore Collection Constants
const MEAL_PLAN_DOC_ID = 'current_plan';
const FAVORITES_COLLECTION_NAME = 'favorites';
const SHARED_PLANS_COLLECTION_NAME = 'public/data/shared_plans';

// --- JSON SCHEMAS (UNCHANGED) ---
const PLAN_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        "weeklyPlan": { type: "ARRAY", items: { type: "OBJECT", properties: { "day": { "type": "STRING" }, "meal": { "type": "STRING" }, "description": { "type": "STRING" }, "calories": { "type": "STRING" }, "protein": { "type": "STRING" }, "carbs": { "type": "STRING" }, "fats": { "type": "STRING" } } } },
        "shoppingList": { type: "ARRAY", items: { type: "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "category": { "type": "STRING" }, "isChecked": { "type": "BOOLEAN" } } } }
    }
};
const RECIPE_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "recipeName": { "type": "STRING" }, "prepTimeMinutes": { "type": "NUMBER" }, "cookTimeMinutes": { "type": "NUMBER" }, "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } }, "timeline": { type: "ARRAY", items: { "type": "OBJECT", "properties": { "minutesBefore": { "type": "NUMBER" }, "action": { "type": "STRING" } } } }, "instructions": { "type": "ARRAY", "items": { "type": "STRING" } } } };

// --- HELPER FUNCTIONS ---
const convertToActualTime = (targetTimeStr, minutesBefore) => { if (!targetTimeStr) return 'N/A'; const [hours, minutes] = targetTimeStr.split(':').map(Number); const targetDate = new Date(); targetDate.setHours(hours, minutes, 0, 0); const startTime = new Date(targetDate.getTime() - minutesBefore * 60000); const h = startTime.getHours(); const m = startTime.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'; const hour = h % 12 || 12; const minute = m < 10 ? '0' + m : m; return `${hour}:${minute} ${ampm}`; };
const mergeShoppingLists = (newShoppingList, oldShoppingList) => { if (!oldShoppingList) return newShoppingList; const oldListMap = new Map(); oldShoppingList.forEach(item => { const key = `${item.item}|${item.quantity}|${item.category}`; oldListMap.set(key, item.isChecked); }); return newShoppingList.map(newItem => { const key = `${newItem.item}|${newItem.quantity}|${newItem.category}`; const wasChecked = oldListMap.get(key); return { ...newItem, isChecked: wasChecked === true }; }); };
const convertIngredient = (ingredientString, targetUnit) => { if (!ingredientString) return { original: 'N/A', converted: 'N/A' }; const parts = ingredientString.toLowerCase().match(/(\d+\.?\d*)\s*([a-z]+)/); if (!parts) return { original: ingredientString, converted: ingredientString }; const value = parseFloat(parts[1]); const unit = parts[2].trim(); const UNIT_CONVERSIONS = { 'lb': { unit: 'kg', factor: 0.453592 }, 'oz': { unit: 'g', factor: 28.3495 }, 'cup': { unit: 'ml', factor: 236.588 }, 'tsp': { unit: 'ml', factor: 4.92892 }, 'tbsp': { unit: 'ml', factor: 14.7868 } }; if (targetUnit === 'metric') { const conversion = UNIT_CONVERSIONS[unit]; if (conversion) { const newValue = value * conversion.factor; return { original: `${value} ${unit}`, converted: `${newValue.toFixed(1)} ${conversion.unit}` }; } } return { original: ingredientString, converted: "N/A" }; };

// --- STABLE UI COMPONENTS ---
// All view components remain the same as the last complete version

// --- MAIN APP COMPONENT ---
const App = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isFirebaseInitialized, setIsFirebaseInitialized] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // --- DEBUG: Delay initialization to allow debug panel to render ---
        const timer = setTimeout(() => {
            if (Object.keys(firebaseConfig).length > 0) {
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
                            await signInAnonymously(authInstance);
                            setUserId(authInstance.currentUser?.uid || crypto.randomUUID());
                        }
                        setIsAuthReady(true);
                    });
                    return () => unsubscribe();
                } catch (e) {
                    console.error("Firebase Initialization Error:", e);
                    setError(`Failed to initialize Firebase: ${e.message}`);
                }
            } else {
                setError("Firebase config is missing or invalid. Check environment variables.");
            }
        }, 500); // Small delay
        return () => clearTimeout(timer);
    }, []);

    // ... (rest of your state and handlers) ...
    // NOTE: For brevity, the rest of the component logic is omitted here,
    // but should be the same as the last full version you have.
    // The key is the Debug Panel in the return statement below.
    
    const isConnecting = !isFirebaseInitialized || !isAuthReady;

    return (
        <div>
            {/* --- START DEBUG PANEL --- */}
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(255, 255, 0, 0.9)', color: 'black', padding: '10px', zIndex: 9999, borderBottom: '2px solid black', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                <p style={{ margin: 0, fontWeight: 'bold' }}>--- VERCEL DEBUG PANEL ---</p>
                <p style={{ margin: '5px 0' }}><strong>1. Raw VITE_FIREBASE_CONFIG string:</strong></p>
                <div style={{ background: '#f0f0f0', padding: '5px', border: '1px solid #ccc' }}>{VERCEL_FIREBASE_CONFIG_STRING || 'NOT FOUND / EMPTY'}</div>
                <p style={{ margin: '5px 0' }}><strong>2. JSON Parsing Status:</strong> {firebaseParseError ? `FAILED: ${firebaseParseError}` : 'Success'}</p>
                <p style={{ margin: '5px 0' }}><strong>3. Firebase Initialized:</strong> {isFirebaseInitialized ? 'Yes' : 'No'}</p>
                <p style={{ margin: '5px 0' }}><strong>4. Auth Ready (User ID):</strong> {isAuthReady ? `Yes (${userId})` : 'No'}</p>
            </div>
            {/* --- END DEBUG PANEL --- */}
            
            <div className="min-h-screen bg-base-200 p-4 sm:p-8 pt-40"> {/* Increased top padding to avoid overlap */}
                <Toaster position="top-right" />
                <div className="max-w-5xl mx-auto bg-base-100 rounded-box shadow-2xl p-6 sm:p-10">
                    {isConnecting ? (
                        <div className="text-center py-20">
                            <span className="loading loading-spinner loading-lg text-primary"></span>
                            <p className="mt-4 font-semibold">Connecting to Database...</p>
                            {error && <div className="alert alert-error mt-4"><span>{error}</span></div>}
                        </div>
                    ) : (
                        <div>
                            {/* The rest of your app's conditional rendering can go here */}
                            {/* For now, we're just focused on the debug panel */}
                            <h1 className="text-2xl font-bold">App Content Area</h1>
                            <p>If you see this, the main app is rendering below the debug panel.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;