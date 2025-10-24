import React from 'react';

export const TimingView = ({ meal, dinnerTime, setDinnerTime, generateRecipeDetail, isLoading }) => (
    <div className="p-8 bg-base-200 rounded-box text-center">
        <h2 className="text-3xl font-bold mb-2">Planning Timeline for {meal.day}</h2>
        <p className="text-xl mb-6">Meal: <span className="font-bold">{meal.meal}</span></p>
        <div className="form-control w-full max-w-xs mx-auto">
            <label className="label"><span className="label-text">What time is dinner?</span></label>
            <input type="time" value={dinnerTime} onChange={(e) => setDinnerTime(e.target.value)} step="300" className="input input-bordered text-center text-2xl font-mono" />
        </div>
        <button onClick={generateRecipeDetail} disabled={isLoading} className="btn btn-success mt-6 w-full max-w-xs">
            Generate Timeline & Recipe
        </button>
    </div>
);