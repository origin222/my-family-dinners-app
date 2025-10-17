import React from 'react';
import { UnitConverter } from '../UIComponents';
import { convertToActualTime } from '../../utils/helpers';

export const DetailView = ({ detailedRecipe, favorites, handleToggleFavorite, handlePrint, setView }) => {
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

export const FavoritesView = ({ favorites, deleteFavorite, loadFavorite, setView }) => (
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

export const ShareView = ({ sharedPlan, setView }) => {
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