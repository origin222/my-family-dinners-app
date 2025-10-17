import React from 'react';
import { UnitConverter } from '../UIComponents';
import { convertToActualTime } from '../../utils/helpers';

export const DetailView = ({ detailedRecipe, favorites, handleToggleFavorite, handlePrint, setView, enterCookingMode }) => {
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
                
                {/* --- FEATURE: "Start Cooking" Button --- */}
                <div className="mt-6 no-print">
                    <button onClick={enterCookingMode} className="btn btn-lg btn-accent gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
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