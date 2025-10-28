import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, updateDoc, getDoc, serverTimestamp, addDoc } from 'firebase/firestore';

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
const ARCHIVED_PLANS_COLLECTION_NAME = 'archived_plans';

// --- JSON SCHEMAS ---
const PLAN_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "weeklyPlan": { type: "ARRAY", items: { type: "OBJECT", properties: { "day": { "type": "STRING" }, "meal": { "type": "STRING" }, "description": { "type": "STRING" }, "calories": { "type": "NUMBER" }, "protein": { "type": "NUMBER" }, "carbs": { "type": "NUMBER" }, "fats": { "type": "NUMBER" } } } }, "shoppingList": { type: "ARRAY", items: { type: "OBJECT", properties: { "item": { "type": "STRING" }, "quantity": { "type": "STRING" }, "category": { "type": "STRING" }, "isChecked": { "type": "BOOLEAN" } } } } } };
const RECIPE_RESPONSE_SCHEMA = { type: "OBJECT", properties: { "recipeName": { "type": "STRING" }, "prepTimeMinutes": { "type": "NUMBER" }, "cookTimeMinutes": { "type": "NUMBER" }, "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } }, "timeline": { type: "ARRAY", items: { "type": "OBJECT", "properties": { "minutesBefore": { "type": "NUMBER" }, "action": { "type": "STRING" } } } }, "instructions": { "type": "ARRAY", "items": { "type": "STRING" } } } };

// --- HELPER FUNCTIONS ---
const convertToActualTime = (targetTimeStr, minutesBefore) => { if (!targetTimeStr) return 'N/A'; const [hours, minutes] = targetTimeStr.split(':').map(Number); const targetDate = new Date(); targetDate.setHours(hours, minutes, 0, 0); const startTime = new Date(targetDate.getTime() - minutesBefore * 60000); const h = startTime.getHours(); const m = startTime.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'; const hour = h % 12 || 12; const minute = m < 10 ? '0' + m : m; return `${hour}:${minute} ${ampm}`; };
const mergeShoppingLists = (newShoppingList, oldShoppingList) => { if (!oldShoppingList) return newShoppingList; const oldListMap = new Map(); oldShoppingList.forEach(item => { const key = `${item.item}|${item.quantity}|${item.category}`; oldListMap.set(key, item.isChecked); }); return newShoppingList.map(newItem => { const key = `${newItem.item}|${newItem.quantity}|${newItem.category}`; const wasChecked = oldListMap.get(key); return { ...newItem, isChecked: wasChecked === true }; }); };
const convertIngredient = (ingredientString, targetUnit) => { if (!ingredientString) return { original: 'N/A', converted: 'N/A' }; const parts = ingredientString.toLowerCase().match(/(\d+\.?\d*)\s*([a-z]+)/); if (!parts) return { original: ingredientString, converted: ingredientString }; const value = parseFloat(parts[1]); const unit = parts[2].trim(); const UNIT_CONVERSIONS = { 'lb': { unit: 'kg', factor: 0.453592 }, 'oz': { unit: 'g', factor: 28.3495 }, 'cup': { unit: 'ml', factor: 236.588 }, 'tsp': { unit: 'ml', factor: 4.92892 }, 'tbsp': { unit: 'ml', factor: 14.7868 } }; if (targetUnit === 'metric') { const conversion = UNIT_CONVERSIONS[unit]; if (conversion) { const newValue = value * conversion.factor; return { original: `${value} ${unit}`, converted: `${newValue.toFixed(1)} ${conversion.unit}` }; } } return { original: ingredientString, converted: "N/A" }; };

// --- ANIMATION VARIANTS ---
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const cardVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };


const App = () => {
    // --- UI COMPONENTS (Defined inside App) ---
    const ThemeToggle = () => {
        const [theme, setTheme] = useState(localStorage.getItem('theme') ? localStorage.getItem('theme') : 'cupcake');
        useEffect(() => { document.querySelector('html').setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);
        const handleToggle = (e) => setTheme(e.target.checked ? 'dark' : 'cupcake');
        return ( <div className="flex items-center gap-2"> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg> <input type="checkbox" onChange={handleToggle} checked={theme === 'dark'} className="toggle theme-controller" /> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg> </div> );
    };

    const PlanSkeleton = () => ( <div> <h2 className="text-3xl font-bold mb-6">Generating Your Plan...</h2> <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"> {[...Array(6)].map((_, i) => ( <div key={i} className="flex flex-col gap-4 w-full"> <div className="skeleton h-36 w-full"></div> <div className="skeleton h-4 w-28"></div> <div className="skeleton h-4 w-full"></div> </div> ))} </div> </div> );

    const UnitConverter = ({ ingredients }) => { const [conversionType, setConversionType] = useState('metric'); return ( <div className="p-4 bg-base-200 rounded-box"> <div className="flex justify-between items-center mb-4 border-b pb-2"> <h4 className="text-xl font-bold">Unit Converter</h4> <select value={conversionType} onChange={(e) => setConversionType(e.target.value)} className="select select-bordered select-sm"> <option value="metric">To Metric (g/kg/ml)</option> <option value="imperial">To Imperial (lb/oz/cup)</option> </select> </div> <ul className="space-y-1 text-sm"> {ingredients.map((item, index) => { const conversion = convertIngredient(item, 'metric'); return ( <li key={index} className="flex justify-between border-b border-base-300 last:border-b-0 py-1"> <span>{item}</span> <span className="font-semibold text-accent">{conversion.converted}</span> </li> ); })} </ul> </div> ); };
    
    const PlanningView = ({ query, setQuery, useFavorites, setUseFavorites, processPlanGeneration, favorites, selectedFavorites, handleFavoriteSelection }) => (
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
                        placeholder="e.g., A family of 4 (2 adults, 2 kids), low-carb, no seafood..."
                        className="textarea textarea-bordered h-24 mt-2"
                    />
                </div>
                
                {favorites.length > 0 && (
                    <div className="form-control mt-4">
                        <label className="label cursor-pointer justify-start gap-4">
                            <input
                                type="checkbox"
                                checked={useFavorites}
                                onChange={(e) => setUseFavorites(e.target.checked)}
                                className="checkbox checkbox-secondary"
                            />
                            <span className="label-text">Incorporate my favorite meals</span>
                        </label>
                    </div>
                )}
    
                {useFavorites && favorites.length > 0 && (
                    <div className="mt-4 p-4 bg-base-100 rounded-box max-h-48 overflow-y-auto">
                        <p className="font-bold mb-2">Select favorites to include:</p>
                        <div className="space-y-2">
                            {favorites.map(fav => (
                                <div key={fav.id} className="form-control">
                                    <label className="label cursor-pointer justify-start gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedFavorites.includes(fav.recipeName)}
                                            onChange={() => handleFavoriteSelection(fav.recipeName)}
                                            className="checkbox checkbox-sm"
                                        />
                                        <span className="label-text">{fav.recipeName}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
    
                <button onClick={() => processPlanGeneration(false)} className="btn btn-primary w-full mt-6">Generate 7-Day Plan</button>
            </div>
        </div>
    );
	const ShoppingView = ({ planData, handleClearChecked, handleCheckItem, openCategory, setOpenCategory, setView, handleAddItem, handleDeleteItem, handlePrint }) => {
        const [newItemName, setNewItemName] = useState('');
        const [newItemQuantity, setNewItemQuantity] = useState('');
        const [newItemCategory, setNewItemCategory] = useState('Misc');

        const groupedList = useMemo(() => {
            const list = {};
            // FIX: Check if planData and shoppingList exist before processing
            if (planData?.shoppingList) {
                planData.shoppingList.forEach(item => {
                    const category = item.category || 'Uncategorized';
                    if (!list[category]) list[category] = [];
                    list[category].push(item);
                });
            }
            return list;
        }, [planData?.shoppingList]);

        useEffect(() => {
            const categories = Object.keys(groupedList).sort();
            if (categories.length > 0 && !categories.includes(openCategory)) {
                setOpenCategory(categories[0]);
            }
        }, [groupedList, openCategory, setOpenCategory]);
        
        const handleAddNewItem = (e) => {
            e.preventDefault();
            if (!newItemName.trim()) {
                toast.error("Please enter an item name.");
                return;
            }
            handleAddItem({ item: newItemName, quantity: newItemQuantity || '1', category: newItemCategory, isChecked: false, });
            setNewItemName('');
            setNewItemQuantity('');
        };

        const shoppingListExists = planData && planData.shoppingList && planData.shoppingList.length > 0;

        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-4">
                        <h2 className="text-3xl font-bold">Grocery Shopping List</h2>
                        {shoppingListExists && (
                            <button onClick={handlePrint} className="btn btn-ghost btn-sm no-print">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03-.48.062-.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.32 0c.662 0 1.18.568 1.12 1.227l-.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m0 0h11.32z" /></svg>
                                Print
                            </button>
                        )}
                    </div>
                    {shoppingListExists && (
                        <button onClick={handleClearChecked} disabled={!planData?.shoppingList?.some(i => i.isChecked)} className="btn btn-error btn-sm no-print">Clear Checked</button>
                    )}
                </div>

                <div className="no-print">
                    <form onSubmit={handleAddNewItem} className="bg-base-200 p-4 rounded-box mb-6 flex flex-col sm:flex-row gap-2 items-end">
                        <div className="form-control flex-grow"> <label className="label py-1"><span className="label-text">Item Name</span></label> <input type="text" placeholder="e.g., Milk" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="input input-bordered input-sm w-full" /> </div>
                        <div className="form-control"> <label className="label py-1"><span className="label-text">Quantity</span></label> <input type="text" placeholder="e.g., 1 gallon" value={newItemQuantity} onChange={(e) => setNewItemQuantity(e.target.value)} className="input input-bordered input-sm w-full" /> </div>
                        <div className="form-control"> <label className="label py-1"><span className="label-text">Category</span></label> <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} className="select select-bordered select-sm w-full"> <option>Produce</option> <option>Dairy</option> <option>Meat</option> <option>Pantry</option> <option>Frozen</option> <option>Bakery</option> <option>Misc</option> </select> </div>
                        <button type="submit" className="btn btn-primary btn-sm mt-2 sm:mt-0">Add Item</button>
                    </form>
                </div>
                
                {!shoppingListExists ? (
                    <div className="text-center p-10 bg-base-200 rounded-box no-print">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-base-content opacity-30 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c.51 0 .962-.344 1.087-.835l1.823-6.831a.75.75 0 00-.66-1.11H6.088L5.438 4.239A.75.75 0 004.658 3.5H3.75" /></svg>
                        <h3 className="text-xl font-bold">Your Shopping List is Empty</h3>
                        <p className="text-base-content/70 mt-2 mb-6">Generate a meal plan or add your own items to get started.</p>
                        <button onClick={() => setView('planning')} className="btn btn-primary">Create a New Plan</button>
                    </div>
                ) : (
                    <>
                        <div className="no-print space-y-2">
                            {Object.keys(groupedList).sort().map(category => (
                                <div key={category} className="collapse collapse-arrow bg-base-200">
                                    <input type="radio" name="shopping-accordion" checked={openCategory === category} onChange={() => setOpenCategory(category)} />
                                    <div className="collapse-title text-xl font-medium">{category} ({groupedList[category].length})</div>
                                    <div className="collapse-content">
                                        {groupedList[category].map((item, index) => {
                                            const globalIndex = planData.shoppingList.findIndex(i => i.item === item.item && i.quantity === item.quantity && i.category === item.category);
                                            return (
                                                <div key={`${globalIndex}-${index}`} className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition hover:bg-base-100`} onClick={() => handleCheckItem(globalIndex)}>
                                                    <div className="flex items-center gap-4">
                                                        <input type="checkbox" checked={item.isChecked} readOnly className="checkbox checkbox-primary" />
                                                        <div className={`${item.isChecked ? 'opacity-50 line-through' : ''}`}> <span className="font-semibold">{item.item}</span> <span className="text-xs opacity-70 block">{item.quantity}</span> </div>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(globalIndex); }} className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg> </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div id="printable-shopping-list" className="hidden print:block">
                            <h2 className="text-2xl font-bold text-center mb-4">My Family Dinners - Shopping List</h2>
                            {Object.keys(groupedList).sort().map(category => (
                                <div key={category} className="print-list-category">
                                    <h3 className="text-lg font-bold mb-2">{category}</h3>
                                    <ul>
                                        {groupedList[category].map((item, index) => (
                                            <li key={index} className="print-list-item">{item.item} <span className="text-gray-500 text-sm">({item.quantity})</span></li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                            <div className="print-notes-section">
                                <h3>Notes:</h3>
                                <div /><div /><div /><div /><div />
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const ReviewView = ({ planData, mealsToRegenerate, regenerationConstraint, setRegenerationConstraint, processPlanGeneration, toggleMealSelection, handleSelectMeal, generateShareLink, handleStartOver, handleArchivePlan }) => (
        <motion.div initial="hidden" animate="visible" variants={containerVariants}>
            <h2 className="text-3xl font-bold mb-6">Review & Select Meals</h2>
            <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-end">
                {mealsToRegenerate.length > 0 && ( <input type="text" placeholder="e.g., Use leftover chicken..." value={regenerationConstraint} onChange={(e) => setRegenerationConstraint(e.target.value)} className="input input-bordered w-full" /> )}
                <button onClick={() => processPlanGeneration(true)} disabled={mealsToRegenerate.length === 0} className="btn btn-accent flex-shrink-0">
                    Regenerate {mealsToRegenerate.length || ''} Meal(s)
                </button>
            </div>
            <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" variants={containerVariants}>
                {planData.weeklyPlan.map((meal, index) => {
                    const isSelected = mealsToRegenerate.includes(index);
                    return (
                        <motion.div key={index} variants={cardVariants} className={`card bg-base-100 shadow-xl transition-all duration-300 ${isSelected ? 'border-2 border-accent' : ''}`}>
                            <div className="card-body">
                                <h3 className="card-title text-primary">{meal.day}</h3>
                                <p className="font-semibold text-lg">{meal.meal}</p>
                                <p className="text-sm opacity-70 flex-grow">{meal.description}</p>
                                {meal.calories && ( <div className="mt-4 grid grid-cols-2 gap-2 text-xs"> <div className="badge badge-outline">{meal.calories} cal</div> <div className="badge badge-outline badge-primary">{meal.protein}g protein</div> <div className="badge badge-outline badge-secondary">{meal.carbs}g carbs</div> <div className="badge badge-outline badge-accent">{meal.fats}g fat</div> </div> )}
                                <div className="card-actions justify-between items-center mt-4 pt-4 border-t border-base-300">
                                    <label className="label cursor-pointer gap-2">
                                        <input type="checkbox" checked={isSelected} onChange={() => toggleMealSelection(index)} className="checkbox checkbox-accent" />
                                        <span className="label-text">Replace</span>
                                    </label>
                                    <button onClick={() => handleSelectMeal(index)} className="btn btn-secondary btn-sm gap-2"> <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> Get Recipe </button>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button onClick={handleArchivePlan} className="btn btn-info">Archive Plan</button>
                <button onClick={generateShareLink} className="btn btn-primary">Share Plan</button>
                <button onClick={handleStartOver} className="btn btn-error">Start Over</button>
            </div>
        </motion.div>
    );
};
const TimingView = ({ meal, dinnerTime, setDinnerTime, generateRecipeDetail, isLoading }) => (
        <div className="p-8 bg-base-200 rounded-box text-center">
            <h2 className="text-3xl font-bold mb-2">Planning Timeline for {meal.day}</h2>
            <p className="text-xl mb-6">Meal: <span className="font-bold">{meal.meal}</span></p>
            <div className="form-control w-full max-w-xs mx-auto">
                <label className="label"><span className="label-text">What time is dinner?</span></label>
                <input type="time" value={dinnerTime} onChange={(e) => setDinnerTime(e.target.value)} step="300" className="input input-bordered text-center text-2xl font-mono" />
            </div>
            <button onClick={generateRecipeDetail} disabled={isLoading} className="btn btn-success mt-6 w-full max-w-xs">Generate Timeline & Recipe</button>
        </div>
    );

    const DetailView = ({ detailedRecipe, favorites, handleToggleFavorite, handlePrint, setView, enterCookingMode }) => {
        if (!detailedRecipe) return <p className="text-center text-error">Error loading recipe.</p>;
        const { recipeName, prepTimeMinutes, cookTimeMinutes, ingredients, timeline, instructions, dinnerTime } = detailedRecipe;
        const targetTimeDisplay = convertToActualTime(dinnerTime, 0);
        const isFavorite = favorites.some(fav => fav.recipeName === recipeName);
        return (
            <div id="printable-recipe">
                <header className="text-center border-b border-base-300 pb-4">
                    <h2 className="text-4xl font-extrabold text-primary">{recipeName}</h2>
                    <p className="text-xl text-success mt-2 font-medium">Dinner Ready At: {targetTimeDisplay}</p>
                    <p className="opacity-70 mt-1">Prep: {prepTimeMinutes} mins | Cook: {cookTimeMinutes} mins</p>
                    
                    <div className="mt-6 no-print">
                        <button onClick={enterCookingMode} className="btn btn-lg btn-accent gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                            Start Cooking
                        </button>
                    </div>

                    <div className="flex justify-center items-center gap-4 mt-4 no-print">
                        <button onClick={handleToggleFavorite} className={`btn btn-sm gap-2 ${isFavorite ? 'btn-error' : 'btn-secondary'}`}>
                            {isFavorite ? ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg> ) : ( <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg> )}
                            <span>{isFavorite ? 'Remove Favorite' : 'Save Favorite'}</span>
                        </button>
                        <button onClick={handlePrint} className="inline-flex items-center justify-center gap-2 text-sm h-8 px-3 rounded-lg hover:bg-base-200 transition-colors no-print">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03-.48.062-.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.32 0c.662 0 1.18.568 1.12 1.227l-.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m0 0h11.32z" /></svg>
                            <span>Print</span>
                        </button>
                    </div>
                </header>
                <div className="space-y-10 mt-10">
                    <div className="printable-section"> <h3 className="text-3xl font-bold mb-5">Step-by-Step Timeline</h3> <ul className="steps steps-vertical w-full"> {timeline.sort((a,b) => b.minutesBefore - a.minutesBefore).map((step, index) => ( <li key={index} data-content="●" className="step step-primary"> <div className="text-left p-2 w-full"> <p className="font-bold text-lg">{convertToActualTime(dinnerTime, step.minutesBefore)}</p> <p className="text-sm opacity-80">{step.action}</p> </div> </li> ))} </ul> </div>
                    <div className="printable-section"> <h3 className="text-3xl font-bold mb-5">Ingredients</h3> <ul className="list-disc list-inside space-y-2 text-lg p-4 bg-base-200 rounded-box"> {ingredients.map((item, index) => ( <li key={index}>{item}</li> ))} </ul> </div>
                    <div className="no-print"><UnitConverter ingredients={ingredients} /></div>
                    <div className="printable-section"> <h3 className="text-3xl font-bold mb-5">Instructions</h3> <ol className="list-decimal list-inside space-y-4"> {instructions.map((step, index) => ( <li key={index}><span>{step}</span></li> ))} </ol> </div>
                    <button onClick={() => setView('review')} className="btn btn-primary w-full mt-8 no-print">Back to Meal Plan</button>
                </div>
            </div>
        );
    };

    const FavoritesView = ({ favorites, deleteFavorite, loadFavorite, setView }) => (
        <div>
            <h2 className="text-3xl font-bold mb-6">Your Saved Favorites ({favorites.length})</h2>
            <div className="space-y-4">
                {favorites.length === 0 ? (
                    <div className="text-center p-10 bg-base-200 rounded-box">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-base-content opacity-30 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                        <h3 className="text-xl font-bold">Your Cookbook is Empty</h3>
                        <p className="text-base-content/70 mt-2 mb-6">Find a meal you love and save its recipe here for later.</p>
                        <button onClick={() => setView('review')} className="btn btn-primary">Browse Meal Plan</button>
                    </div>
                ) : (
                    favorites.map((fav) => (
                        <div key={fav.id} className="card card-side bg-base-100 shadow-md">
                            <div className="card-body">
                                <h3 className="card-title text-secondary">{fav.recipeName}</h3>
                                <p className="text-sm opacity-70">Last Made: {fav.lastUsed ? new Date(fav.lastUsed).toLocaleDateString() : 'Never'}</p>
                                <div className="card-actions justify-end">
                                    <button onClick={() => deleteFavorite(fav.id, fav.recipeName)} className="btn btn-ghost btn-sm">Delete</button>
                                    <button onClick={() => loadFavorite(fav)} className="btn btn-primary btn-sm">View Recipe</button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const ShareView = ({ sharedPlan, setView }) => {
        if (!sharedPlan) {
            return <div className="text-center py-20"><span className="loading loading-spinner loading-lg"></span><p>Loading shared plan...</p></div>;
        }

        return (
            <div>
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold">A Meal Plan Shared by a Friend</h2>
                    <p className="text-base-content/70 mt-2">Based on the preference: "{sharedPlan.initialQuery}"</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sharedPlan.weeklyPlan.map((meal, index) => (
                        <div key={index} className="card bg-base-100 shadow-xl">
                            <div className="card-body">
                                <h3 className="card-title text-primary">{meal.day}</h3>
                                <p className="font-semibold text-lg">{meal.meal}</p>
                                <p className="text-sm opacity-70">{meal.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <button onClick={() => { setView('planning'); window.history.pushState({}, '', '/'); }} className="btn btn-primary w-full mt-8">Create Your Own Plan</button>
            </div>
        );
    };

    const CookingView = ({ recipe, onExit }) => {
        const [step, setStep] = useState(0);
        const [wakeLock, setWakeLock] = useState(null);
        const stepRefs = useRef([]);

        const acquireWakeLock = useCallback(async () => {
            if ('wakeLock' in navigator) {
                try {
                    const lock = await navigator.wakeLock.request('screen');
                    setWakeLock(lock);
                    console.log('Screen Wake Lock is active.');
                } catch (err) {
                    console.error(`${err.name}, ${err.message}`);
                }
            }
        }, []);

        const handleVisibilityChange = useCallback(() => {
            if (document.visibilityState === 'visible') {
                acquireWakeLock();
            }
        }, [acquireWakeLock]);

        useEffect(() => {
            acquireWakeLock();
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => {
                if (wakeLock !== null && wakeLock.released === false) {
                    wakeLock.release().then(() => setWakeLock(null));
                }
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }, [acquireWakeLock, wakeLock, handleVisibilityChange]);

        const instructions = recipe.instructions || [];
        const totalSteps = instructions.length;

        useEffect(() => {
            stepRefs.current[step]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, [step]);

        const nextStep = () => { if (step < totalSteps - 1) setStep(step + 1); };
        const prevStep = () => { if (step > 0) setStep(step - 1); };

        return ( <div className="fixed inset-0 bg-base-100 z-50 flex flex-col"> <header className="sticky top-0 bg-base-100/80 backdrop-blur-sm p-4 border-b border-base-300 no-print z-10"> <div className="max-w-4xl mx-auto flex justify-between items-center"> <h2 className="text-xl sm:text-2xl font-bold text-primary truncate">{recipe.recipeName}</h2> <button onClick={onExit} className="btn btn-error btn-sm">Exit</button> </div> </header> <main className="flex-grow overflow-y-auto p-4 sm:p-8"> <div className="max-w-2xl mx-auto"> <ol className="space-y-8"> {instructions.map((instruction, index) => { const isCurrentStep = index === step; return ( <li key={index} ref={el => stepRefs.current[index] = el} className={`p-6 rounded-box transition-all duration-300 ${isCurrentStep ? 'bg-primary/10 border-2 border-primary' : 'bg-base-200'}`}> <div className="flex items-center gap-4"> <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${isCurrentStep ? 'bg-primary text-primary-content' : 'bg-base-300'}`}> {index + 1} </div> <p className={`text-xl sm:text-2xl leading-relaxed ${isCurrentStep ? 'font-semibold' : 'opacity-70'}`}> {instruction} </p> </div> </li> ); })} </ol> </div> </main> <footer className="sticky bottom-0 bg-base-100/80 backdrop-blur-sm p-4 border-t border-base-300 no-print z-10"> <div className="max-w-4xl mx-auto flex justify-between items-center"> <button onClick={prevStep} disabled={step === 0} className="btn btn-lg">Previous</button> <div className="font-semibold text-sm">{step + 1} / {totalSteps}</div> <button onClick={nextStep} disabled={step >= totalSteps - 1} className="btn btn-primary btn-lg">Next</button> </div> </footer> </div> );
    };

    const ArchivedPlansView = ({ archivedPlans, loadArchivedPlan, deleteArchivedPlan, setView }) => {
        const [currentPage, setCurrentPage] = useState(1);
        const PLANS_PER_PAGE = 5;

        const sortedPlans = useMemo(() => 
            [...archivedPlans].sort((a, b) => (b.savedAt?.seconds || 0) - (a.savedAt?.seconds || 0)), 
        [archivedPlans]);

        const totalPages = Math.ceil(sortedPlans.length / PLANS_PER_PAGE);
        const startIndex = (currentPage - 1) * PLANS_PER_PAGE;
        const endIndex = startIndex + PLANS_PER_PAGE;
        const currentPlans = sortedPlans.slice(startIndex, endIndex);

        const Pagination = () => { if (totalPages <= 1) return null; return ( <div className="flex justify-center mt-8"> <div className="join"> {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => ( <button key={page} className={`join-item btn ${page === currentPage ? 'btn-primary' : ''}`} onClick={() => setCurrentPage(page)}> {page} </button> ))} </div> </div> ); };

        return ( <div> <h2 className="text-3xl font-bold mb-6">Your Archived Plans ({archivedPlans.length})</h2> <div className="space-y-4"> {archivedPlans.length === 0 ? ( <div className="text-center p-10 bg-base-200 rounded-box"> <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-base-content opacity-30 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v.001c0 .621.504 1.125 1.125 1.125z" /></svg> <h3 className="text-xl font-bold">No Archived Plans</h3> <p className="text-base-content/70 mt-2 mb-6">When you have a weekly plan you love, you can save it here.</p> <button onClick={() => setView('planning')} className="btn btn-primary">Create a New Plan</button> </div> ) : ( currentPlans.map((plan) => ( <div key={plan.id} className="card card-side bg-base-100 shadow-md"> <div className="card-body"> <p className="text-sm opacity-70">Saved on: {plan.savedAt ? new Date(plan.savedAt.seconds * 1000).toLocaleDateString() : 'Date not available'}</p> <div className="my-2"> <p className="font-bold text-secondary mb-2">Meals in this Plan:</p> <ul className="list-disc list-inside text-sm text-base-content/80 space-y-1"> {plan.weeklyPlan.slice(0, 4).map((meal, index) => ( <li key={index} className="truncate">{meal.meal}</li> ))} {plan.weeklyPlan.length > 4 && ( <li className="list-none text-xs opacity-60">...and {plan.weeklyPlan.length - 4} more</li> )} </ul> </div> <div className="card-actions justify-end"> <button onClick={() => deleteArchivedPlan(plan.id)} className="btn btn-ghost btn-sm">Delete</button> <button onClick={() => loadArchivedPlan(plan)} className="btn btn-primary btn-sm">Load Plan</button> </div> </div> </div> )) )} </div> <Pagination /> </div> );
    };
	// --- STATE ---
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
    const [isLoading, setIsLoading] = useState(false); // Use a single loading state
    const [error, setError] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [regenerationConstraint, setRegenerationConstraint] = useState('');
    const [openShoppingCategory, setOpenShoppingCategory] = useState(null);
    const [useFavorites, setUseFavorites] = useState(false);
    const [selectedFavorites, setSelectedFavorites] = useState([]);
    const [isCooking, setIsCooking] = useState(false);
    const [archivedPlans, setArchivedPlans] = useState([]);
    const [sharedPlan, setSharedPlan] = useState(null);


    const enterCookingMode = useCallback(() => setIsCooking(true), []);
    const exitCookingMode = useCallback(() => setIsCooking(false), []);

    const handleFavoriteSelection = useCallback((mealName) => {
        setSelectedFavorites(prev => 
            prev.includes(mealName) 
                ? prev.filter(name => name !== mealName)
                : [...prev, mealName]
        );
    }, []);

    const updateShoppingList = useCallback(async (updatedList) => {
        if (!db || !userId) return;
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
        // This check is crucial. If planData is null, it means we are adding to an empty list.
        if (planData) {
            try { await updateDoc(docRef, { shoppingList: updatedList }); } 
            catch (e) { console.error("Firestore Update Error:", e); toast.error("Could not update shopping list."); }
        } else {
            // Create a new plan document if one doesn't exist
            const newPlan = { weeklyPlan: [], shoppingList: updatedList, initialQuery: 'Manual Additions' };
            try { await setDoc(docRef, newPlan); }
            catch (e) { console.error("Firestore Set Error:", e); toast.error("Could not create shopping list."); }
        }
    }, [db, userId, planData, appId]);

    const handleAddItem = useCallback((newItem) => {
        const currentList = planData ? planData.shoppingList : [];
        const updatedList = [...currentList, newItem];
        updateShoppingList(updatedList);
        toast.success(`"${newItem.item}" added to shopping list!`);
    }, [planData, updateShoppingList]);

    const handleDeleteItem = useCallback((indexToDelete) => {
        if (!planData) return;
        const itemToDelete = planData.shoppingList[indexToDelete];
        const updatedList = planData.shoppingList.filter((_, index) => index !== indexToDelete);
        updateShoppingList(updatedList);
        toast.success(`"${itemToDelete.item}" removed.`);
    }, [planData, updateShoppingList]);
    
    const handleSelectMeal = useCallback((index) => { setSelectedMealIndex(index); setDetailedRecipe(null); setView('timing'); }, []);
    const toggleMealSelection = useCallback((index) => { setMealsToRegenerate(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]); }, []);
    const handleStartOver = useCallback(async () => { if (!db || !userId) return; if (window.confirm("Are you sure?")) { const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID); try { await deleteDoc(docRef); toast.success("Plan deleted."); } catch (e) { toast.error("Could not delete plan."); } } }, [db, userId, appId]);
    const handlePrint = useCallback(() => { window.print(); }, []);
    const handleCheckItem = useCallback((index) => { if (!planData) return; const newShoppingList = [...planData.shoppingList]; newShoppingList[index].isChecked = !newShoppingList[index].isChecked; updateShoppingList(newShoppingList); }, [planData, updateShoppingList]);
    const handleClearChecked = useCallback(() => { if (!planData) return; const uncheckedList = planData.shoppingList.filter(item => !item.isChecked); updateShoppingList(uncheckedList); toast.success('Checked items cleared!'); }, [planData, updateShoppingList]);
    const loadFavorite = useCallback(async (favorite) => { setDetailedRecipe(favorite); setDinnerTime(favorite.dinnerTime || '19:00'); setView('detail'); if (favorite.id) { const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, favorite.id); try { await updateDoc(docRef, { lastUsed: new Date().toISOString() }); } catch (e) { console.error("Error updating lastUsed timestamp:", e); } } }, [db, userId, appId]);
    const deleteFavorite = useCallback(async (id, name) => { if (!db || !userId) return; if (window.confirm("Are you sure?")) { const docRef = doc(db, 'artifacts', appId, 'users', userId, FAVORITES_COLLECTION_NAME, id); try { await deleteDoc(docRef); toast.success(`"${name}" deleted.`); } catch (e) { toast.error("Failed to delete."); } } }, [db, userId, appId]);
    const generateShareLink = useCallback(async () => { if (!db || !userId || !planData) return; const shareDocRef = doc(db, 'artifacts', appId, 'users', userId, SHARED_PLANS_COLLECTION_NAME, userId); const publicPlanData = { weeklyPlan: planData.weeklyPlan, initialQuery: planData.initialQuery, userId: userId, userName: "A Friend", sharedAt: new Date().toISOString(), }; try { await setDoc(shareDocRef, publicPlanData); const url = `${window.location.origin}/share/${userId}`; toast((t) => ( <div className="flex flex-col gap-2"> <span className="text-sm font-semibold">Shareable link!</span> <div className="flex gap-2"> <input type="text" value={url} readOnly className="input input-bordered input-sm w-full" /> <button className="btn btn-sm btn-primary" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied!', { id: t.id }); }}>Copy</button> </div> </div> ), { duration: 6000 }); } catch (e) { toast.error("Failed to generate link."); } }, [db, userId, planData, appId]);

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
    }, [db, userId, detailedRecipe, favorites, planData, selectedMealIndex, deleteFavorite, appId]);

    const handleArchivePlan = useCallback(async () => {
        if (!db || !userId || !planData) { toast.error("No plan to archive."); return; }
        const currentPlanString = JSON.stringify(planData.weeklyPlan);
        const isDuplicate = archivedPlans.some(p => JSON.stringify(p.weeklyPlan) === currentPlanString);

        if (isDuplicate) {
            toast.error("This plan has already been archived.");
            return;
        }
        const archiveCollectionRef = collection(db, 'artifacts', appId, 'users', userId, ARCHIVED_PLANS_COLLECTION_NAME);
        const newArchive = { ...planData, savedAt: serverTimestamp() };
        try {
            await addDoc(archiveCollectionRef, newArchive);
            toast.success("Plan archived successfully!");
        } catch (e) {
            console.error("Error archiving plan:", e);
            toast.error("Failed to archive plan.");
        }
    }, [db, userId, planData, archivedPlans, appId]);

    const loadArchivedPlan = useCallback(async (archivedPlan) => {
        if (!db || !userId) return;
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
        try {
            await setDoc(docRef, { weeklyPlan: archivedPlan.weeklyPlan, shoppingList: archivedPlan.shoppingList, initialQuery: archivedPlan.initialQuery });
            setView('review');
            toast.success("Archived plan loaded as current plan!");
        } catch(e) {
            toast.error("Failed to load archived plan.");
            console.error("Error loading archived plan:", e);
        }
    }, [db, userId, appId]);

    const deleteArchivedPlan = useCallback(async (id) => {
        if (!db || !userId) return;
        if (window.confirm("Are you sure you want to permanently delete this archived plan?")) {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, ARCHIVED_PLANS_COLLECTION_NAME, id);
            try {
                await deleteDoc(docRef);
                toast.success("Archived plan deleted.");
            } catch (e) {
                toast.error("Failed to delete archived plan.");
            }
        }
    }, [db, userId, appId]);
    
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
    
    const processPlanGeneration = useCallback(async (isRegeneration = false) => {
        if (!db || !userId) { toast.error("Not connected to the database. Please refresh."); return; }
        if (isLoading) return;
        if (!query.trim() && !isRegeneration) { toast.error("Please enter your family's preferences first."); return; }
        setIsLoading(true);
        setError(null);
        const oldPlan = planData;
        let systemPrompt;
        let userPrompt = "Generate the complete weekly dinner plan and consolidated shopping list.";
        const macroInstruction = "For each meal, you MUST provide an estimated nutritional breakdown PER SERVING including 'calories', 'protein', 'carbs', and 'fats' as numbers. Infer serving size from user query. Each 'meal' MUST be a specific, creative name (e.g., 'Sheet Pan Lemon Herb Chicken'), not a generic placeholder like 'Dinner' or 'Leftovers'.";
        let favoritesInstruction = '';
        if (useFavorites && selectedFavorites.length > 0) {
            const favoriteMealsStr = selectedFavorites.join(', ');
            favoritesInstruction = `You MUST include the following meals in the plan: ${favoriteMealsStr}. Generate new and creative meals for the remaining days.`;
        }

        if (isRegeneration && oldPlan) {
            const mealsToUpdate = mealsToRegenerate.map(index => oldPlan.weeklyPlan[index].day).join(', ');
            const unchangedMeals = oldPlan.weeklyPlan.filter((_, index) => !mealsToRegenerate.includes(index)).map(meal => `${meal.day}: ${meal.meal}`).join('; ');
            systemPrompt = `You are updating a meal plan. New meals must follow this constraint: ${regenerationConstraint || 'None'}. Generate NEW meals for: ${mealsToUpdate}. Keep these meals: ${unchangedMeals}. ${macroInstruction} ${favoritesInstruction}`;
            userPrompt = `Replace meals for ${mealsToUpdate}. Return the full 7-day plan and a new consolidated shopping list.`;
            setRegenerationConstraint('');
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
            const newShoppingList = parsedPlan.shoppingList || [];
            const mergedList = mergeShoppingLists(newShoppingList, planData?.shoppingList);
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
    }, [db, userId, query, planData, mealsToRegenerate, regenerationConstraint, retryFetch, useFavorites, selectedFavorites, isLoading]);

    const generateRecipeDetail = useCallback(async () => {
        if (!db || !userId) { toast.error("Not connected. Please refresh."); return; }
        if (isLoading) return;
        if (selectedMealIndex === null || !planData) { toast.error("Please select a meal first."); return; }
        setIsLoading(true);
        setError(null);
        const meal = planData.weeklyPlan[selectedMealIndex];
        const targetTime = convertToActualTime(dinnerTime, 0);
        const detailQuery = `Generate a full recipe for "${meal.meal}" based on: "${meal.description}". Also consider the original plan query: "${planData.initialQuery}". The meal must be ready at ${targetTime}. Provide a timeline using 'minutesBefore' (e.g., 60, 45, 10).`;
        const systemPrompt = "You are a chef. Provide precise recipe details and a reverse-engineered cooking timeline. Your ingredients list MUST be scaled to fit the user's original request (e.g., 'family of 4' or '100 adults') if it is present in the provided query.";
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
    }, [db, userId, planData, selectedMealIndex, dinnerTime, retryFetch, isLoading]);

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

        const path = window.location.pathname;
        if (path.startsWith('/share/')) {
            const shareId = path.split('/share/')[1];
            if (shareId) {
                setView('share');
                const shareDocRef = doc(db, 'artifacts', appId, SHARED_PLANS_COLLECTION_NAME, shareId);
                getDoc(shareDocRef).then((docSnap) => {
                    if (docSnap.exists()) {
                        setSharedPlan(docSnap.data());
                    } else {
                        setError("This shared plan could not be found.");
                    }
                }).catch(e => setError("Error loading shared plan."));
                return;
            }
        }
        
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'mealPlans', MEAL_PLAN_DOC_ID);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPlanData(data);
                setView(currentView => {
                    if (!['shopping', 'timing', 'detail', 'favorites', 'public', 'share', 'archived'].includes(currentView)) {
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

    useEffect(() => {
        if (!db || !userId || !isAuthReady) return;
        const archiveCollectionRef = collection(db, 'artifacts', appId, 'users', userId, ARCHIVED_PLANS_COLLECTION_NAME);
        const unsubscribe = onSnapshot(archiveCollectionRef, (snapshot) => {
            const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setArchivedPlans(plans);
        }, (e) => {
            console.error("Archived Plans Snapshot Error:", e);
            setError("Could not load archived plans.");
        });
        return () => unsubscribe();
    }, [db, userId, isAuthReady]);
    
    let content;
    const isConnecting = !isFirebaseInitialized || !isAuthReady;
    
    if (isConnecting && !error) {
        content = ( <div className="text-center py-20"> <span className="loading loading-spinner loading-lg text-primary"></span> <p className="mt-4 font-semibold">Connecting...</p> </div> );
    } else if (isLoading) {
        content = <PlanSkeleton />;
    } else {
        switch (view) {
            case 'planning': 
                content = <PlanningView query={query} setQuery={setQuery} useFavorites={useFavorites} setUseFavorites={setUseFavorites} processPlanGeneration={processPlanGeneration} favorites={favorites} selectedFavorites={selectedFavorites} handleFavoriteSelection={handleFavoriteSelection} />; 
                break;
            case 'review': content = planData ? <ReviewView planData={planData} mealsToRegenerate={mealsToRegenerate} regenerationConstraint={regenerationConstraint} setRegenerationConstraint={setRegenerationConstraint} processPlanGeneration={processPlanGeneration} toggleMealSelection={toggleMealSelection} handleSelectMeal={handleSelectMeal} generateShareLink={generateShareLink} handleStartOver={handleStartOver} handleArchivePlan={handleArchivePlan} /> : null; break;
            case 'shopping': content = <ShoppingView planData={planData} handleClearChecked={handleClearChecked} handleCheckItem={handleCheckItem} openCategory={openShoppingCategory} setOpenShoppingCategory={setOpenShoppingCategory} setView={setView} handleAddItem={handleAddItem} handleDeleteItem={handleDeleteItem} handlePrint={handlePrint} />; break;
            case 'favorites': content = <FavoritesView favorites={favorites} deleteFavorite={deleteFavorite} loadFavorite={loadFavorite} setView={setView} />; break;
            case 'timing': content = planData ? <TimingView meal={planData.weeklyPlan[selectedMealIndex]} dinnerTime={dinnerTime} setDinnerTime={setDinnerTime} generateRecipeDetail={generateRecipeDetail} isLoading={isLoading} /> : null; break;
            case 'detail': content = detailedRecipe ? <DetailView detailedRecipe={detailedRecipe} favorites={favorites} handleToggleFavorite={handleToggleFavorite} handlePrint={handlePrint} setView={setView} enterCookingMode={enterCookingMode} /> : null; break;
            case 'share': content = <ShareView sharedPlan={sharedPlan} setView={setView} />; break;
            case 'cooking': content = detailedRecipe ? <CookingView recipe={detailedRecipe} onExit={exitCookingMode} /> : null; break;
            case 'archived': content = <ArchivedPlansView archivedPlans={archivedPlans} loadArchivedPlan={loadArchivedPlan} deleteArchivedPlan={deleteArchivedPlan} setView={setView} />; break;
            default: content = ( <div className="text-center py-20 bg-base-200 rounded-box"> <p className="text-xl font-medium">Enter your preferences to start!</p> </div> );
        }
    }
    
    if (isCooking && detailedRecipe) {
        return <CookingView recipe={detailedRecipe} onExit={exitCookingMode} />;
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
                {view !== 'share' && (
                    <div className="flex justify-center gap-8 mb-8 no-print">
                        <button onClick={() => setView(planData ? 'review' : 'planning')} className={`btn ${['planning', 'review', 'timing', 'detail'].includes(view) ? 'btn-primary' : ''}`}>Dinner Plan</button>
                        <button onClick={() => setView('shopping')} className={`btn ${view === 'shopping' ? 'btn-primary' : ''}`}>Shopping List</button>
                        <button onClick={() => setView('favorites')} className={`btn ${view === 'favorites' ? 'btn-primary' : ''}`}>Favorites</button>
                        <button onClick={() => setView('archived')} className={`btn ${view === 'archived' ? 'btn-primary' : ''}`}>Archived Plans</button>
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