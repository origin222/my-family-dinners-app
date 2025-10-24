// src/components/RouteBoundary.jsx
import React from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';

export default function RouteBoundary({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
