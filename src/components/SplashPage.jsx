import React from 'react';

export default function SplashPage({ onEnter }) {
  return (
    <div className="splash">
      <div className="splash-bg" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="splash-particle" style={{
            left: `${(i * 37 + 11) % 100}%`,
            animationDelay: `${(i * 0.4) % 3}s`,
            animationDuration: `${3 + (i % 4)}s`,
          }} />
        ))}
      </div>

      <div className="splash-content">
        <div className="splash-logo">
          <span className="splash-logo-robo">Robo</span><span className="splash-logo-war">War</span>
        </div>
        <p className="splash-tagline">Program your robot. Enter the arena. Destroy all enemies.</p>

        <div className="splash-actions">
          <button className="splash-btn splash-btn-primary" onClick={onEnter}>
            <span className="splash-btn-icon">⚔</span>
            Enter the Arena
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <a
              className="splash-btn splash-btn-secondary"
              href="/programmer-guide.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="splash-btn-icon">📖</span>
              Programmer's Guide
            </a>
            <a
              href="/programmer-guide.html"
              download="RoboWar-Programmer-Guide.html"
              style={{ fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none', opacity: 0.7 }}
            >
              ⬇ download
            </a>
          </div>
        </div>

        <p className="splash-hint">
          New to RoboWar? Read the guide first — it covers the full instruction set,
          hardware system, and example programs.
        </p>

        <div className="splash-credits">
          <p>
            Original <em>RoboWar</em> created by <strong>Rod McFarland</strong> (1989–1994).
            Additional development by <strong>Peter Spear</strong> and the RoboWar community.
          </p>
          <p>
            Web version vibe coded in <strong>May 2026</strong> by <strong>Michael Morrow</strong> using{' '}
            <a
              className="splash-credit-link"
              href="https://claude.ai/code"
              target="_blank"
              rel="noopener noreferrer"
            >
              Claude Code
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}
