// src/pages/PlannerView.jsx
import React from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { toISODate } from '../utils/time';

export default function PlannerView() {
  const { plan, setPlan, archiveCurrentPlan } = useMealPlan();

  const setWeekStartToday = () => {
    const today = toISODate(new Date());
    setPlan(p => ({ ...p, weekStart: today }));
  };

  const addSampleMeal = () => {
    const day = plan.weekStart || toISODate(new Date());
    const entry = { id: String(Date.now()), title: 'Teriyaki Chicken Bowls', notes: 'Kids: extra pineapple' };
    setPlan(p => ({
      ...p,
      days: { ...p.days, [day]: [...(p.days[day] || []), entry] }
    }));
  };

  const firstDay = plan.weekStart || '(not set)';
  const meals = plan.days[firstDay] || [];

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Planner</h2>
      <p><strong>Week start:</strong> {firstDay}</p>
      <div style={{display:'flex', gap:8, margin:'12px 0'}}>
        <button onClick={setWeekStartToday}>Set Week Start to Today</button>
        <button onClick={addSampleMeal}>Add Sample Meal</button>
        <button onClick={archiveCurrentPlan}>Archive Current Plan</button>
      </div>
      <ul>
        {meals.map(m => <li key={m.id}>{m.title} <em style={{color:'#666'}}>— {m.notes}</em></li>)}
      </ul>
    </div>
  );
}
