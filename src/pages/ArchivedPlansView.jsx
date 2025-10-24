// src/pages/ArchivedPlansView.jsx
import React from 'react';
import { useMealPlan } from '../context/MealPlanContext';

export default function ArchivedPlansView() {
  const { archivedPlans } = useMealPlan();

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Archived Plans</h2>
      {archivedPlans.length === 0 ? (
        <p>No archived plans yet.</p>
      ) : (
        <ul>
          {archivedPlans.map(a => (
            <li key={a.id}>
              <strong>Week:</strong> {a.plan?.weekStart || '(unset)'} &nbsp;
              <small style={{color:'#666'}}>archived {new Date(a.archivedAt).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
