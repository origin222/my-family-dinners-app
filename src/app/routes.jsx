// src/app/routes.jsx
import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import RouteBoundary from "../components/RouteBoundary";
import Skeleton from "../components/Skeleton";

// Lazy load pages (this makes loading smoother)
const PlannerView = lazy(() => import("../pages/PlannerView"));
const ArchivedPlansView = lazy(() => import("../pages/ArchivedPlansView"));
const RecipeDetailView = lazy(() => import("../pages/RecipeDetailView"));
const NotFound = lazy(() => import("../pages/NotFound"));

/**
 * AppRoutes
 * ----------
 * Controls all navigation inside your app.
 * Defines which page appears when you visit a URL like:
 *   /         -> Home (which shows the Planner)
 *   /planner  -> Planner (your main UI)
 *   /archive  -> Archived meal plans
 *   /recipe/1 -> Example recipe detail page
 */
export default function AppRoutes() {
  return (
    // Suspense shows a loading animation while a page is loading
    <Suspense fallback={<Skeleton lines={5} />}>
      <Routes>
        {/* The Layout adds the top navigation bar */}
        <Route element={<Layout />}>
          {/* Home route - same as Planner */}
          <Route
            index
            element={
              <Suspense fallback={<Skeleton lines={6} />}>
                <PlannerView />
              </Suspense>
            }
          />

          {/* Planner route - your main working app */}
          <Route
            path="planner"
            element={
              <Suspense fallback={<Skeleton lines={6} />}>
                <PlannerView />
              </Suspense>
            }
          />

          {/* Archived meal plans */}
          <Route
            path="archive"
            element={
              <Suspense fallback={<Skeleton lines={4} />}>
                <ArchivedPlansView />
              </Suspense>
            }
          />

          {/* Recipe detail page */}
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

          {/* 404 - Page not found */}
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
