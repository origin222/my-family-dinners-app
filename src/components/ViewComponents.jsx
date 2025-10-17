import React, { useMemo, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion'; // --- ANIMATION: Import framer-motion
import { UnitConverter } from './UIComponents';
import { convertToActualTime } from '../utils/helpers';

// --- ANIMATION: Define animation variants for the container and cards ---
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1, // Each card animates 0.1s after the previous one
        },
    },
};

const cardVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
    },
};

export const PlanningView = ({ query, setQuery, useFavorites, setUseFavorites, processPlanGeneration, favorites, selectedFavorites, handleFavoriteSelection }) => (
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
                    placeholder="e.g., Low-carb, no seafood..."
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

export const ShoppingView = ({ planData, handleClearChecked, handleCheckItem, openCategory, setOpenCategory, setView, handleAddItem, handleDeleteItem }) => {
    // ... (This component's code is unchanged)
};

export const ReviewView = ({ planData, mealsToRegenerate, regenerationConstraint, setRegenerationConstraint, processPlanGeneration, toggleMealSelection, handleSelectMeal, generateShareLink, handleStartOver }) => (
    <div>
        <h2 className="text-3xl font-bold mb-6">Review & Select Meals</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {mealsToRegenerate.length > 0 && ( <input type="text" placeholder="e.g., Use leftover chicken..." value={regenerationConstraint} onChange={(e) => setRegenerationConstraint(e.target.value)} className="input input-bordered w-full" /> )}
            <button onClick={() => processPlanGeneration(true)} disabled={mealsToRegenerate.length === 0} className="btn btn-accent">Regenerate {mealsToRegenerate.length || ''} Meal(s)</button>
        </div>
        <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
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
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={generateShareLink} className="btn btn-primary">Share Plan</button>
            <button onClick={handleStartOver} className="btn btn-error">Start Over</button>
        </div>
    </div>
);

// ... (Rest of the ViewComponents file remains the same)
export const TimingView = ({ meal, dinnerTime, setDinnerTime, generateRecipeDetail, isLoading }) => ( <div className="p-8 bg-base-200 rounded-box text-center"> <h2 className="text-3xl font-bold mb-2">Planning Timeline for {meal.day}</h2> <p className="text-xl mb-6">Meal: <span className="font-bold">{meal.meal}</span></p> <div className="form-control w-full max-w-xs mx-auto"> <label className="label"><span className="label-text">What time is dinner?</span></label> <input type="time" value={dinnerTime} onChange={(e) => setDinnerTime(e.target.value)} step="300" className="input input-bordered text-center text-2xl font-mono" /> </div> <button onClick={generateRecipeDetail} disabled={isLoading} className="btn btn-success mt-6 w-full max-w-xs">Generate Timeline & Recipe</button> </div> );
export const DetailView = ({ detailedRecipe, favorites, handleToggleFavorite, handlePrint, setView }) => { /* ... */ };
export const FavoritesView = ({ favorites, deleteFavorite, loadFavorite, setView }) => ( /* ... */ );