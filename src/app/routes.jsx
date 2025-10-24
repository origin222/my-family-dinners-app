// src/app/routes.jsx
import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Lazy-load optional pages if you create them later
const ArchivedPlansView = React.lazy(() => import('../components/views/ArchivedPlansView').catch(() => ({ default: () => <div /> })));
// Add additional pages here as you split App into pages

export default function AppRoutes() {
  return (
    <Suspense fallback={<div style={{padding:16}}>Loading…</div>}>
      <Routes>
        {/* Keep root route pointing to existing App content if you later extract pages */}
        <Route path="/archive" element={<ArchivedPlansView />} />
        <Route path="*" element={<Navigate to="/archive" replace />} />
      </Routes>
    </Suspense>
  );
}
