import React from 'react';

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