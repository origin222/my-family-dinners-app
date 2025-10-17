import React from 'react';
import { motion } from 'framer-motion';

// --- ANIMATION VARIANTS ---
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
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

export const ReviewView = ({ planData, mealsToRegenerate, regenerationConstraint, setRegenerationConstraint, processPlanGeneration, toggleMealSelection, handleSelectMeal, generateShareLink, handleStartOver }) => (
    <motion.div initial="hidden" animate="visible" variants={containerVariants}>
        <h2 className="text-3xl font-bold mb-6">Review & Select Meals</h2>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {mealsToRegenerate.length > 0 && (
                <input
                    type="text"
                    placeholder="e.g., Use leftover chicken..."
                    value={regenerationConstraint}
                    onChange={(e) => setRegenerationConstraint(e.target.value)}
                    className="input input-bordered w-full"
                />
            )}
            <button onClick={() => processPlanGeneration(true)} disabled={mealsToRegenerate.length === 0} className="btn btn-accent">
                Regenerate {mealsToRegenerate.length || ''} Meal(s)
            </button>
        </div>
        <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
        >
            {planData.weeklyPlan.map((meal, index) => {
                const isSelected = mealsToRegenerate.includes(index);
                return (
                    <motion.div key={index} variants={cardVariants} className={`card bg-base-100 shadow-xl transition-all duration-300 ${isSelected ? 'border-2 border-accent' : ''}`}>
                        <div className="card-body">
                            <h3 className="card-title text-primary">{meal.day}</h3>
                            <p className="font-semibold text-lg">{meal.meal}</p>
                            <p className="text-sm opacity-70 flex-grow">{meal.description}</p>
                            {meal.calories && (
                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                    <div className="badge badge-outline">{meal.calories} cal</div>
                                    <div className="badge badge-outline badge-primary">{meal.protein}g protein</div>
                                    <div className="badge badge-outline badge-secondary">{meal.carbs}g carbs</div>
                                    <div className="badge badge-outline badge-accent">{meal.fats}g fat</div>
                                </div>
                            )}
                            <div className="card-actions justify-between items-center mt-4 pt-4 border-t border-base-300">
                                <label className="label cursor-pointer gap-2">
                                    <input type="checkbox" checked={isSelected} onChange={() => toggleMealSelection(index)} className="checkbox checkbox-accent" />
                                    <span className="label-text">Replace</span>
                                </label>
                                <button onClick={() => handleSelectMeal(index)} className="btn btn-secondary btn-sm gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                    Get Recipe
                                </button>
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
    </motion.div>
);