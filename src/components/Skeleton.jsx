// src/components/Skeleton.jsx
import React from 'react';

export default function Skeleton({ lines = 3 }) {
  return (
    <div style={{ padding: '1rem' }}>
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            margin: '10px 0',
            background: 'linear-gradient(90deg,#eee 25%,#f5f5f5 37%,#eee 63%)',
            backgroundSize: '400% 100%',
            borderRadius: 6,
            animation: 'skeleton 1.4s ease infinite'
          }}
        />
      ))}
      <style>{`
        @keyframes skeleton {
          0% { background-position: 100% 50%; }
          100% { background-position: 0 50%; }
        }
      `}</style>
    </div>
  );
}
