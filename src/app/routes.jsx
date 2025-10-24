// src/app/routes.jsx
import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import RouteBoundary from '../components/RouteBoundary';
import Skeleton from '../components/Skeleton';

// Lazy pages
const PlannerView = lazy(() => import('../pages/PlannerView'));
const ArchivedPlansView = lazy(() => import('../pages/ArchivedPlansView'));
const RecipeDetailView = lazy(() => import('../pages/RecipeDetailView'));
const NotFound = lazy(() => import('../pages/NotFound'));

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
    <Suspense fallback={<Skeleton lines={5} />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="planner"
            element={
              <Suspense fallback={<Skeleton lines={6} />}>
                <PlannerView />
              </Suspense>
            }
          />
          <Route
            path="archive"
            element={
              <Suspense fallback={<Skeleton lines={4} />}>
                <ArchivedPlansView />
              </Suspense>
            }
          />
          <Route
            path="recipe/:id"
            element={
              <RouteBoundary>
                <Suspense fallback={<Skeleton lines={7} />}>
                  <RecipeDetailView />
                </Suspense>
              </RouteBoundary>
            }
          />
          {/* NotFound: friendly page instead of redirect */}
          <Route
            path="*"
            element={
              <Suspense fallback={<Skeleton lines={3} />}>
                <NotFound />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
