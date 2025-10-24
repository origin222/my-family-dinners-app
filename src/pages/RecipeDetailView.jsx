// src/pages/RecipeDetailView.jsx
import React from 'react';
import { useParams } from 'react-router-dom';

export default function RecipeDetailView() {
  const { id } = useParams();
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Recipe Detail</h2>
      <p>Recipe ID: {id}</p>
      <p>(Render ingredients, steps, and nutrition here.)</p>
    </div>
  );
}
