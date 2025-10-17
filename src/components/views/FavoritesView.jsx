import React from 'react';

export const FavoritesView = ({ favorites, deleteFavorite, loadFavorite, setView }) => (
    <div>
        <h2 className="text-3xl font-bold mb-6">Your Saved Favorites ({favorites.length})</h2>
        <div className="space-y-4">
            {favorites.length === 0 ? (
                <div className="text-center p-10 bg-base-200 rounded-box">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-base-content opacity-30 mb-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
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