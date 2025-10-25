// src/app/Layout.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useMealPlan } from "../context/MealPlanContext";
import RouteBoundary from "../components/RouteBoundary";

/**
 * Layout.jsx
 * -----------
 * This component wraps around every page in your app.
 * It shows the navigation bar at the top and the page content below it.
 * The <Outlet /> is where the current page (like Planner or Archive) appears.
 */
export default function Layout() {
  const { archivedPlans } = useMealPlan();
  const count = archivedPlans?.length || 0;

  // Styling for navigation links
  const linkStyle = ({ isActive }) => ({
    padding: "8px 12px",
    textDecoration: "none",
    borderRadius: 8,
    color: isActive ? "#fff" : "#111",
    background: isActive ? "#0ea5e9" : "transparent",
    transition: "background 0.3s",
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Navigation Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid #eee",
          background: "#f8fafc",
          position: "sticky",
          top: 0,
          zIndex: 1000,
        }}
      >
        {/* App Title */}
        <h1 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>My Family Dinners</h1>

        {/* Navigation Links */}
        <nav style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          <NavLink to="/" style={linkStyle} end>
            Home
          </NavLink>
          <NavLink to="/planner" style={linkStyle}>
            Planner
          </NavLink>
          <NavLink to="/archive" style={linkStyle}>
            Archive
            {/* Little counter for archived plans */}
            <span
              style={{
                marginLeft: 6,
                padding: "1px 6px",
                borderRadius: 999,
                fontSize: 12,
                background: "#111",
                color: "#fff",
              }}
            >
              {count}
            </span>
          </NavLink>
        </nav>
      </header>

      {/* Page Content Area */}
      <main style={{ flex: 1, background: "#fff" }}>
        {/* Wrap each page in its own small error boundary */}
        <RouteBoundary>
          <Outlet />
        </RouteBoundary>
      </main>

      {/* Simple footer (optional) */}
      <footer
        style={{
          textAlign: "center",
          padding: "1rem",
          borderTop: "1px solid #eee",
          background: "#f8fafc",
          color: "#64748b",
          fontSize: 14,
        }}
      >
        © {new Date().getFullYear()} My Family Dinners
      </footer>
    </div>
  );
}
