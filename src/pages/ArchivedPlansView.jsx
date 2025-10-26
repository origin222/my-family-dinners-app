// src/pages/ArchivedPlansView.jsx
import React from "react";
import { useMealPlan } from "../context/MealPlanContext";

export default function ArchivedPlansView() {
  const {
    archivedPlans = [],
    restoreArchivedPlan,
    clearAllArchives,
  } = useMealPlan();

  return (
    <div style={{ padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Archived Plans</h2>
        {archivedPlans.length > 0 && (
          <button
            onClick={clearAllArchives}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#f1f5f9",
              cursor: "pointer",
            }}
            title="Delete all archived plans"
          >
            Clear All
          </button>
        )}
      </div>

      <p style={{ color: "#64748b", marginTop: 8 }}>
        Note: Each week can be archived <strong>only once</strong> (based on the
        week’s start date).
      </p>

      {archivedPlans.length === 0 ? (
        <p style={{ color: "#64748b", marginTop: 12 }}>
          You don’t have any archived plans yet. Go to the Planner page and
          click <strong>“Archive Current Plan”</strong> to save your current
          week.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a" }}>
                      Week starting: {weekStart}
                    </div>
                    <div
                      style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}
                    >
                      Archived on: {archivedAt}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreArchivedPlan(a.id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#0ea5e9",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                    title="Restore this plan as the current week"
                  >
                    Restore
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
