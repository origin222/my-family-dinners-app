// src/app/Layout.jsx
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const linkStyle = ({ isActive }) => ({
  padding: '8px 12px',
  textDecoration: 'none',
  borderRadius: 8,
  color: isActive ? '#fff' : '#111',
  background: isActive ? '#0ea5e9' : 'transparent'
});

export default function Layout() {
  return (
    <div>
      <header style={{display:'flex', gap:12, alignItems:'center', padding:'10px 16px', borderBottom:'1px solid #eee'}}>
        <h1 style={{margin:0, fontSize:18}}>My Family Dinners</h1>
        <nav style={{display:'flex', gap:8, marginLeft:'auto'}}>
          <NavLink to="/" style={linkStyle} end>Home</NavLink>
          <NavLink to="/planner" style={linkStyle}>Planner</NavLink>
          <NavLink to="/archive" style={linkStyle}>Archive</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
