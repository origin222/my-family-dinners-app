// src/pages/NotFound.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Page not found</h2>
      <p style={{ color: '#666' }}>
        We couldn’t find <code>{pathname}</code>.
      </p>
      <Link to="/" style={{
        display: 'inline-block', marginTop: '1rem', padding: '8px 16px',
        border: '1px solid #ccc', borderRadius: 6
      }}>
        Go Home
      </Link>
    </div>
  );
}
