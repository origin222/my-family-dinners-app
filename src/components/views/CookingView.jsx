import React, { useState, useEffect, useCallback } from 'react';

export const CookingView = ({ recipe, onExit }) => {
    const [step, setStep] = useState(0);
    const [wakeLock, setWakeLock] = useState(null);

    // Function to acquire a screen wake lock
    const acquireWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                const lock = await navigator.wakeLock.request('screen');
                setWakeLock(lock);
                console.log('Screen Wake Lock is active.');
                // Re-acquire lock when visibility changes
                document.addEventListener('visibilitychange', handleVisibilityChange);
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        }
    }, []);

    const handleVisibilityChange = useCallback(() => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            acquireWakeLock();
        }
    }, [wakeLock, acquireWakeLock]);

    // Acquire lock on component mount
    useEffect(() => {
        acquireWakeLock();

        // Release lock on component unmount
        return () => {
            if (wakeLock !== null) {
                wakeLock.release();
                setWakeLock(null);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                console.log('Screen Wake Lock released.');
            }
        };
    }, [acquireWakeLock, wakeLock, handleVisibilityChange]);

    const instructions = recipe.instructions || [];
    const totalSteps = instructions.length;

    const nextStep = () => {
        if (step < totalSteps - 1) {
            setStep(step + 1);
        }
    };

    const prevStep = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    return (
        <div className="fixed inset-0 bg-base-100 z-50 flex flex-col p-4 sm:p-8">
            <div className="flex justify-between items-center no-print">
                <h2 className="text-2xl font-bold text-primary">{recipe.recipeName}</h2>
                <button onClick={onExit} className="btn btn-error btn-sm">Exit Cooking Mode</button>
            </div>

            <div className="flex-grow flex flex-col items-center justify-center text-center p-4">
                <p className="text-lg opacity-70 mb-4">Step {step + 1} of {totalSteps}</p>
                <div className="text-3xl sm:text-4xl md:text-5xl font-semibold leading-relaxed">
                    {instructions[step]}
                </div>
            </div>

            <div className="flex justify-between items-center w-full mt-4 no-print">
                <button onClick={prevStep} disabled={step === 0} className="btn btn-lg">Previous</button>
                <div className="text-sm">{step + 1} / {totalSteps}</div>
                <button onClick={nextStep} disabled={step >= totalSteps - 1} className="btn btn-primary btn-lg">Next</button>
            </div>
        </div>
    );
};