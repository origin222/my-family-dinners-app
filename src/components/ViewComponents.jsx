import React, { useState, forwardRef } from 'react';

//===========================================================================
// Block 1: AddItemForm Component
// This component renders the input field and button for adding new items.
//===========================================================================
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


//===========================================================================
// Block 2: Item Component
// This component represents a single item in the shopping list.
//===========================================================================
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


//===========================================================================
// Block 3: PrintableList Component
// This is the component that will be rendered for printing.
// It's hidden in the main view but gets styled specifically for the printout.
//===========================================================================
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


//===========================================================================
// Block 4: ShoppingList Component (Main Component)
// This component manages the state and brings all other components together.
//===========================================================================
const ShoppingList = () => {
  const [items, setItems] = useState([
    { id: 1, name: 'Milk', completed: false },
    { id: 2, name: 'Bread', completed: true },
    { id: 3, name: 'Cheese', completed: false },
  ]);

  const handlePrint = () => {
    window.print();
  };

  const addItem = (name) => {
    const newItem = {
      id: Date.now(),
      name,
      completed: false,
    };
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
                .print-only {
                    display: none;
                }
            }
            @media print {
                body {
                    margin: 0;
                    padding: 0;
                }
                .screen-only {
                    display: none;
                }
                .print-only {
                    display: block;
                }
            }
        `}</style>

        {/* This is the main view of the app, visible on screen */}
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


//===========================================================================
// Block 5: Main App Export
// This is the default export for the file.
//===========================================================================
export default function App() {
  return <ShoppingList />;
}

