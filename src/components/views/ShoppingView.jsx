import React, { useMemo, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

export const ShoppingView = ({ planData, handleClearChecked, handleCheckItem, openCategory, setOpenCategory, setView, handleAddItem, handleDeleteItem, handlePrint }) => {
    const [newItemName, setNewItemName] = useState('');
    const [newItemQuantity, setNewItemQuantity] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('Misc');

    const groupedList = useMemo(() => {
        const list = {};
        if (planData?.shoppingList) {
            planData.shoppingList.forEach(item => {
                const category = item.category || 'Uncategorized';
                if (!list[category]) list[category] = [];
                list[category].push(item);
            });
        }
        return list;
    }, [planData?.shoppingList]);

    useEffect(() => {
        const categories = Object.keys(groupedList).sort();
        if (categories.length > 0 && !categories.includes(openCategory)) {
            setOpenCategory(categories[0]);
        }
    }, [groupedList, openCategory, setOpenCategory]);
    
    const handleAddNewItem = (e) => {
        e.preventDefault();
        if (!newItemName.trim()) {
            toast.error("Please enter an item name.");
            return;
        }
        handleAddItem({ item: newItemName, quantity: newItemQuantity || '1', category: newItemCategory, isChecked: false, });
        setNewItemName('');
        setNewItemQuantity('');
    };

    return (
        <div>
            {/* --- UI FIX: Restructured header for better button placement --- */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-bold">Grocery Shopping List</h2>
                    {planData?.shoppingList?.length > 0 && (
                        <button onClick={handlePrint} className="btn btn-ghost btn-sm no-print">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03-.48.062-.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.32 0c.662 0 1.18.568 1.12 1.227l-.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m0 0h11.32z" /></svg>
                            Print
                        </button>
                    )}
                </div>
                {planData?.shoppingList?.length > 0 && (
                    <button onClick={handleClearChecked} disabled={!planData?.shoppingList?.some(i => i.isChecked)} className="btn btn-error btn-sm no-print">Clear Checked</button>
                )}
            </div>

            <div className="no-print">
                <form onSubmit={handleAddNewItem} className="bg-base-200 p-4 rounded-box mb-6 flex flex-col sm:flex-row gap-2 items-end">
                    <div className="form-control flex-grow"> <label className="label py-1"><span className="label-text">Item Name</span></label> <input type="text" placeholder="e.g., Milk" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="input input-bordered input-sm w-full" /> </div>
                    <div className="form-control"> <label className="label py-1"><span className="label-text">Quantity</span></label> <input type="text" placeholder="e.g., 1 gallon" value={newItemQuantity} onChange={(e) => setNewItemQuantity(e.target.value)} className="input input-bordered input-sm w-full" /> </div>
                    <div className="form-control"> <label className="label py-1"><span className="label-text">Category</span></label> <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} className="select select-bordered select-sm w-full"> <option>Produce</option> <option>Dairy</option> <option>Meat</option> <option>Pantry</option> <option>Frozen</option> <option>Bakery</option> <option>Misc</option> </select> </div>
                    <button type="submit" className="btn btn-primary btn-sm mt-2 sm:mt-0">Add Item</button>
                </form>
            </div>
            
            {planData?.shoppingList?.length === 0 ? (
                <div className="text-center p-10 bg-base-200 rounded-box no-print">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto text-base-content opacity-30 mb-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c.51 0 .962-.344 1.087-.835l1.823-6.831a.75.75 0 00-.66-1.11H6.088L5.438 4.239A.75.75 0 004.658 3.5H3.75" /></svg>
                    <h3 className="text-xl font-bold">Your Shopping List is Empty</h3>
                    <p className="text-base-content/70 mt-2 mb-6">Generate a meal plan or add your own items to get started.</p>
                    <button onClick={() => setView('planning')} className="btn btn-primary">Create a New Plan</button>
                </div>
            ) : (
                <>
                    <div className="no-print space-y-2">
                        {Object.keys(groupedList).sort().map(category => (
                            <div key={category} className="collapse collapse-arrow bg-base-200">
                                <input type="radio" name="shopping-accordion" checked={openCategory === category} onChange={() => setOpenCategory(category)} />
                                <div className="collapse-title text-xl font-medium">{category} ({groupedList[category].length})</div>
                                <div className="collapse-content">
                                    {groupedList[category].map((item, index) => {
                                        const globalIndex = planData.shoppingList.findIndex(i => i.item === item.item && i.quantity === item.quantity && i.category === item.category);
                                        return (
                                            <div key={`${globalIndex}-${index}`} className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition hover:bg-base-100`} onClick={() => handleCheckItem(globalIndex)}>
                                                <div className="flex items-center gap-4">
                                                    <input type="checkbox" checked={item.isChecked} readOnly className="checkbox checkbox-primary" />
                                                    <div className={`${item.isChecked ? 'opacity-50 line-through' : ''}`}> <span className="font-semibold">{item.item}</span> <span className="text-xs opacity-70 block">{item.quantity}</span> </div>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(globalIndex); }} className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"> <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg> </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div id="printable-shopping-list" className="hidden print:block">
                        <h2 className="text-2xl font-bold text-center mb-4">My Family Dinners - Shopping List</h2>
                        {Object.keys(groupedList).sort().map(category => (
                            <div key={category} className="print-list-category">
                                <h3 className="text-lg font-bold mb-2">{category}</h3>
                                <ul>
                                    {groupedList[category].map((item, index) => (
                                        <li key={index} className="print-list-item">{item.item} <span className="text-gray-500 text-sm">({item.quantity})</span></li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                        <div className="print-notes-section">
                            <h3>Notes:</h3>
                            <div /><div /><div /><div /><div />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};