// src/app/Layout.jsx
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMealPlan } from '../context/MealPlanContext';
import RouteBoundary from '../components/RouteBoundary';

const linkStyle = ({ isActive }) => ({
  padding: '8px 12px',
  textDecoration: 'none',
  borderRadius: 8,
  color: isActive ? '#fff' : '#111',
  background: isActive ? '#0ea5e9' : 'transparent'
});

export default function Layout() {
  const { archivedPlans } = useMealPlan();
  const count = archivedPlans?.length || 0;

  return (
    <div>
      <header style={{display:'flex', gap:12, alignItems:'center', padding:'10px 16px', borderBottom:'1px solid #eee'}}>
        <h1 style={{margin:0, fontSize:18}}>My Family Dinners</h1>
        <nav style={{display:'flex', gap:8, marginLeft:'auto', alignItems:'center'}}>
          <NavLink to="/" style={linkStyle} end>Home</NavLink>
          <NavLink to="/planner" style={linkStyle}>Planner</NavLink>
          <NavLink to="/archive" style={linkStyle}>
            Archive
            <span style={{
              marginLeft:6, padding:'1px 6px', borderRadius:999,
              fontSize:12, background:'#111', color:'#fff'
            }}>{count}</span>
          </NavLink>
        </nav>
      </header>
      <main>
        {/* Route-level error isolation so only the page area shows fallback */}
        <RouteBoundary>
          <Outlet />
        </RouteBoundary>
      </main>
    </div>
  );
}
