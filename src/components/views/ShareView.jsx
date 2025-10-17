import React from 'react';

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