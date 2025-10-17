import React, { useState } from 'react';

// -- AddItemForm Component --
// Renders the input field and button for adding new items.
const AddItemForm = ({ onAddItem }) => {
  const [itemName, setItemName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    onAddItem(itemName);
    setItemName('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <input
        type="text"
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
        placeholder="e.g., Eggs"
        className="flex-grow p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
      />
      <button
        type="submit"
        className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-transform transform hover:scale-105"
      >
        Add Item
      </button>
    </form>
  );
};

// -- Item Component --
// Represents a single item in the shopping list.
const Item = ({ item, onToggleItem, onRemoveItem }) => {
  return (
    <li
      className={`flex items-center justify-between p-4 mb-2 rounded-lg transition-all duration-300 ease-in-out ${
        item.completed ? 'bg-green-100 text-gray-500 line-through' : 'bg-white shadow-sm'
      }`}
    >
      <span
        onClick={() => onToggleItem(item.id)}
        className="cursor-pointer flex-grow"
      >
        {item.name}
      </span>
      <button
        onClick={() => onRemoveItem(item.id)}
        className="ml-4 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
      >
        X
      </button>
    </li>
  );
};

// -- PrintableList Component --
// The component that will be rendered for printing.
const PrintableList = ({ items }) => {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Shopping List</h1>
      {items.length > 0 ? (
        <ul className="list-disc pl-5">
          {items.map(item => (
            <li key={item.id} className="mb-2 text-lg">
              {item.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-gray-500">The list is empty.</p>
      )}
       <p className="text-center text-sm text-gray-400 mt-8">
            Generated on: {new Date().toLocaleDateString()}
       </p>
    </div>
  );
};
// -- ShoppingView Component (Main Exported View) --
// Manages the state and UI for the entire shopping list feature.
export const ShoppingView = () => {
  const [items, setItems] = useState([
    { id: 1, name: 'Milk', completed: false },
    { id: 2, name: 'Bread', completed: true },
    { id: 3, name: 'Cheese', completed: false },
  ]);

  const handlePrint = () => {
    window.print();
  };

  const addItem = (name) => {
    const newItem = { id: Date.now(), name, completed: false };
    setItems([...items, newItem]);
  };

  const toggleItem = (id) => {
    setItems(
      items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const removeItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  const clearList = () => {
      setItems([]);
  }

  return (
    <>
      {/* CSS to control visibility for screen vs. print */}
      <style>{`
        @media screen {
            .print-only { display: none; }
        }
        @media print {
            body { margin: 0; padding: 0; }
            .screen-only { display: none; }
            .print-only { display: block; }
        }
      `}</style>

      {/* Main on-screen view of the app */}
      <div className="bg-gray-100 min-h-screen font-sans screen-only">
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-2xl">
          <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-4xl font-bold text-gray-800">My Shopping List</h1>
              <button
                onClick={handlePrint}
                className="px-5 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-transform transform hover:scale-105"
              >
                Print
              </button>
            </div>

            <AddItemForm onAddItem={addItem} />

            {items.length > 0 ? (
              <ul className="space-y-2">
                {items.map(item => (
                  <Item
                    key={item.id}
                    item={item}
                    onToggleItem={toggleItem}
                    onRemoveItem={removeItem}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-500 py-8">Your shopping list is empty!</p>
            )}

            {items.length > 0 && (
              <div className="text-center mt-6">
                <button
                  onClick={clearList}
                  className="px-6 py-2 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-600 focus:ring-opacity-50 transition-all"
                >
                  Clear List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* This component is hidden from the screen and is only used for printing */}
      <div className="print-only">
        <PrintableList items={items} />
      </div>
    </>
  );
};
// -- Placeholder View Components --
// These are exported to prevent build errors in your main App.jsx file.
// You can replace their content with your actual components later.
export const PlanningView = () => (
    <div className="p-8"><h1 className="text-3xl font-bold">Planning View</h1><p className="mt-4 text-gray-600">This is a placeholder for the Planning View.</p></div>
);

export const ReviewView = () => (
    <div className="p-8"><h1 className="text-3xl font-bold">Review View</h1><p className="mt-4 text-gray-600">This is a placeholder for the Review View.</p></div>
);

export const TimingView = () => (
    <div className="p-8"><h1 className="text-3xl font-bold">Timing View</h1><p className="mt-4 text-gray-600">This is a placeholder for the Timing View.</p></div>
);

export const DetailView = () => (
    <div className="p-8"><h1 className="text-3xl font-bold">Detail View</h1><p className="mt-4 text-gray-600">This is a placeholder for the Detail View.</p></div>
);

export const FavoritesView = () => (
    <div className="p-8"><h1 className="text-3xl font-bold">Favorites View</h1><p className="mt-4 text-gray-600">This is a placeholder for the Favorites View.</p></div>
);

export const ShareView = () => (
    <div className="p-8"><h1 className="text-3xl font-bold">Share View</h1><p className="mt-4 text-gray-600">This is a placeholder for the Share View.</p></div>
);