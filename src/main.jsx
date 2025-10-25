// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MealPlanProvider } from "./context/MealPlanContext";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App.jsx";
import "./index.css";

/**
 * main.jsx
 * --------
 * This is the file that actually launches your app.
 * It connects all the major parts:
 * - ErrorBoundary (to catch crashes)
 * - MealPlanProvider (to store meal/recipe data)
 * - BrowserRouter (for page navigation)
 */
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MealPlanProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MealPlanProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
