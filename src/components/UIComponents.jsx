// src/components/UIComponents.jsx
import React, { useState, useEffect } from 'react';
import { convertIngredient } from '../utils/helpers'; // FIX: Corrected path

export const ThemeToggle = () => {
    const [theme, setTheme] = useState(localStorage.getItem('theme') ? localStorage.getItem('theme') : 'cupcake');
    useEffect(() => {
        document.querySelector('html').setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    const handleToggle = (e) => setTheme(e.target.checked ? 'dark' : 'cupcake');
    return (
        <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
            <input type="checkbox" onChange={handleToggle} checked={theme === 'dark'} className="toggle theme-controller" />
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        </div>
    );
};

export const PlanSkeleton = () => (
    <div>
        <h2 className="text-3xl font-bold mb-6">Generating Your Plan...</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-col gap-4 w-full">
                    <div className="skeleton h-36 w-full"></div>
                    <div className="skeleton h-4 w-28"></div>
                    <div className="skeleton h-4 w-full"></div>
                </div>
            ))}
        </div>
    </div>
);

export const UnitConverter = ({ ingredients }) => {
    const [conversionType, setConversionType] = useState('metric');
    return (
        <div className="p-4 bg-base-200 rounded-box">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h4 className="text-xl font-bold">Unit Converter</h4>
                <select value={conversionType} onChange={(e) => setConversionType(e.target.value)} className="select select-bordered select-sm">
                    <option value="metric">To Metric (g/kg/ml)</option>
                    <option value="imperial">To Imperial (lb/oz/cup)</option>
                </select>
            </div>
            <ul className="space-y-1 text-sm">
                {ingredients.map((item, index) => {
                    const conversion = convertIngredient(item, 'metric');
                    return (
                        <li key={index} className="flex justify-between border-b border-base-300 last:border-b-0 py-1">
                            <span>{item}</span>
                            <span className="font-semibold text-accent">{conversion.converted}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};