// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import { MealPlanProvider } from "./context/MealPlanContext";
import { ToastProvider } from "./components/ToastHost";
import ArchiveToastBridge from "./components/ArchiveToastBridge";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <MealPlanProvider>
        {/* Listens for archive results and shows toasts */}
        <ArchiveToastBridge />
        {/* Your original app stays exactly as-is */}
        <App />
      </MealPlanProvider>
    </ToastProvider>
  </React.StrictMode>
);
