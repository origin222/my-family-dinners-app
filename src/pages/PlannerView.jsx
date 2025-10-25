// src/pages/PlannerView.jsx
import React from "react";
import LegacyApp from "../App.Legacy.jsx"; // This is your original working app

/**
 * PlannerView
 * ------------
 * This page displays your old (fully functional) app
 * inside the new navigation layout.
 * You can continue to edit and test your old app here.
 */
export default function PlannerView() {
  return (
    <div style={{ padding: "1rem" }}>
      {/* You can add a small heading if you like */}
      <h2 style={{ marginBottom: "1rem" }}>Weekly Planner</h2>

      {/* This shows your old app just like before */}
      <LegacyApp />
    </div>
  );
}
