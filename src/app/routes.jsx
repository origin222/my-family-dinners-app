// src/app/routes.jsx
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';

import PlannerView from '../pages/PlannerView';
import ArchivedPlansView from '../pages/ArchivedPlansView';
import RecipeDetailView from '../pages/RecipeDetailView';

function Home() {
  return (
    <div style={{padding:'1rem'}}>
      <h2>Home</h2>
      <p>Welcome! Use the nav to explore Planner and Archive.</p>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<div style={{padding:16}}>Loading…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="planner" element={<PlannerView />} />
          <Route path="archive" element={<ArchivedPlansView />} />
          <Route path="recipe/:id" element={<RecipeDetailView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
