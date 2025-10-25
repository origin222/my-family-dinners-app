// src/pages/NotFound.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * NotFound.jsx
 * ------------
 * This page appears when a user visits a bad or missing URL.
 * It’s a friendly “404 Page Not Found” screen with a button to go back home.
 */
export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div
      style={{
        padding: "3rem 1rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2 style={{ fontSize: "2rem", color: "#0f172a" }}>Page Not Found</h2>

      <p style={{ color: "#475569", marginTop: "1rem" }}>
        We couldn’t find <code style={{ color: "#64748b" }}>{pathname}</code>
      </p>

      <Link
        to="/"
        style={{
          display: "inline-block",
          marginTop: "1.5rem",
          padding: "10px 20px",
          background: "#0ea5e9",
          color: "#fff",
          textDecoration: "none",
          borderRadius: "8px",
          fontWeight: "500",
        }}
      >
        Go Back Home
      </Link>
    </div>
  );
}
