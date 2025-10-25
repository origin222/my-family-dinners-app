// src/pages/ArchivedPlansView.jsx
import React from "react";
import { useMealPlan } from "../context/MealPlanContext";

/**
 * ArchivedPlansView
 * -----------------
 * Shows a simple list of your archived weekly plans.
 * - If you have none yet, you'll see a friendly message.
 * - Each archive shows the "week start" and when it was archived.
 *
 * Tip: You can create archives from the Planner page by clicking
 * "Archive Current Plan" (we added that earlier).
 */
export default function ArchivedPlansView() {
  const { archivedPlans = [] } = useMealPlan();

  if (!archivedPlans.length) {
    return (
      <div style={{ padding: "1rem" }}>
        <h2 style={{ marginBottom: 12 }}>Archived Plans</h2>
        <p style={{ color: "#64748b" }}>
          You don’t have any archived plans yet. Go to the Planner page and hit
          <strong> “Archive Current Plan”</strong> to save your current week.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginBottom: 12 }}>Archived Plans</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {archivedPlans.map((a) => {
          const weekStart = a?.plan?.weekStart || "(no start date)";
          const archivedAt = a?.archivedAt
            ? new Date(a.archivedAt).toLocaleString()
            : "(unknown time)";

          return (
            <li
              key={a.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 10,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 600, color: "#0f172a" }}>
                Week starting: {weekStart}
              </div>
              <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
                Archived on: {archivedAt}
              </div>

              {/* If you later want a details page, you can link here:
                 <Link to={`/archive/${a.id}`}>View details</Link>
               */}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
