import React from 'react';

export const ArchivedPlansView = ({ archivedPlans, loadArchivedPlan, deleteArchivedPlan, setView }) => (
    <div>
        <h2 className="text-3xl font-bold mb-6">Your Archived Plans ({archivedPlans.length})</h2>
        <div className="space-y-4">
            {archivedPlans.length === 0 ? (
                <div className="text-center p-10 bg-base-200 rounded-box">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-base-content opacity-30 mb-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125V6.375c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v.001c0 .621.504 1.125 1.125 1.125z" />
                    </svg>
                    <h3 className="text-xl font-bold">No Archived Plans</h3>
                    <p className="text-base-content/70 mt-2 mb-6">When you have a weekly plan you love, you can save it here.</p>
                    <button onClick={() => setView('planning')} className="btn btn-primary">Create a New Plan</button>
                </div>
            ) : (
                archivedPlans.sort((a, b) => b.savedAt.seconds - a.savedAt.seconds).map((plan) => (
                    <div key={plan.id} className="card card-side bg-base-100 shadow-md">
                        <div className="card-body">
                            <p className="text-sm opacity-70">Saved on: {new Date(plan.savedAt.seconds * 1000).toLocaleDateString()}</p>
                            <h3 className="card-title text-secondary">Based on: "{plan.initialQuery}"</h3>
                            <div className="card-actions justify-end">
                                <button onClick={() => deleteArchivedPlan(plan.id)} className="btn btn-ghost btn-sm">Delete</button>
                                <button onClick={() => loadArchivedPlan(plan)} className="btn btn-primary btn-sm">Load Plan</button>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
);