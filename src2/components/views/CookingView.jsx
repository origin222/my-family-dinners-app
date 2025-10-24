import React, { useState, useEffect, useCallback, useRef } from 'react';

export const CookingView = ({ recipe, onExit }) => {
    const [step, setStep] = useState(0);
    const [wakeLock, setWakeLock] = useState(null);
    const stepRefs = useRef([]);

    // --- Screen Wake Lock Logic ---
    const acquireWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                const lock = await navigator.wakeLock.request('screen');
                setWakeLock(lock);
                console.log('Screen Wake Lock is active.');
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        }
    }, []);

    const handleVisibilityChange = useCallback(() => {
        if (document.visibilityState === 'visible') {
            acquireWakeLock();
        }
    }, [acquireWakeLock]);

    useEffect(() => {
        acquireWakeLock();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (wakeLock !== null && wakeLock.released === false) {
                wakeLock.release().then(() => {
                    setWakeLock(null);
                    console.log('Screen Wake Lock released.');
                });
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [acquireWakeLock, wakeLock, handleVisibilityChange]);
    // --- End Wake Lock Logic ---

    const instructions = recipe.instructions || [];
    const totalSteps = instructions.length;

    useEffect(() => {
        stepRefs.current[step]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }, [step]);

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
        <div className="fixed inset-0 bg-base-100 z-50 flex flex-col">
            <header className="sticky top-0 bg-base-100/80 backdrop-blur-sm p-4 border-b border-base-300 no-print z-10">
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-primary truncate">{recipe.recipeName}</h2>
                    <button onClick={onExit} className="btn btn-error btn-sm">Exit</button>
                </div>
            </header>

            <main className="flex-grow overflow-y-auto p-4 sm:p-8">
                <div className="max-w-2xl mx-auto">
                    <ol className="space-y-8">
                        {instructions.map((instruction, index) => {
                            const isCurrentStep = index === step;
                            return (
                                <li
                                    key={index}
                                    ref={el => stepRefs.current[index] = el}
                                    className={`p-6 rounded-box transition-all duration-300 ${isCurrentStep ? 'bg-primary/10 border-2 border-primary' : 'bg-base-200'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${isCurrentStep ? 'bg-primary text-primary-content' : 'bg-base-300'}`}>
                                            {index + 1}
                                        </div>
                                        <p className={`text-xl sm:text-2xl leading-relaxed ${isCurrentStep ? 'font-semibold' : 'opacity-70'}`}>
                                            {instruction}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </main>

            <footer className="sticky bottom-0 bg-base-100/80 backdrop-blur-sm p-4 border-t border-base-300 no-print z-10">
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <button onClick={prevStep} disabled={step === 0} className="btn btn-lg">Previous</button>
                    <div className="font-semibold text-sm">{step + 1} / {totalSteps}</div>
                    <button onClick={nextStep} disabled={step >= totalSteps - 1} className="btn btn-primary btn-lg">Next</button>
                </div>
            </footer>
        </div>
    );
};