// src/components/ErrorBoundary.jsx
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    // simple reload fallback
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#333',
          fontFamily: 'system-ui'
        }}>
          <h2>Something went wrong 😕</h2>
          <p style={{color:'#666'}}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: '1rem',
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #ccc',
              cursor: 'pointer'
            }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
