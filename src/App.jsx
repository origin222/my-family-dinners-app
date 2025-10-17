import React, { useState, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';

// --- LOCAL IMPORTS ---
import { useFirebase } from './hooks/useFirebase';
import { useMealPlanner } from './hooks/useMealPlanner';
import { ThemeToggle, PlanSkeleton } from './components/UIComponents';
import { ShoppingView, ReviewView, TimingView, DetailView, FavoritesView, PlanningView, ShareView } from './components/views';

// --- MAIN APP COMPONENT ---
const App = () => {
    const { 
        db, userId, isAuthReady, isFirebaseInitialized, error, 
        planData, setPlanData, favorites, view, setView, query, 
        setQuery, detailedRecipe, setDetailedRecipe, sharedPlan, setSharedPlan,
        appId, MEAL_PLAN_DOC_ID, FAVORITES_COLLECTION_NAME, SHARED_PLANS_COLLECTION_NAME
    } = useFirebase();

    const { isLoading: isPlannerLoading, error: plannerError, processPlanGeneration, generateRecipeDetail } = useMealPlanner(db, userId, appId);
    
    const [selectedMealIndex, setSelectedMealIndex] = useState(null);
    const [mealsToRegenerate, setMealsToRegenerate] = useState([]);
    const [dinnerTime, setDinnerTime] = useState('19:00');
    const [regenerationConstraint, setRegenerationConstraint] = useState('');
    const [openShoppingCategory, setOpenShoppingCategory] = useState(null);
    const [useFavorites, setUseFavorites] = useState(false);
    const [selectedFavorites, setSelectedFavorites] = useState([]);
    const [isCooking, setIsCooking] = useState(false);

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
        if (planData) {
            try { await updateDoc(docRef, { shoppingList: updatedList }); } 
            catch (e) { console.error("Firestore Update Error:", e); toast.error("Could not update shopping list."); }
        } else {
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
    const generateShareLink = useCallback(async () => { if (!db || !userId || !planData) return; const shareDocRef = doc(db, 'artifacts', appId, SHARED_PLANS_COLLECTION_NAME, userId); const publicPlanData = { weeklyPlan: planData.weeklyPlan, initialQuery: planData.initialQuery, userId: userId, userName: "A Friend", sharedAt: new Date().toISOString(), }; try { await setDoc(shareDocRef, publicPlanData); const url = `${window.location.origin}/share/${userId}`; toast((t) => ( <div className="flex flex-col gap-2"> <span className="text-sm font-semibold">Shareable link!</span> <div className="flex gap-2"> <input type="text" value={url} readOnly className="input input-bordered input-sm w-full" /> <button className="btn btn-sm btn-primary" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied!', { id: t.id }); }}>Copy</button> </div> </div> ), { duration: 6000 }); } catch (e) { toast.error("Failed to generate link."); } }, [db, userId, planData, appId]);

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

    let content;
    const isConnecting = !isFirebaseInitialized || !isAuthReady;
    const isLoading = isPlannerLoading; // Use the loading state from our hook
    const combinedError = error || plannerError;
    
    if (isConnecting && !combinedError) {
        content = ( <div className="text-center py-20"> <span className="loading loading-spinner loading-lg text-primary"></span> <p className="mt-4 font-semibold">Connecting...</p> </div> );
    } else if (isLoading) {
        content = <PlanSkeleton />;
    } else {
        switch (view) {
            case 'planning': 
                content = <PlanningView query={query} setQuery={setQuery} useFavorites={useFavorites} setUseFavorites={setUseFavorites} processPlanGeneration={(isRegen) => processPlanGeneration({isRegeneration: isRegen, query, planData, mealsToRegenerate, regenerationConstraint, useFavorites, selectedFavorites, setView, setMealsToRegenerate})} favorites={favorites} selectedFavorites={selectedFavorites} handleFavoriteSelection={handleFavoriteSelection} />; 
                break;
            case 'review': content = planData ? <ReviewView planData={planData} mealsToRegenerate={mealsToRegenerate} regenerationConstraint={regenerationConstraint} setRegenerationConstraint={setRegenerationConstraint} processPlanGeneration={(isRegen) => processPlanGeneration({isRegeneration: isRegen, query, planData, mealsToRegenerate, regenerationConstraint, useFavorites, selectedFavorites, setView, setMealsToRegenerate})} toggleMealSelection={toggleMealSelection} handleSelectMeal={handleSelectMeal} generateShareLink={generateShareLink} handleStartOver={handleStartOver} /> : null; break;
            case 'shopping': content = <ShoppingView planData={planData} handleClearChecked={handleClearChecked} handleCheckItem={handleCheckItem} openCategory={openShoppingCategory} setOpenCategory={setOpenShoppingCategory} setView={setView} handleAddItem={handleAddItem} handleDeleteItem={handleDeleteItem} handlePrint={handlePrint} />; break;
            case 'favorites': content = <FavoritesView favorites={favorites} deleteFavorite={deleteFavorite} loadFavorite={loadFavorite} setView={setView} />; break;
            case 'timing': content = planData ? <TimingView meal={planData.weeklyPlan[selectedMealIndex]} dinnerTime={dinnerTime} setDinnerTime={setDinnerTime} generateRecipeDetail={() => generateRecipeDetail({planData, selectedMealIndex, dinnerTime, setDetailedRecipe, setView})} isLoading={isLoading} /> : null; break;
            case 'detail': content = detailedRecipe ? <DetailView detailedRecipe={detailedRecipe} favorites={favorites} handleToggleFavorite={handleToggleFavorite} handlePrint={handlePrint} setView={setView} enterCookingMode={enterCookingMode} /> : null; break;
            case 'share': content = <ShareView sharedPlan={sharedPlan} setView={setView} />; break;
            case 'cooking': content = detailedRecipe ? <CookingView recipe={detailedRecipe} onExit={exitCookingMode} /> : null; break;
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