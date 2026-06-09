import React from 'react';
import { getUser, logout, isAdmin } from '../auth.js';

const LINKS = [
  { id: 'robots',      label: 'My Robots'   },
  { id: 'battle-setup',label: 'Battle'      },
  { id: 'tournament',  label: 'Tournament'  },
  { id: 'leaderboard', label: 'Leaderboard' },
];

export default function Nav({ page, navigate, onAuthChange }) {
  const user = getUser();
  const admin = isAdmin();

  async function handleLogout() {
    await logout();
    onAuthChange();
  }

  return (
    <nav className="nav">
      <span className="nav-brand">RoboWar</span>
      {LINKS.map(l => (
        <button
          key={l.id}
          className={`nav-btn${page === l.id ? ' active' : ''}`}
          onClick={() => navigate(l.id)}
        >
          {l.label}
        </button>
      ))}
      <div className="nav-docs-group">
        <a
          className="nav-docs-link"
          href="/programmer-guide.html"
          target="_blank"
          rel="noopener noreferrer"
          title="View Programmer's Guide"
        >
          📖 Docs
        </a>
        <a
          className="nav-docs-download"
          href="/programmer-guide.html?print=1"
          target="_blank"
          rel="noopener noreferrer"
          title="Download Programmer's Guide (PDF)"
        >
          ⬇
        </a>
      </div>
      <div className="nav-auth">
        {user ? (
          <>
            <span className="nav-user">👤 {user}</span>
            {admin && (
              <button className="nav-btn nav-admin" onClick={() => navigate('admin')}>Admin</button>
            )}
            <button className="nav-btn" onClick={() => navigate('account')}>Account</button>
            <button className="nav-btn" onClick={handleLogout}>Log Out</button>
          </>
        ) : (
          <button className="nav-btn" onClick={() => navigate('login')}>Log In</button>
        )}
      </div>
    </nav>
  );
}
