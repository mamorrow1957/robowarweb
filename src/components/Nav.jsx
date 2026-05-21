import React from 'react';

const LINKS = [
  { id: 'robots',      label: 'My Robots'   },
  { id: 'battle-setup',label: 'Battle'      },
  { id: 'tournament',  label: 'Tournament'  },
  { id: 'leaderboard', label: 'Leaderboard' },
];

export default function Nav({ page, navigate }) {
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
    </nav>
  );
}
